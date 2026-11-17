import test from 'node:test';
import assert from 'node:assert/strict';
import { simulate, compare, normalizeConfig, retryWait, markdownReport } from '../src/engine.js';
import { PRESETS } from '../src/presets.js';

test('identical seed and config reproduce the complete result',()=>{
  assert.deepEqual(simulate(),simulate());
  assert.notDeepEqual(simulate({seed:1}).samples,simulate({seed:2}).samples);
});
test('paired strategies see identical arrival counts at every observation',()=>{
  for(const p of Object.values(PRESETS)) {
    const {baseline:a,candidate:b}=compare(p.config,p.candidate);
    assert.deepEqual(a.samples.map(x=>x.arrivals),b.samples.map(x=>x.arrivals));
  }
});
test('zero traffic produces finite, empty results, including a null latency',()=>{
  const r=simulate({arrivalRate:0});
  assert.equal(r.summary.arrivals,0);assert.equal(r.summary.p95,null);
  assert.equal(r.summary.amplification,0);assert.equal(r.summary.successRate,0);
});
test('requests are conserved; queues and workers respect bounds over seeds and policies',()=>{
  for(const seed of [0,1,42,2026,4294967295]) for(const policy of ['none','fixed','exponential','jitter']) {
    const r=simulate({seed,policy,arrivalRate:130,breaker:seed%2===1,rateLimit:seed%2?80:0});
    for(const s of r.samples) {
      assert.equal(s.arrivals,s.succeeded+s.failed+s.pending);
      assert.ok(s.queue<=r.config.queueCapacity && s.queue>=0);
      assert.ok(s.busy<=r.config.concurrency && s.busy>=0);
      assert.ok(s.abandoned<=s.busy);
      assert.ok(s.wastedWork<=s.completedWork);
      assert.ok(s.attempts<=s.arrivals*(r.config.policy==='none'?1:r.config.retries+1));
      assert.equal(s.attempts,s.backendCalls+s.shed+s.shortCircuited);
    }
  }
});
test('without faults, spare capacity delivers all settled clients without failures',()=>{
  const r=simulate({arrivalRate:10,slowdown:1,queueCapacity:100});
  assert.equal(r.summary.failed,0);assert.equal(r.summary.timeouts,0);
  assert.equal(r.summary.amplification,1);assert.equal(r.summary.wastedWork,0);
});
test('client timeout does not cancel running server work',()=>{
  const r=simulate({duration:10000,arrivalRate:30,concurrency:1,serviceTime:1000,timeout:50,policy:'none',slowdown:1});
  assert.ok(r.samples.some(s=>s.abandoned>0));assert.ok(r.summary.wastedWork>0);
  assert.equal(r.summary.succeeded,0);
  assert.ok(r.summary.completedWork<=10);
});
test('zero-capacity queue rejects when all workers are busy',()=>{
  const r=simulate({arrivalRate:200,concurrency:1,queueCapacity:0,policy:'none'});
  assert.ok(r.summary.rejected>0);assert.ok(r.samples.every(s=>s.queue===0));
});
test('circuit breaker opens, probes, and closes after recovery',()=>{
  const r=simulate({arrivalRate:35,slowdown:1,failureRate:1,breaker:true});
  assert.ok(r.events.some(e=>e.type==='breaker-open'));
  assert.ok(r.events.some(e=>e.type==='breaker-half-open'));
  assert.ok(r.events.some(e=>e.type==='breaker-closed' && e.time>r.config.faultEnd));
  assert.ok(r.summary.shortCircuited>0);
});
test('token-bucket admission is bounded by initial burst plus replenishment',()=>{
  const r=simulate({arrivalRate:200,rateLimit:10});
  for(const s of r.samples) assert.ok(s.backendCalls<=10+10*s.time/1000+1e-8);
  assert.ok(r.summary.shed>0);
});
test('retry policies respect exponential cap and full jitter bounds',()=>{
  const c=normalizeConfig({policy:'exponential',retryDelay:100,retryCap:500});
  assert.equal(retryWait(c,1,0.5),100);assert.equal(retryWait(c,8,0.5),500);
  c.policy='jitter';assert.equal(retryWait(c,8,0),0);assert.equal(retryWait(c,8,0.99),495);
});
test('retrying transient failures improves completions but costs backend work',()=>{
  const p=PRESETS['transient-errors'],r=compare(p.config,p.candidate);
  assert.ok(r.candidate.summary.succeeded>r.baseline.summary.succeeded);
  assert.ok(r.candidate.summary.backendCalls>r.baseline.summary.backendCalls);
});
test('slowdown reduces completion capacity and increases contention',()=>{
  const c={arrivalRate:100,policy:'none',faultStart:0,faultEnd:60000};
  assert.ok(simulate({...c,slowdown:1}).summary.succeeded>simulate({...c,slowdown:5}).summary.succeeded);
});
test('invalid and surprising configurations fail closed',()=>{
  for(const c of [{seed:-1},{seed:NaN},{arrivalRate:Infinity},{concurrency:0},{concurrency:1.5},{breaker:'yes'},{policy:'random'},{duration:999},{faultStart:100,faultEnd:50},{retryDelay:1000,retryCap:100},{surprise:4},null,[]]) assert.throws(()=>simulate(c));
});
test('input objects are not mutated and reports include reproducible configs',()=>{
  const c=Object.freeze({seed:10}),r=compare(c,Object.freeze({policy:'jitter'}));
  assert.deepEqual(c,{seed:10});const report=markdownReport(r);
  assert.match(report,/"seed": 10/);assert.match(report,/Unfinished clients/);assert.match(report,/successful clients only/);
});
