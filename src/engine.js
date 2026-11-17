/** Deterministic, fixed-step queueing model. All time values are milliseconds. */
export const MODEL_VERSION = '1.0.0';
export const STEP = 25;
export const DEFAULTS = Object.freeze({
  duration: 60000, seed: 42, arrivalRate: 65, concurrency: 12,
  serviceTime: 120, queueCapacity: 80, timeout: 1200,
  faultStart: 15000, faultEnd: 32000, slowdown: 5, failureRate: 0,
  burstMultiplier: 1, retries: 3, retryDelay: 200, retryCap: 5000,
  policy: 'fixed', breaker: false, breakerThreshold: 0.5,
  breakerCooldown: 4000, rateLimit: 0,
});

const ranges = {
  duration: [1000, 120000], seed: [0, 4294967295], arrivalRate: [0, 400],
  concurrency: [1, 64], serviceTime: [25, 2000], queueCapacity: [0, 500],
  timeout: [50, 10000], faultStart: [0, 120000], faultEnd: [0, 120000],
  slowdown: [1, 20], failureRate: [0, 1], burstMultiplier: [1, 10],
  retries: [0, 8], retryDelay: [25, 10000], retryCap: [25, 20000],
  breakerThreshold: [0.1, 1], breakerCooldown: [100, 30000], rateLimit: [0, 400],
};
const integers = new Set(['duration','seed','concurrency','queueCapacity','retries']);
export function normalizeConfig(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Configuration must be an object.');
  for (const key of Object.keys(input)) if (!Object.hasOwn(DEFAULTS, key)) throw new Error(`Unknown setting: ${key}`);
  const c = { ...DEFAULTS, ...input };
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isFinite(c[key]) || c[key] < min || c[key] > max || (integers.has(key) && !Number.isInteger(c[key]))) {
      throw new Error(`${key} must be ${integers.has(key) ? 'an integer ' : ''}between ${min} and ${max}.`);
    }
  }
  if (!['none','fixed','exponential','jitter'].includes(c.policy)) throw new Error('Unknown retry policy.');
  if (typeof c.breaker !== 'boolean') throw new Error('breaker must be a boolean.');
  if (c.faultEnd < c.faultStart) throw new Error('faultEnd must be at least faultStart.');
  if (c.retryCap < c.retryDelay) throw new Error('retryCap must be at least retryDelay.');
  if (c.duration % STEP !== 0) throw new Error(`duration must be a multiple of ${STEP} ms.`);
  return c;
}

