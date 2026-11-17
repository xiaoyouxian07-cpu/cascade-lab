# Model 1.0.0

Cascade Lab is a deterministic, fixed-step queueing simulation. All time inputs are **milliseconds**. It is an educational model, not a production benchmark.

## Topology and time

`Poisson clients → shared breaker → token bucket → bounded FIFO queue → worker pool`

Time advances in 25 ms steps. At each step, in this order:

1. Replenish admission tokens and make an expired open circuit eligible for one probe.
2. Complete work whose finish time has arrived. A completed expired attempt counts as wasted work; its late result cannot finish the logical client or update the circuit.
3. Expire client attempts whose deadline has arrived. Remove expired attempts from the waiting queue. Work already running stays on its worker.
4. Fill free workers from the queue.
5. Add arrivals and dispatch due initial attempts and retries, in stable client insertion order.
6. Record a snapshot every 250 ms and at the final step.

Completion wins an exact tie with a timeout. A deadline includes both queue time and service time. A logical client can have only one current attempt, but abandoned attempts can still run on the server. There is no client cancellation signal at the server.

An arrival at a fractional time becomes eligible on the next tick. Finish times and retry scheduling round up to ticks. At least one tick passes before a retry, even when full jitter samples a near-zero delay. Duration must be a multiple of 25 ms. Arrivals at the right boundary are excluded; completions at that boundary are included. Pending clients are not drained after the observation window.

## Randomness

Original arrivals follow a piecewise constant Poisson process, implemented by thinning a stream at the maximum configured rate. The arrival RNG is seeded separately from policy and service decisions. Given the same seed and workload parameters, candidate and baseline get the same arrival times.

Service variation and server-error draws use a keyed random function of seed, logical client ID, attempt number, and purpose. The same attempt has the same base service cost across strategies. Its actual cost can differ if it starts in a different fault period. Jitter uses a separate purpose key.

This is pseudorandom determinism for demonstrations, not a cryptographic random generator. A seed is not a confidence interval; compare multiple seeds before generalizing.

## Faults

The interval is `[faultStart, faultEnd)`. Traffic inside it receives `burstMultiplier`. Work **starting service** inside it receives `slowdown` and the configured server-error probability. Work already running when a fault starts retains its original duration. Work started just before recovery retains its slow duration afterward. There is no extra network failure process.

Base service time is sampled uniformly from `0.75 × serviceTime` to `1.25 × serviceTime`, multiplied by the fault slowdown if applicable, then rounded up to a step. The dashed chart capacity, `1000 × concurrency / effective serviceTime`, is an idealized guide and excludes rounding overhead and distribution effects.

## Retries and admission

`retries` is the number of **additional** attempts. Attempt count starts at 1. All failure categories can retry: server errors, timeouts, queue-full rejection, limiter rejection, and open-circuit refusal. There is no logical-client global deadline. These choices are deliberate simplifications, not production retry advice.

| Policy | Delay after attempt k |
| --- | --- |
| none | Never retry |
| fixed | retryDelay |
| exponential | min(retryCap, retryDelay × 2^(k−1)) |
| jitter | Uniform draw from 0 to the exponential delay |

The token bucket starts full, holds `rateLimit` tokens, refills by `rateLimit / 1000` per ms, and charges one token per admitted attempt. `0` disables it. Retries consume quota. Refused calls count in attempts but never reach the backend.

The shared circuit breaker observes client-visible backend outcomes. Queue-full responses and timeouts are failures; limiter and circuit refusals do not feed it. It uses the most recent 20 outcomes and requires at least 10 before evaluating the failure threshold. Open circuits refuse requests. After cooldown, one half-open request can pass. A successful probe closes and clears history; failure opens another cooldown. Outcomes belonging to older circuit generations cannot accidentally close a newer half-open probe.

## Accounting

At every snapshot:

```text
arrivals = succeeded + failed + pending
attempts = backendCalls + shed + shortCircuited
queue <= queueCapacity
busy <= concurrency
abandoned <= busy
wastedWork <= completedWork
```

`failed` means the client exhausted its budget. `pending` includes queued, running, and sleeping-before-retry clients. It excludes clients whose budgets are exhausted, even if their abandoned work still runs. `backendCalls` includes queue-full rejections. Amplification can be below 1 when admission controls refuse original attempts.

`completedWork` includes both useful and late server completions. `wastedWork` is a **count of completions**, not CPU seconds or a percentage of all attempts. Work still running at the boundary is not a completion. `serverErrors` counts errors observed by a waiting client, not errors on abandoned work.

Latency is measured from original arrival to final success, including all attempt time and backoff. p50 and p95 use the nearest-rank method over successful clients. They are `null` when there are no successes. Never compare latency without success and pending counts: refusal can make a success-only percentile look better.

The chart uses a trailing one-second difference of cumulative backend calls (a shorter interval at the beginning). Replay changes the topology's current state; cards and the readout summarize the **whole observation window**.

## Configuration reference

| Setting | Default | Allowed range / meaning |
| --- | ---: | --- |
| duration | 60000 | 1000–120000 ms, integer multiple of 25 |
| seed | 42 | Integer 0–4294967295 |
| arrivalRate | 65 | 0–400 original clients/s |
| concurrency | 12 | 1–64 integer workers |
| serviceTime | 120 | 25–2000 ms |
| queueCapacity | 80 | 0–500 waiting slots, integer |
| timeout | 1200 | 50–10000 ms per attempt |
| faultStart | 15000 | 0–120000 ms |
| faultEnd | 32000 | faultStart–120000 ms |
| slowdown | 5 | 1–20 service-time multiplier |
| failureRate | 0 | 0–1 error probability during fault |
| burstMultiplier | 1 | 1–10 arrival-rate multiplier during fault |
| retries | 3 | 0–8 additional attempts, integer |
| retryDelay | 200 | 25–10000 ms |
| retryCap | 5000 | retryDelay–20000 ms |
| policy | fixed | none, fixed, exponential, jitter |
| breaker | false | Boolean, shared circuit breaker |
| breakerThreshold | 0.5 | 0.1–1 failure fraction |
| breakerCooldown | 4000 | 100–30000 ms |
| rateLimit | 0 | 0–400 admitted attempts/s; 0 disables |

Unknown settings and non-finite numbers are rejected. Browser controls expose a useful subset; exported/imported configs and the CLI expose the rest. Extreme configs can take longer to compute; the browser uses a replaceable worker so new runs cancel superseded computation.

## Out of scope

No TCP/network delay, CPU contention, distributed breakers, nested retries, service graph, request priorities, adaptive concurrency, server cancellation, idempotency, or write side effects. The model is not calibrated to a real system. Its purpose is to expose mechanisms and invite counterexamples.

References: [AWS Builders’ Library](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/), [AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/). These explain design concepts; they are not claims that this simulation predicts AWS behavior.
