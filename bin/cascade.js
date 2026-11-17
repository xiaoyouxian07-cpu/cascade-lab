#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { simulate, compare, markdownReport } from '../src/engine.js';
import { PRESETS } from '../src/presets.js';
const args = process.argv.slice(2);
try {
  let scenario = 'retry-storm', format = 'text', configFile, candidateFile, paired = false, seed;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--help' || arg === '-h') {
      console.log('Cascade Lab\n\nnode bin/cascade.js [--scenario NAME] [--compare] [--config FILE]\n  [--candidate FILE] [--seed NUMBER] [--format text|json|markdown]\n\nScenarios: ' + Object.keys(PRESETS).join(', ') + '\nNo network traffic is generated.'); process.exit(0);
    }
    if (arg === '--compare') { paired = true; continue; }
    if (!['--scenario','--format','--config','--candidate','--seed'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
    const value = args[++i]; if (!value || value.startsWith('--')) throw new Error(`Missing value for ${arg}`);
    if (arg === '--scenario') scenario = value;
    if (arg === '--format') format = value;
    if (arg === '--config') configFile = value;
    if (arg === '--candidate') { candidateFile = value; paired = true; }
    if (arg === '--seed') seed = Number(value);
  }
  if (!Object.hasOwn(PRESETS, scenario)) throw new Error(`Unknown scenario: ${scenario}`);
  if (!['text','json','markdown'].includes(format)) throw new Error(`Unknown format: ${format}`);
  const base = configFile ? JSON.parse(await readFile(configFile, 'utf8')) : PRESETS[scenario].config;
  const candidate = candidateFile ? JSON.parse(await readFile(candidateFile, 'utf8')) : PRESETS[scenario].candidate;
  const config = { ...base, ...(seed === undefined ? {} : { seed }) };
  const result = paired ? compare(config, candidate) : simulate(config);
  if (format === 'json') console.log(JSON.stringify(result, null, 2));
  else if (format === 'markdown') console.log(markdownReport(result));
  else {
    console.log(`\nCASCADE LAB / ${scenario} / seed ${config.seed ?? 42}\n`);
    for (const [label, r] of paired ? [['Baseline',result.baseline],['Candidate',result.candidate]] : [['Result',result]]) {
      const s = r.summary;
      console.log(`${label}: ${(s.successRate*100).toFixed(1)}% successful | ${s.amplification.toFixed(2)}x backend load | p95 ${s.p95 === null ? 'n/a' : Math.round(s.p95)+'ms'}\n  ${s.succeeded} succeeded, ${s.failed} failed, ${s.pending} pending; ${s.wastedWork} wasted completions.`);
    }
    console.log('\nEducational model. Latency is for successful clients only.');
  }
} catch (error) { console.error(`cascade-lab: ${error.message}`); process.exitCode = 1; }