function random(seed) {
  return () => {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
// Keyed randomness keeps a job's service cost independent of retry scheduling.
function keyed(seed, id, attempt, salt) {
  return random((seed ^ Math.imul(id + 1, 0x45d9f3b) ^ Math.imul(attempt + 1, 0x27d4eb2d) ^ salt) >>> 0)();
}
export function retryWait(c, attempt, value) {
  if (c.policy === 'fixed') return c.retryDelay;
  const cap = Math.min(c.retryCap, c.retryDelay * 2 ** (attempt - 1));
  return c.policy === 'jitter' ? value * cap : cap;
}
function percentile(sorted, p) { return sorted.length ? sorted[Math.ceil(sorted.length * p) - 1] : null; }

/** Returns cumulative samples and completed-client latency; never makes network requests. */
export function simulate(input = {}) {
  const c = normalizeConfig(input);
  const rng = random(c.seed);
  const active = new Set();
  let queue = [], running = [], history = [], circuit = 'closed', openUntil = 0;
  let probe = null, circuitEpoch = 0, tokens = c.rateLimit;
  let nextArrival = 0, id = 0;
  const latencies = [], samples = [], events = [];
  const totals = { arrivals: 0, attempts: 0, backendCalls: 0, succeeded: 0, failed: 0,
    timeouts: 0, rejected: 0, shed: 0, shortCircuited: 0, serverErrors: 0,
    completedWork: 0, wastedWork: 0, maxQueue: 0 };
  const inFault = t => t >= c.faultStart && t < c.faultEnd;
  const rateAt = t => c.arrivalRate * (inFault(t) ? c.burstMultiplier : 1);
  // Inhomogeneous Poisson arrivals via thinning; independent of all policy randomness.
  const maxRate = c.arrivalRate * c.burstMultiplier;
  const gap = () => maxRate ? -Math.log(1 - rng()) * 1000 / maxRate : Infinity;
  nextArrival = gap();
  const transition = (state, t) => {
    circuit = state; circuitEpoch++;
    events.push({ time: t, type: `breaker-${state}` });
    if (state === 'open') { openUntil = t + c.breakerCooldown; probe = null; }
    if (state === 'closed') { history = []; probe = null; }
  };
  function outcome(at, ok, t) {
    if (!c.breaker || at.epoch !== circuitEpoch) return;
    if (circuit === 'half-open') {
      if (probe === at) transition(ok ? 'closed' : 'open', t);
      return;
    }
    if (circuit !== 'closed') return;
    history.push(ok); if (history.length > 20) history.shift();
    if (history.length >= 10 && history.filter(x => !x).length / history.length >= c.breakerThreshold) transition('open', t);
  }
  function fail(job, at, t, reason, countsForBreaker = true) {
    if (job.done || job.current !== at) return;
    at.expired = true; job.current = null;
    if (countsForBreaker) outcome(at, false, t);
    if (c.policy !== 'none' && job.tries <= c.retries) {
      job.next = t + Math.max(STEP, retryWait(c, job.tries, keyed(c.seed, job.id, job.tries, 9)));
    } else {
      job.done = true; totals.failed++; active.delete(job);
    }
    if (reason === 'timeout') totals.timeouts++;
  }
  function start(at, t) {
    at.started = t;
    const multiplier = inFault(t) ? c.slowdown : 1;
    const cost = c.serviceTime * (0.75 + keyed(c.seed, at.job.id, at.number, 13) * 0.5) * multiplier;
    at.finish = t + Math.ceil(cost / STEP) * STEP;
    at.error = inFault(t) && keyed(c.seed, at.job.id, at.number, 27) < c.failureRate;
    running.push(at);
  }
  function dispatch(job, t) {
    job.tries++; totals.attempts++;
    const at = { job, number: job.tries, deadline: t + c.timeout, expired: false, epoch: circuitEpoch };
    job.current = at;
    if (c.breaker && (circuit === 'open' || (circuit === 'half-open' && probe))) {
      totals.shortCircuited++; fail(job, at, t, 'breaker', false); return;
    }
    if (c.rateLimit && tokens < 1) {
      totals.shed++; fail(job, at, t, 'limit', false); return;
    }
    if (c.rateLimit) tokens--;
    if (c.breaker && circuit === 'half-open') probe = at;
    totals.backendCalls++;
    if (running.length < c.concurrency) start(at, t);
    else if (queue.length < c.queueCapacity) queue.push(at);
    else { totals.rejected++; fail(job, at, t, 'queue'); }
  }
  function snapshot(t) {
    samples.push({ time: t, ...totals, pending: active.size, queue: queue.length,
      busy: running.length, abandoned: running.filter(a => a.expired).length, circuit,
      capacity: 1000 * c.concurrency / (c.serviceTime * (inFault(t) ? c.slowdown : 1)) });
  }
  snapshot(0);
  for (let t = STEP; t <= c.duration; t += STEP) {
    if (c.rateLimit) tokens = Math.min(c.rateLimit, tokens + c.rateLimit * STEP / 1000);
    if (c.breaker && circuit === 'open' && t >= openUntil) transition('half-open', t);
    // Completion wins an exact tie with timeout. Expired server work still runs to completion.
    const completed = running.filter(a => a.finish <= t);
    running = running.filter(a => a.finish > t);
    for (const at of completed) {
      totals.completedWork++;
      if (at.expired || at.job.done || at.job.current !== at) { totals.wastedWork++; continue; }
      if (at.error) { totals.serverErrors++; fail(at.job, at, t, 'server'); }
      else {
        totals.succeeded++; at.job.done = true; at.job.current = null;
        active.delete(at.job); latencies.push(t - at.job.created); outcome(at, true, t);
      }
    }
    for (const job of active) if (job.current && job.current.deadline <= t) fail(job, job.current, t, 'timeout');
    queue = queue.filter(a => !a.expired && !a.job.done);
    while (queue.length && running.length < c.concurrency) start(queue.shift(), t);
    while (nextArrival <= t && nextArrival < c.duration) {
      const arrivalTime = nextArrival;
      nextArrival += gap();
      if (rng() > rateAt(arrivalTime) / maxRate) continue;
      const job = { id: id++, created: arrivalTime, tries: 0, next: t, current: null, done: false };
      active.add(job); totals.arrivals++;
    }
    for (const job of active) if (!job.current && job.next <= t) dispatch(job, t);
    totals.maxQueue = Math.max(totals.maxQueue, queue.length);
    if (t % 250 === 0 || t + STEP > c.duration) snapshot(t);
  }
  latencies.sort((a,b) => a-b);
  const last = samples.at(-1);
  return {
    modelVersion: MODEL_VERSION, config: c, samples, events,
    summary: { ...totals, pending: active.size, queue: last.queue, busy: last.busy,
      successRate: totals.arrivals ? totals.succeeded / totals.arrivals : 0,
      amplification: totals.arrivals ? totals.backendCalls / totals.arrivals : 0,
      p50: percentile(latencies, 0.5), p95: percentile(latencies, 0.95),
      wastedFraction: totals.completedWork ? totals.wastedWork / totals.completedWork : 0,
    },
  };
}

export function compare(config, overrides = {}) {
  const baseline = simulate(config);
  const candidate = simulate({ ...baseline.config, ...overrides });
  return { modelVersion: MODEL_VERSION, baseline, candidate };
}

export function markdownReport(result) {
  const paired = !!result.baseline;
  const a = paired ? result.baseline : result;
  const b = paired ? result.candidate : null;
  const rows = [
    ['Original requests', 'arrivals', x => x], ['Successful clients', 'succeeded', x => x],
    ['Failed clients', 'failed', x => x], ['Unfinished clients', 'pending', x => x],
    ['Success / all arrivals', 'successRate', x => `${(x*100).toFixed(1)}%`],
    ['Backend calls / arrivals', 'amplification', x => `${x.toFixed(2)}×`],
    ['Successful-client p95', 'p95', x => x === null ? '—' : `${Math.round(x)} ms`],
    ['Completed work after timeout', 'wastedWork', x => x],
    ['Peak queue', 'maxQueue', x => x],
  ];
  return `# Cascade Lab experiment\n\nModel ${MODEL_VERSION} · Seed ${a.config.seed} · ${a.config.duration/1000}s observation window\n\n` +
    `| Metric | Baseline |${b ? ' Candidate |' : ''}\n| --- | ---: |${b ? ' ---: |' : ''}\n` +
    rows.map(([label,key,fmt]) => `| ${label} | ${fmt(a.summary[key])} |${b ? ` ${fmt(b.summary[key])} |` : ''}`).join('\n') +
    '\n\nPending clients are unfinished at the observation boundary. Latency includes successful clients only. This is an educational model, not a production benchmark.\n\n```json\n' +
    JSON.stringify(b ? { baseline: a.config, candidate: b.config } : a.config, null, 2) + '\n```\n';
}
