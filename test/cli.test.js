import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
const run=args=>execFileSync(process.execPath,['bin/cascade.js',...args],{encoding:'utf8'});
test('CLI emits machine-readable comparison JSON',()=>{
  const r=JSON.parse(run(['--scenario','transient-errors','--compare','--seed','7','--format','json']));
  assert.equal(r.baseline.config.seed,7);assert.equal(r.candidate.config.seed,7);
  assert.ok(r.candidate.summary.succeeded>r.baseline.summary.succeeded);
});
test('CLI provides help and Markdown',()=>{
  assert.match(run(['--help']),/No network traffic/);
  assert.match(run(['--format','markdown']),/# Cascade Lab experiment/);
});
test('CLI rejects unknown arguments and missing values with a nonzero status',()=>{
  for(const args of [['--bogus'],['--seed'],['--seed','NaN'],['--scenario','missing'],['--format','yaml']]) {
    const p=spawnSync(process.execPath,['bin/cascade.js',...args],{encoding:'utf8'});
    assert.equal(p.status,1);assert.match(p.stderr,/cascade-lab:/);
  }
});
