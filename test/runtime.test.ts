import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fixture, goodModel } from './fixture.ts';
import { execute } from '../lib/runner.ts';
import { readRun } from '../lib/workspace.ts';
import { ROOT } from '../lib/config.ts';
import { settingsFor, promptFor } from '../lib/claude.ts';
import { runBounded } from '../lib/process.ts';
import { cleanEnv, commandFor } from '../lib/checks.ts';
import { checkComments, scanComments } from '../examples/preferences/readable-code/check-comments.ts';

test('the real CLI adapter uses separate build/review processes and structured review output', t => {
  const f = fixture(t);
  f.prepare();
  const cli = path.join(f.root, 'fake-claude');
  writeFileSync(cli, `#!${process.execPath}
import fs from 'node:fs';
const args=process.argv.slice(2);
const get=k=>args[args.indexOf(k)+1];
const settings=JSON.parse(get('--settings'));
if(!args.includes('--safe-mode') || settings.sandbox.failIfUnavailable!==true || settings.permissions.defaultMode!=='dontAsk' || get('--mcp-config')!=='{"mcpServers":{}}') process.exit(8);
if(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY || process.env.SSH_AUTH_SOCK) process.exit(9);
const review=args.includes('--json-schema');
if(review) {
  if(get('--tools').includes('Edit') || !get('-p').includes('Selected skill: code-review')) process.exit(10);
} else {
  if(!get('-p').includes('Selected skill: implement') || !get('-p').includes('Selected skill: tdd')) process.exit(11);
  fs.writeFileSync('src/calc.mjs','export const double = n => n * 2;\\n');
}
console.log(JSON.stringify({is_error:false,total_cost_usd:0.1,result:'Finished',structured_output:review?{standards:{passed:true,findings:[]},spec:{passed:true,findings:[]},summary:'Behavior checked',notVerified:[]}:undefined}));
`, { mode: 0o755 });
  const command = spawnSync(process.execPath, [path.join(ROOT,'harness.ts'),'run','--run',f.folder,'--execute'], {
    encoding: 'utf8', env: { ...process.env, HARNESS_CLAUDE_BIN: cli, ANTHROPIC_API_KEY: 'dummy', OPENAI_API_KEY: 'dummy', SSH_AUTH_SOCK: 'dummy' },
  });
  assert.equal(command.status, 0, command.stderr + command.stdout);
  assert.equal(JSON.parse(command.stdout).results[0].status, 'review_ready');
});

test('project configuration controls development networking and personal rules are optional', t => {
  const f = fixture(t, { project: { network: { allowedDomains: ['registry.example.invalid'], allowLocalBinding: true } } });
  f.prepare();
  const { inputs, state } = readRun(f.folder);
  const saved = { repo: path.join(f.folder, 'blocks/double'), base: state.base };
  const build = settingsFor(inputs,f.folder,saved,'build');
  const review = settingsFor(inputs,f.folder,saved,'review');
  assert.equal(build.sandbox.network.allowLocalBinding,true);
  assert.deepEqual(build.sandbox.network.allowedDomains,['registry.example.invalid']);
  assert.equal(build.sandbox.allowUnsandboxedCommands,false);
  assert.ok(build.sandbox.filesystem.allowRead.includes(path.dirname(path.dirname(process.execPath))));
  assert.ok(build.sandbox.filesystem.denyRead.includes('/home'));
  assert.ok(review.sandbox.filesystem.denyWrite.includes(saved.repo));
  assert.ok(!review.permissions.allow.some(p=>p.startsWith('Edit(')));
  assert.equal(inputs.preferences.settings.checks.length,0);
  const prompt = promptFor(inputs,f.folder,inputs.plan.blocks[0],saved,'review',{ passed: true, tree: 'fixture', errors: [], steps: [{ name: 'fixture', passed: true, output: 'x'.repeat(200000) }] });
  assert.ok(prompt.length<40000);
});

test('check environment drops inherited service credentials and paths are shell quoted', t => {
  const f = fixture(t);
  const prior = process.env.HARNESS_TEST_SECRET;
  process.env.HARNESS_TEST_SECRET = 'dummy';
  t.after(() => { if(prior===undefined) delete process.env.HARNESS_TEST_SECRET; else process.env.HARNESS_TEST_SECRET=prior; });
  assert.equal(cleanEnv(f.repo).HARNESS_TEST_SECRET,undefined);
  assert.ok(cleanEnv(f.repo).NPM_CONFIG_CACHE!.startsWith(f.repo+path.sep));
  assert.ok(cleanEnv(f.repo).NPM_CONFIG_USERCONFIG!.startsWith(f.repo+path.sep));
  assert.match(commandFor('echo {repo}', {repo:"/tmp/it's $(touch marker)",base:'x',folder:f.root}), /^echo '\/tmp\/it'"'"'s \$\(touch marker\)'$/);
});

test('failed setup stops before the model', t => {
  const f = fixture(t, { project: { setup: [{ name:'missing dependencies', command:'exit 7',timeoutMinutes:1 }] } });
  f.prepare();
  const result = execute(f.folder, { invoke: () => { throw Error('Must not be called'); } });
  assert.ok('reason' in result.results[0]);
  assert.equal(result.results[0].reason,'Dependency setup failed');
  assert.equal(result.state.spentUsd,0);
});

test('timeouts terminate ordinary descendant processes', async t => {
  const f = fixture(t);
  const marker = path.join(f.root,'escaped');
  const child = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'late'),600)`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'inherit'});setInterval(()=>{},1000)`;
  const result = runBounded(process.execPath,['-e',parent],{cwd:f.repo,timeoutMs:100});
  assert.match(result.error!.message,/timed out/);
  await new Promise(resolve=>setTimeout(resolve,700));
  assert.equal(existsSync(marker),false);
});

test('personal comment check catches the rejected headers, ignores code strings, and handles new files', t => {
  const f = fixture(t);
  const lines = [
    '/**',
    ' * The screen rules from screen-policy.md §4.3:',
    ' * Phase 2 follows the previous coding session.',
    ' */',
    'export const label = "docs/architecture.md";',
  ].join('\n');
  writeFileSync(path.join(f.repo,'src/new.ts'),lines);
  const findings = checkComments(f.repo,f.base);
  assert.ok(findings.some(f=>f.rule==='doc-reference'));
  assert.ok(findings.some(f=>f.rule==='session-reference'));
  assert.equal(scanComments('const text = "docs/architecture.md";','src/new.ts').length,0);
  assert.equal(scanComments('// Keep a manual grant when the store subscription expires.','src/new.ts').length,0);
  writeFileSync(path.join(f.repo,'src/new.ts'),'export const text = "a'+String.fromCodePoint(0x2014)+'b";');
  assert.ok(checkComments(f.repo,f.base).some(f=>f.rule==='em-dash'));
});

test('a selected personal check runs from its frozen copy', t => {
  const f = fixture(t);
  const preferences = path.join(ROOT,'examples/preferences/readable-code/preferences.json');
  f.args.preferences = preferences;
  f.prepare();
  const result = execute(f.folder, { invoke: call => {
    const response = goodModel(call);
    if(call.role==='build') writeFileSync(path.join(call.saved.repo,'src/calc.mjs'),'// Per the plan, double values.\nexport const double = n => n * 2;\n');
    return response;
  } });
  assert.equal(result.results[0].status,'failed');
  const evidence = JSON.parse(readFileSync(path.join(f.folder,'results/double/checks.json'), 'utf8'));
  assert.equal(evidence.steps[0].passed,true);
  assert.equal(evidence.steps[1].passed,false);
});
