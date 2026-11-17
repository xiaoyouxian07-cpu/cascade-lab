import { DEFAULTS, normalizeConfig, markdownReport } from './src/engine.js';
import { PRESETS } from './src/presets.js';

const $ = id => document.getElementById(id);
const zh = {
 local:'所有计算均在本机进行', model:'仿真原理', eyebrow:'分布式系统交互实验室', headline:'小小故障。<br><em>层层失控。</em>',
 lede:'破坏一个系统，改变一个决策，看看它如何恢复。<br>亲手理解重试、队列与熔断器。', note:'故障是模拟的。<br>直觉是真实的。',noapi:'无需 API 密钥 · 不发送真实流量',choose:'选择一种故障',conditions:'实验条件',reset:'重置 ↺',traffic:'流量与服务',arrivalRate:'每秒原始请求',concurrency:'工作线程数',serviceTime:'基础处理时间',queueCapacity:'基线队列容量',fault:'注入故障',slowdown:'处理时间倍数',burstMultiplier:'流量倍数',failureRate:'服务错误概率',candidate:'候选策略',policy:'重试策略',retries:'最大重试次数',retryDelay:'初始重试间隔',timeout:'单次尝试超时',candidateQueueCapacity:'候选队列容量',breaker:'熔断器',rateLimit:'准入速率上限',seed:'随机种子',paired:'两次实验使用相同的原始流量。策略参数只改变候选方案。',live:'系统回放',sameTraffic:'同样的流量，不同的结局。',clients:'客户端',admission:'准入控制',queue:'等待队列',workers:'工作线程',completed:'成功客户端',baseline:'基线',candidateName:'候选',abandoned:'超时后仍占用资源',scrub:'拖动时间线，查看故障过程。',pressure:'再试一次的代价',chartTitle:'后端请求压力',capacity:'理论容量',chartCaption:'每秒抵达后端的请求，包含队列满时的拒绝。阴影为故障区间。容量为近似值；请求处理时间存在波动。',readout:'实验解读',reproducible:'好的实验，应当可以复现。',share:'复制实验链接 ↗',export:'导出报告 ↓',configExport:'参数 ↓',configImport:'导入 ↑',events:'熔断状态变更日志',learn1Title:'重试，就是新增流量。',learn1:'服务过载时，再问一次可能让它更慢。退避留出恢复时间，随机抖动防止客户端同步重试。',learn2Title:'停止等待 ≠ 停止工作。',learn2:'客户端可以放弃等待，但请求依然占用服务器线程。条纹色块表示已经没人等待的工作。',learn3Title:'没有万能开关。',learn3:'熔断器通过拒绝请求保护依赖，也可能拒绝本来能成功的工作。需要同时比较成功、失败和未完成的请求。',footer:'帮助建立直觉，不用于生产容量规划。开源 · MIT。',assumptions:'阅读模型假设 ↗',modelTitle:'简化的模型，明确的假设。',
};
const en = Object.fromEntries([...document.querySelectorAll('[data-i18n]')].map(el => [el.dataset.i18n,el.innerHTML]));
let language = 'en', scenario = 'retry-storm', config = normalizeConfig(PRESETS[scenario].config), overrides = { ...PRESETS[scenario].candidate };
let result, position = 240, playing = false, lastFrame = 0, simulatedTime = 0, requestId = 0, debounce, toastTimer;
let worker;
const baseFields = ['arrivalRate','concurrency','serviceTime','queueCapacity','slowdown','burstMultiplier','failureRate','seed'];
const candidateFields = ['policy','retries','retryDelay','timeout','breaker','rateLimit','candidateQueueCapacity'];
const permittedOverrides = new Set(['policy','retries','retryDelay','retryCap','timeout','breaker','rateLimit','queueCapacity','breakerThreshold','breakerCooldown']);
const t = (a,b) => language === 'zh' ? b : a;
const fmt = n => Number(n).toLocaleString(language === 'zh' ? 'zh-CN' : 'en-US');
const pct = n => (n*100).toFixed(1) + '%';
function toast(message) { $('toast').textContent = message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4000); }
function renderLanguage() {
  document.documentElement.lang = language === 'zh' ? 'zh-CN' : 'en';
  document.querySelectorAll('[data-i18n]').forEach(el => { el.innerHTML = language === 'zh' ? zh[el.dataset.i18n] ?? en[el.dataset.i18n] : en[el.dataset.i18n]; });
  $('language').textContent = language === 'zh' ? 'EN' : '中文';
  [...$('policy').options].forEach((el,i) => { el.textContent = (language === 'zh' ? ['不重试','固定间隔','指数退避','指数退避 + 全抖动'] : ['No retries','Fixed delay','Exponential backoff','Exponential + full jitter'])[i]; });
  renderScenarios(); renderControls(); renderModel(); if (result) renderResults();
}
function renderScenarios() {
  $('scenarios').replaceChildren(...Object.entries(PRESETS).map(([key,p]) => {
    const button = document.createElement('button');
    button.innerHTML = `<span aria-hidden="true">${p.icon}</span>${language === 'zh' ? p.zh : p.name}`;
    button.setAttribute('aria-pressed', String(key === scenario));
    button.onclick = () => { scenario = key; config = normalizeConfig(p.config); overrides = {...p.candidate}; history.replaceState(null,'',location.pathname + location.search); renderScenarios(); renderControls(); run(); };
    return button;
  }));
  const descriptions = { 'retry-storm':'依赖变慢，客户端超时后重试，新请求开始与自己尚未完成的旧请求争夺资源。','flash-crowd':'发布活动期间流量翻倍。试试看：更长的等待队列，真的能增加系统容量吗？','slow-dependency':'超时时间比退化后的处理时间还短。客户端已放弃，旧请求却还在占用线程。','transient-errors':'服务随机报错，但处理速度正常。在这个场景里，适当重试确实有帮助。','healthy':'没有故障，容量充足。在增加保护机制之前，先看看正常情况下会发生什么。' };
  $('scenario-description').textContent = language === 'zh' ? descriptions[scenario] : PRESETS[scenario].description;
}
function outputValue(key, value) {
  if (key === 'rateLimit' && !value) return t('Off','关闭');
  if (['serviceTime','timeout','retryDelay'].includes(key)) return `${value} ms`;
  if (['arrivalRate','rateLimit'].includes(key)) return `${value} /s`;
  if (['slowdown','burstMultiplier'].includes(key)) return `${value}×`;
  if (key === 'failureRate') return `${Math.round(value*100)}%`;
  return String(value);
}
function renderControls() {
  const c = { ...config, ...overrides };
  for (const key of [...baseFields, ...candidateFields]) {
    const mapped = key === 'candidateQueueCapacity' ? 'queueCapacity' : key;
    const value = baseFields.includes(key) ? config[key] : c[mapped];
    if (key === 'breaker') $(key).checked = value;
    else {
      if ($(key).type === 'range') { $(key).min = Math.min(Number($(key).min), value); $(key).max = Math.max(Number($(key).max),value); $(key).step = 'any'; }
      $(key).value = value;
    }
    if ($(key+'-value')) $(key+'-value').textContent = outputValue(key,value);
  }
  document.querySelector('.fault-window').textContent = `${config.faultStart/1000}–${config.faultEnd/1000} s`;
}
function run() {
  playing = false; document.body.classList.add('busy'); $('run-state').textContent = t('Simulating…','计算中…');
  $('share').disabled = $('export').disabled = true;
  worker?.terminate();
  worker = new Worker(new URL('./src/worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = receive;
  worker.onerror = () => { document.body.classList.remove('busy'); toast(t('Simulation worker could not start. Serve this app with npm start.','计算线程无法启动，请通过 npm start 启动应用。')); };
  worker.postMessage({ id: ++requestId, config, overrides });
}
function receive({data}) {
  if (data.id !== requestId) return;
  document.body.classList.remove('busy'); $('share').disabled = $('export').disabled = false;
  if (data.error) { toast(data.error); return; }
  result = data.result; position = result.baseline.samples.length - 1;
  $('scrubber').max = position; $('scrubber').value = position;
  renderResults();
}
for (const key of [...baseFields,...candidateFields]) {
  $(key).addEventListener('input', () => {
    let value = key === 'breaker' ? $(key).checked : key === 'policy' ? $(key).value : Number($(key).value);
    if (key !== 'policy' && key !== 'breaker') {
      if (['seed','concurrency','queueCapacity','candidateQueueCapacity','retries'].includes(key)) value = Math.round(value);
      else if (key === 'failureRate') value = Math.round(value*100)/100;
      else if (key === 'burstMultiplier') value = Math.round(value*10)/10;
      else value = Math.round(value);
    }
    if (baseFields.includes(key)) config[key] = value;
    else overrides[key === 'candidateQueueCapacity' ? 'queueCapacity' : key] = value;
    if ($(key+'-value')) $(key+'-value').textContent = outputValue(key,value);
    clearTimeout(debounce); debounce = setTimeout(() => {
      try { normalizeConfig(config); normalizeConfig({...config,...overrides}); run(); }
      catch(error) { toast(error.message); }
    },120);
  });
}
$('controls-form').onsubmit = e => e.preventDefault();
function laneHTML(r, sample, candidate) {
  const slots = Math.min(r.config.concurrency,32);
  const busy = Math.ceil(sample.busy / r.config.concurrency * slots);
  const abandoned = Math.ceil(sample.abandoned / r.config.concurrency * slots);
  const cap = r.config.queueCapacity;
  const dots = Math.ceil(sample.queue / Math.max(1,cap) * 24);
  const circuit = r.config.breaker ? sample.circuit : 'off';
  const gate = r.config.breaker ? t(circuit,({closed:'闭合',open:'断开','half-open':'探测'})[circuit]) : t('direct','直连');
  const policyNames = {none:t('no retries','不重试'),fixed:t('fixed retries','固定重试'),exponential:t('backoff','指数退避'),jitter:t('full jitter','随机退避')};
  return `<div class="lane ${candidate ? 'candidate' : ''}"><div class="lane-name">${candidate ? t('B / CANDIDATE','B / 候选方案') : t('A / BASELINE','A / 基线方案')} <small>${policyNames[r.config.policy]} · ${r.config.timeout} ms · Q ${cap}</small></div><div class="lane-flow"><div class="flow-node"><strong>${fmt(sample.arrivals)}</strong><small>${t('arrived','已到达')}</small></div><div class="flow-node gate ${circuit === 'open' ? 'open' : ''}"><strong>${gate}</strong><small>${r.config.rateLimit ? r.config.rateLimit+'/s' : t('unlimited','不限速')}</small></div><div class="flow-node"><div class="queue-dots">${Array.from({length:24},(_,i)=>`<i class="${i<dots?'on':''}"></i>`).join('')}</div><small>${sample.queue} / ${cap}</small></div><div class="flow-node"><div class="worker-dots">${Array.from({length:slots},(_,i)=>`<i class="${i<abandoned?'abandoned':i<busy?'busy':''}"></i>`).join('')}</div><small>${sample.busy} / ${r.config.concurrency} ${t('busy','忙碌')}</small></div><div class="flow-node completed"><strong>${fmt(sample.succeeded)}</strong><small>${sample.failed} ${t('failed','失败')}</small></div></div></div>`;
}
function renderReplay() {
  const a = result.baseline.samples[position];
  const b = result.candidate.samples[Math.min(position,result.candidate.samples.length-1)];
  $('lanes').innerHTML = laneHTML(result.baseline,a,false) + laneHTML(result.candidate,b,true);
  $('clock').textContent = (a.time/1000).toFixed(2) + ' s';
  $('play').textContent = playing ? 'Ⅱ' : '▶'; $('play').setAttribute('aria-label',playing ? 'Pause simulation' : 'Play simulation');
  const fault = a.time >= config.faultStart && a.time < config.faultEnd;
  $('run-state').textContent = fault ? t('● FAULT ACTIVE','● 故障中') : a.time < config.faultStart ? t('● HEALTHY','● 正常运行') : t('● FAULT CLEARED','● 故障已解除');
  $('run-state').classList.toggle('fault',fault);
  const cursor = document.getElementById('chart-cursor');
  if(cursor) { const x=42+a.time/config.duration*710; cursor.setAttribute('x1',x);cursor.setAttribute('x2',x); }
}
function renderMetrics() {
  const a=result.baseline.summary,b=result.candidate.summary;
  const metric=(title,main,unit,av,bv,note)=>`<article class="metric"><h3>${title}</h3><div class="value">${main}<span>${unit}</span></div><p class="versus">A ${av} → <b>B ${bv}</b></p><p class="definition">${note}</p></article>`;
  $('metrics').innerHTML =
    metric(t('Client success','客户端成功率'),pct(b.successRate),'',pct(a.successRate),pct(b.successRate),t('Successes / all arrivals','成功数 / 原始请求数'))+
    metric(t('Backend amplification','后端请求放大'),b.amplification.toFixed(2),'×',a.amplification.toFixed(2)+'×',b.amplification.toFixed(2)+'×',t('Backend calls / original requests','抵达后端的次数 / 原始请求数'))+
    metric(t('Successful-client p95','成功客户端 p95'),b.p95 === null ? '—' : Math.round(b.p95),b.p95 === null ? '' : ' ms',a.p95 === null ? '—' : Math.round(a.p95)+'ms',b.p95 === null ? '—' : Math.round(b.p95)+'ms',t('End-to-end, successes only','端到端延迟，仅计算成功请求'))+
    metric(t('Wasted completions','无效完成数'),fmt(b.wastedWork),'',fmt(a.wastedWork),fmt(b.wastedWork),t('Server finishes after client timeout','客户端已超时，服务器仍完成处理'));
}
function renderChart() {
  const {baseline:a,candidate:b}=result;
  function rates(r) { return r.samples.map((s,i)=>{ const prev=r.samples[Math.max(0,i-4)];return {...s,rate:i?(s.backendCalls-prev.backendCalls)*1000/(s.time-prev.time):0}; }); }
  const aa=rates(a),bb=rates(b),max=Math.ceil(Math.max(10,...aa.map(s=>s.rate),...bb.map(s=>s.rate),...aa.map(s=>s.capacity))/50)*50;
  const x=t=>42+t/config.duration*710, y=n=>195-n/max*165;
  const path=(ss,key)=>ss.map((s,i)=>`${i?'L':'M'}${x(s.time).toFixed(2)},${y(s[key]).toFixed(2)}`).join(' ');
  const faultLeft=Math.min(config.duration,config.faultStart), faultRight=Math.min(config.duration,config.faultEnd);
  let svg=`<svg viewBox="0 0 775 230" role="img" aria-label="${t('Backend requests per second for baseline and candidate','基线和候选方案每秒抵达后端的请求数')}"><title>${t('Backend pressure over the observation window','观察时间窗内的后端压力')}</title><rect x="${x(faultLeft)}" y="17" width="${Math.max(0,x(faultRight)-x(faultLeft))}" height="178" fill="#e9ab8330"/><text x="${x(faultLeft)+7}" y="27" fill="#ac775b" font-size="8" font-family="monospace">${t('FAULT WINDOW','故障区间')}</text>`;
  for(let i=0;i<=4;i++) { const n=max*i/4;svg+=`<line x1="42" y1="${y(n)}" x2="752" y2="${y(n)}" stroke="#e2e3d9" stroke-dasharray="3 4"/><text x="34" y="${y(n)+3}" text-anchor="end" font-size="9" fill="#7c8274" font-family="monospace">${Math.round(n)}</text>`; }
  for(let i=0;i<=6;i++) svg+=`<text x="${42+i/6*710}" y="216" text-anchor="middle" font-size="9" fill="#7c8274" font-family="monospace">${Math.round(config.duration/1000*i/6)}s</text>`;
  svg+=`<path d="${path(aa,'capacity')}" fill="none" stroke="#939b7c" stroke-width="1.4" stroke-dasharray="5 5"/><path d="${path(aa,'rate')}" fill="none" stroke="#df6147" stroke-width="2" stroke-linejoin="round"/><path d="${path(bb,'rate')}" fill="none" stroke="#28786c" stroke-width="2" stroke-linejoin="round"/><line id="chart-cursor" x1="752" x2="752" y1="17" y2="195" stroke="#252b29" stroke-width="1" stroke-dasharray="2 3"/></svg>`;
  $('chart').innerHTML=svg;
}
function renderInsight() {
  const a=result.baseline.summary,b=result.candidate.summary;
  const delta=b.succeeded-a.succeeded,load=a.backendCalls?Math.round((1-b.backendCalls/a.backendCalls)*100):0;
  $('insight-title').textContent = load>5 ? t(`${load}% fewer backend calls. ${delta>=0?'+':''}${delta} successful clients.`,`后端请求减少 ${load}%，成功客户端${delta>=0?'增加':'减少'} ${Math.abs(delta)} 个。`) : delta>0 ? t(`${delta} more clients made it through.`,`${delta} 个额外客户端成功完成。`) : t('Read the tradeoff, not just the headline.','比较取舍，而不只看漂亮的数字。');
  $('insight-body').textContent = t(`At ${config.duration/1000}s: baseline ${a.succeeded} succeeded / ${a.failed} failed / ${a.pending} unfinished; candidate ${b.succeeded} / ${b.failed} / ${b.pending}. Candidate shed ${b.shed} attempts at the rate limiter and short-circuited ${b.shortCircuited}. A lower p95 can reflect refusing slow requests, not making every request faster.`,`在第 ${config.duration/1000} 秒：基线成功 ${a.succeeded} / 失败 ${a.failed} / 未完成 ${a.pending}；候选方案 ${b.succeeded} / ${b.failed} / ${b.pending}。候选限流拒绝 ${b.shed} 次尝试，熔断拒绝 ${b.shortCircuited} 次。p95 下降也可能来自拒绝了慢请求，并不代表所有请求都更快了。`);
}
function renderEvents() {
  const lines=[];
  for(const [label,r] of [['A',result.baseline],['B',result.candidate]]) for(const e of r.events) lines.push({...e,label});
  lines.sort((a,b)=>a.time-b.time);
  $('event-list').replaceChildren(...(lines.length?lines:[{empty:true}]).map(e=>{const div=document.createElement('div');div.textContent=e.empty?t('No circuit-breaker transitions.','没有熔断状态变更。'):`${(e.time/1000).toFixed(3).padStart(7)}s  ${e.label}  ${e.type}`;return div;}));
}
function renderResults() { renderMetrics(); renderChart(); renderReplay(); renderInsight(); renderEvents(); }
function frame(now) {
  if(playing && result) {
    simulatedTime += Math.min(100, now-lastFrame) * Number($('speed').value);
    const samples=result.baseline.samples;
    while(position<samples.length-1 && samples[position+1].time<=simulatedTime) position++;
    if(position===samples.length-1) playing=false;
    $('scrubber').value=position;renderReplay();
  }
  lastFrame=now;requestAnimationFrame(frame);
}
$('play').onclick=()=>{if(!result)return;if(position===result.baseline.samples.length-1)position=0;simulatedTime=result.baseline.samples[position].time;playing=!playing;renderReplay();};
$('scrubber').oninput=()=>{if(!result)return;playing=false;position=Number($('scrubber').value);renderReplay();};
$('language').onclick=()=>{language=language==='en'?'zh':'en';renderLanguage();};
$('reset').onclick=()=>{config=normalizeConfig(PRESETS[scenario].config);overrides={...PRESETS[scenario].candidate};renderControls();run();};
function experiment() { return { version:1, scenario, config:normalizeConfig(config), overrides:{...overrides} }; }
function loadExperiment(data) {
  if(data?.version!==1 || !Object.hasOwn(PRESETS,data.scenario)) throw new Error('Unsupported experiment format.');
  const checked=normalizeConfig(data.config);
  if(!data.overrides || typeof data.overrides!=='object' || Array.isArray(data.overrides)) throw new Error('Invalid strategy.');
  for(const key of Object.keys(data.overrides)) if(!permittedOverrides.has(key)) throw new Error(`Strategy cannot change ${key}.`);
  normalizeConfig({...checked,...data.overrides});
  scenario=data.scenario;config=checked;overrides={...data.overrides};
}
$('share').onclick=async()=>{
  try {const hash=encodeURIComponent(JSON.stringify(experiment()));const url=new URL(location.href);url.hash=hash;await navigator.clipboard.writeText(url.href);history.replaceState(null,'',url);toast(t('Experiment link copied. Local links need a local server.','实验链接已复制。本地链接需要运行本地服务。'));}
  catch(error){toast(t('Clipboard unavailable. Export the config to share this experiment.','剪贴板不可用。请导出参数文件来分享实验。'));}
};
function download(content,name,type) { const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000); }
$('export').onclick=()=>{if(result)download(markdownReport(result),'cascade-lab-report.md','text/markdown');};
$('export-config').onclick=()=>{try{download(JSON.stringify(experiment(),null,2),'cascade-lab-experiment.json','application/json');}catch(error){toast(error.message);}};
$('import-config').onclick=()=>$('import-file').click();
$('import-file').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>32000)throw new Error('Config must be smaller than 32 KB.');loadExperiment(JSON.parse(await file.text()));renderScenarios();renderControls();run();toast(t('Experiment imported.','实验已导入。'));}catch(error){toast(error.message);}e.target.value='';};
function renderModel() {
  $('model-content').innerHTML = language==='zh' ? `<h3>系统如何运行</h3><p>模型以 25 ms 为步长。原始请求来自泊松过程；每次尝试进入一个有界 FIFO 队列，由固定数量的工作线程处理。处理时间均匀分布在基础值的 75%–125%，再向上取整到步长。</p><h3>故障与超时</h3><p>故障区间内开始处理的工作受到变慢与随机报错影响。超时覆盖排队和处理时间；已经开始的工作不会被取消。等待队列中的过期尝试会移除。正好同一时刻完成的请求优先于超时。</p><h3>保护机制</h3><p>最多初始尝试加 N 次重试。全抖动在 0 到 min(上限, 初始间隔 × 2^(尝试次数−1)) 间均匀采样，最少等待一个步长。令牌桶容量等于每秒限额，初始装满。熔断器按最近 20 次结果计算，至少 10 次结果才判断；默认 50% 失败触发熔断，4 秒后只允许一个探测请求。</p><h3>如何理解数字</h3><p>统计在观察窗口结束时停止。未完成不等于失败。p95 只计算最终成功的客户端，包含其重试等待。放大倍数不计准入前限流和熔断拒绝。工作线程超过 32 个时，图标按比例展示。</p><h3>局限与参考</h3><p>模型仅有一个共享熔断器、一个依赖和单层重试。没有网络时延、CPU 竞争、分布式熔断器、幂等性或真实服务调用。用于学习，不能替代负载测试。</p><p><a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" target="_blank" rel="noreferrer">AWS Builders’ Library：超时、重试、退避与抖动 ↗</a></p>` : `<h3>How requests flow</h3><p>A 25 ms fixed-step model. Original requests follow a Poisson process. Attempts enter a bounded FIFO queue served by a fixed worker pool. Service times vary uniformly from 75%–125% of the base duration, rounded up to a tick.</p><h3>Faults and deadlines</h3><p>Work starting during the fault receives the slowdown and error probability. An attempt timeout covers queueing and service. Started work is never cancelled; expired queued attempts are removed. Completion wins an exact tie with timeout.</p><h3>Protection mechanisms</h3><p>At most one original attempt plus N retries. Full jitter samples uniformly from 0 to min(cap, delay × 2^(attempt−1)), with at least one tick of delay. The token bucket holds one second of quota and starts full. A shared circuit breaker observes the last 20 outcomes, requiring 10 before evaluation. Default: 50% failures opens it for 4 seconds, followed by one half-open probe.</p><h3>Reading the results</h3><p>Observation stops at the time boundary. Pending is not failed. p95 includes successful clients only, including their retry waits. Backend amplification excludes calls refused by the limiter or breaker. Above 32 workers, icons are proportional.</p><h3>Limits & further reading</h3><p>One shared breaker, one dependency, one retry layer. No network latency, CPU contention, distributed breakers, idempotency, or real service calls. This model teaches mechanisms; it does not replace load testing.</p><p><a href="https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/" target="_blank" rel="noreferrer">AWS Builders’ Library: timeouts, retries, backoff & jitter ↗</a></p>`;
}
for(const id of ['model-open','model-footer'])$(id).onclick=()=>$('model-dialog').showModal();
$('model-close').onclick=()=>$('model-dialog').close();
$('model-dialog').onclick=e=>{if(e.target===$('model-dialog')){const r=e.target.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)e.target.close();}};
try { if(location.hash && location.hash!=='#workspace') {if(location.hash.length>32000)throw new Error('Experiment link is too large.');loadExperiment(JSON.parse(decodeURIComponent(location.hash.slice(1))));} } catch(error){toast(error.message);}
renderLanguage();run();requestAnimationFrame(frame);
