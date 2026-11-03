import type { TestContext } from 'node:test';
import type { Checks, Flags, NativePlan } from '../lib/types.ts';
import type { FixtureOptions } from './fixture.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fixture, passedReview } from './fixture.ts';
import { nativeCommand, prepareNative, readNative } from '../lib/native.ts';
import { saveState } from '../lib/workspace.ts';
import { report } from '../lib/report.ts';
import { git } from '../lib/git.ts';
import { startReviewServer } from '../lib/review-server.ts';
import { feedbackCommand } from '../lib/feedback.ts';
import { ROOT } from '../lib/config.ts';

function nativeFixture(t: TestContext, options: FixtureOptions = {}, nativePlan: Partial<NativePlan> = {}) {
  const f = fixture(t, options);
  const plan = { version: 1, name: 'Example project', stopAt: new Date(Date.now() + 3600000).toISOString(), finalReviewAt: new Date(Date.now() + 3000000).toISOString(), maxRepairPasses: 2, repairMinutes: 45, blocks: [{ id: 'double', title: 'Double a value', paths: ['src/'], dependsOn: [], design: { summary: 'Preserve the public function and keep calculation in one place.', components: [{ label: 'Calculation', owns: 'The doubling rule' }] } }] };
  Object.assign(plan, nativePlan);
  writeFileSync(path.join(f.task, 'NATIVE.json'), JSON.stringify(plan));
  const preview = prepareNative(f.args);
  prepareNative({ ...f.args, approve: preview.approvalHash });
  const command = (action: string, extra: Flags = {}) => nativeCommand({ run: f.folder, block: 'double', actor: 'lead', action, ...extra });
  function status() {
    const result = command('status');
    assert.ok('reviewReady' in result);
    return result;
  }
  function check(action = 'check'): { checks: Checks } {
    const result = command(action);
    assert.ok('checks' in result && result.checks && !Array.isArray(result.checks));
    return { checks: result.checks };
  }
  function submit(evidence: { checks: Checks }, { final = false, review = passedReview(), actor = 'reviewer' } = {}) {
    const input = path.join(f.root, 'review.json');
    writeFileSync(input, JSON.stringify({ tree: evidence.checks.tree, review }));
    const result = command(final ? 'final-review' : 'review', { actor, input });
    assert.ok('status' in result);
    return result;
  }
  function build() {
    command('claim', { actor: 'builder' });
    writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
    const result = check();
    submit(result);
    return result;
  }
  return { ...f, command, status, check, submit, build };
}

test('native mode checks real source, requires final review and preserves notes across reports', t => {
  const f = nativeFixture(t);
  f.build();
  assert.equal(f.status().reviewReady, false);
  const final = f.check('final-check');
  f.submit(final, { final: true, actor: 'final-reviewer' });
  assert.equal(f.status().reviewReady, true);
  writeFileSync(path.join(f.folder, 'NOTES.md'), 'Keep this owner correction.');
  report(f.folder);
  report(f.folder);
  assert.equal(readFileSync(path.join(f.folder, 'NOTES.md'), 'utf8'), 'Keep this owner correction.');
  assert.match(readFileSync(path.join(f.folder, 'REVIEW.html'), 'utf8'), /Ready for your review/);
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 3;\n');
  assert.equal(f.status().reviewReady, false);
});

test('native review rejects builder identity, missing evidence and stale source', t => {
  const f = nativeFixture(t);
  f.command('claim', { actor: 'builder' });
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
  const checks = f.check();
  assert.throws(() => f.submit(checks, { actor: 'builder' }), /separate reviewer/);
  assert.equal(f.submit(checks, { review: { ...passedReview(), notVerified: ['Required interaction unavailable'] } }).status, 'needs-repair');
  f.command('repair', { actor: 'replacement-builder' });
  const again = f.check();
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 3;\n');
  assert.equal(f.submit(again).status, 'needs-repair');
});

test('native recovery preserves counters and absolute deadlines, including a dead helper lock', t => {
  const f = nativeFixture(t);
  f.command('claim', { actor: 'builder' });
  const original = readNative(f.folder).state.deadline;
  writeFileSync(path.join(f.folder, 'run.lock'), JSON.stringify({ pid: 2147483647 }));
  f.command('recover', { reason: 'The previous worker stopped; its source was inspected.' });
  f.command('repair', { actor: 'replacement' });
  f.command('recover', { reason: 'Replacement stopped; preserved all changes.' });
  f.command('repair', { actor: 'last-builder' });
  f.command('recover', { reason: 'Last worker stopped.' });
  assert.throws(() => f.command('repair'), /pass limit/);
  assert.equal(readNative(f.folder).state.deadline, original);
  assert.equal(readNative(f.folder).state.blocks.double.repairAttempts, 2);
});

test('native deadlines stop new work while preserving final review time', t => {
  const f = nativeFixture(t);
  f.build();
  const { state } = readNative(f.folder);
  state.implementationDeadline = Date.now() - 1;
  saveState(f.folder, state);
  assert.throws(() => f.command('claim'), /Implementation window ended/);
  assert.equal(f.check('final-check').checks.passed, true);
  state.deadline = Date.now() - 1;
  saveState(f.folder, state);
  assert.throws(() => f.check('final-check'), /Run deadline/);
});

test('native source and scratch handling works in a Git worktree', t => {
  const f = fixture(t);
  const worktree = path.join(f.root, 'worktree');
  git(f.repo, ['worktree', 'add', '--detach', worktree, f.base]);
  const project = JSON.parse(readFileSync(f.projectFile, 'utf8'));
  project.repo = worktree;
  writeFileSync(f.projectFile, JSON.stringify(project));
  writeFileSync(path.join(f.task, 'NATIVE.json'), JSON.stringify({ version: 1, name: 'Worktree', stopAt: new Date(Date.now()+3600000).toISOString(), finalReviewAt: new Date(Date.now()+3000000).toISOString(), blocks: [{ id: 'double', title: 'Double', paths: ['src/'], dependsOn: [], design: { summary: 'Use existing function.' } }] }));
  prepareNative({ ...f.args, approve: prepareNative(f.args).approvalHash });
  const flags = { run: f.folder, actor: 'builder', block: 'double' };
  nativeCommand({ ...flags, action: 'claim' });
  writeFileSync(path.join(worktree, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
  const result = nativeCommand({ ...flags, action: 'check' });
  assert.ok('checks' in result && result.checks && !Array.isArray(result.checks));
  assert.equal(result.checks.passed, true);
  assert.equal(existsSync(path.join(worktree, '.harness-tmp')), false);
  assert.equal(readFileSync(path.join(f.repo, 'src/calc.mjs'), 'utf8'), 'export const double = n => n;\n');
});

test('different projects keep rules, notes and run state separate with no fallback project', t => {
  const a = nativeFixture(t, { extraFiles: { 'RULES.md': 'Project alpha rules.' } });
  const b = nativeFixture(t, { extraFiles: { 'RULES.md': 'Project beta rules.' } });
  a.command('claim', { actor: 'alpha-builder' });
  assert.deepEqual(readNative(b.folder).state.blocks, {});
  assert.equal(readNative(a.folder).inputs.instructions['RULES.md'], 'Project alpha rules.');
  assert.equal(readNative(b.folder).inputs.instructions['RULES.md'], 'Project beta rules.');
  assert.deepEqual(readNative(b.folder).inputs.preferences.files, {});
  assert.throws(() => prepareNative({ task: b.task, folder: path.join(b.root, 'other') }), /--project/);
});

test('native claims prevent overlapping writers and block dependents until acceptance', t => {
  const blocks = [
    { id: 'double', title: 'First', paths: ['src/'], dependsOn: [], design: { summary: 'Existing function.' } },
    { id: 'second', title: 'Next', paths: ['src/'], dependsOn: ['double'], design: { summary: 'Existing function.' } },
  ];
  const f = nativeFixture(t, {}, { blocks });
  assert.throws(() => f.command('claim', { block: 'second' }), /dependencies/);
  f.command('claim', { actor: 'builder' });
  assert.throws(() => f.command('claim', { block: 'second', actor: 'other-builder' }), /owns the checkout/);
  writeFileSync(path.join(f.repo, 'outside.mjs'), 'Unexpected change');
  assert.throws(() => f.check(), /Outside allowed scope/);
  assert.equal(f.status().reviewReady, false);
});

test('a frozen helper remains usable when a different harness version is selected', t => {
  const f = nativeFixture(t);
  const runtime = path.join(f.folder, 'runtime');
  const future = path.join(f.root, 'future-runtime');
  cpSync(runtime, future, { recursive: true });
  writeFileSync(path.join(future, 'lib/quality.ts'), readFileSync(path.join(future, 'lib/quality.ts'), 'utf8') + '\n');
  const run = (dir: string) => spawnSync(process.execPath, [path.join(dir, 'harness.ts'), 'native', '--action', 'status', '--run', f.folder], { encoding: 'utf8' });
  assert.notEqual(run(future).status, 0);
  assert.match(run(future).stderr, /Harness changed/);
  assert.equal(run(runtime).status, 0);
});

test('a frozen TypeScript helper runs checks without dependencies under a CommonJS parent', t => {
  const f = fixture(t);
  writeFileSync(path.join(f.root, 'package.json'), JSON.stringify({ type: 'commonjs' }));
  f.args.preferences = path.join(ROOT, 'examples/preferences/readable-code/preferences.json');
  writeFileSync(path.join(f.task, 'NATIVE.json'), JSON.stringify({
    version: 1, name: 'Standalone runtime',
    stopAt: new Date(Date.now() + 3600000).toISOString(),
    finalReviewAt: new Date(Date.now() + 3000000).toISOString(),
    blocks: [{ id: 'double', title: 'Double', paths: ['src/'], dependsOn: [], design: { summary: 'Use the existing function.' } }],
  }));
  const prepared = prepareNative({ ...f.args, approve: prepareNative(f.args).approvalHash });
  assert.ok(prepared.helper);
  assert.equal(existsSync(path.join(f.folder, 'runtime', 'node_modules')), false);
  const run = (action: string) => spawnSync(process.execPath, [
    prepared.helper, 'native', '--action', action, '--run', f.folder,
    '--block', 'double', '--actor', 'builder',
  ], { encoding: 'utf8' });
  assert.equal(run('claim').status, 0);
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = value => value * 2;\n');
  const checked = run('check');
  assert.equal(checked.status, 0, checked.stderr);
  assert.equal(JSON.parse(checked.stdout).checks.passed, true);
  assert.deepEqual(readNative(f.folder).state.blocks.double.checks?.steps.map(step => step.name), ['behavior', 'personal-comments']);
});

test('served notes survive regeneration and restart, reject conflicting writes, and preserve reading position', async t => {
  const f = nativeFixture(t);
  f.build();
  const { server, url } = await startReviewServer(f.folder);
  t.after(() => server.close());
  const post = (route: string, value: unknown) => fetch(url+route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  const original = await (await fetch(url+'owner')).json();
  assert.equal((await post('notes', { revision: original.revision, text: 'My important correction.' })).status, 200);
  assert.equal((await post('notes', { revision: original.revision, text: '' })).status, 409);
  writeFileSync(path.join(f.folder, 'notes.lock'), JSON.stringify({ pid: 2147483647 }));
  const held = await (await fetch(url+'owner')).json();
  assert.equal((await post('notes', { revision: held.revision, text: held.text })).status, 200);
  await post('view', { scrollY: 543, open: ['detail-double'] });
  report(f.folder);
  const saved = await (await fetch(url+'owner')).json();
  assert.equal(saved.text, 'My important correction.');
  assert.equal(saved.view.scrollY, 543);
  await new Promise(resolve => server.close(resolve));
  const second = await startReviewServer(f.folder);
  t.after(() => second.server.close());
  const reopened = await (await fetch(second.url+'owner')).json();
  assert.equal(reopened.text, saved.text);
  assert.deepEqual(reopened.view.open, ['detail-double']);
});

test('review links open exact source lines and refuse arbitrary paths or cross-origin writes', async t => {
  const f = nativeFixture(t);
  f.build();
  const { server, url } = await startReviewServer(f.folder);
  t.after(() => server.close());
  const links = JSON.parse(readFileSync(path.join(f.folder, 'evidence-map.json'), 'utf8')) as Record<string, string>;
  const key = Object.keys(links).find(key => links[key].endsWith('/src/calc.mjs'));
  assert.ok(key);
  const response = await fetch(url+'evidence/'+key);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /id="L1"/);
  assert.equal((await fetch(url+'evidence/../../etc/passwd')).status, 404);
  assert.equal((await fetch(url+'notes', { method: 'POST', headers: { Origin: 'https://untrusted.invalid', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
});

test('feedback keeps immutable before/after examples and never promotes a rule automatically', t => {
  const f = nativeFixture(t);
  f.build();
  const input = path.join(f.root, 'feedback.json');
  writeFileSync(input, JSON.stringify({ id: 'clear-name', block: 'double', files: ['src/calc.mjs'], criticism: 'Use a descriptive parameter.', principle: 'Names should identify the input.', scope: 'personal' }));
  feedbackCommand({ run: f.folder, action: 'capture', input });
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = value => value * 2;\n');
  writeFileSync(input, JSON.stringify({ id: 'clear-name', accepted: true }));
  assert.throws(() => feedbackCommand({ run: f.folder, action: 'accept', input }), /actual owner acceptance/);
  writeFileSync(input, JSON.stringify({ id: 'clear-name', accepted: true, ownerStatement: 'This is the version I want.' }));
  const accepted = feedbackCommand({ run: f.folder, action: 'accept', input });
  assert.ok('policyChanged' in accepted);
  assert.equal(accepted.policyChanged, false);
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'Later work');
  assert.match(readFileSync(path.join(f.folder, 'feedback/clear-name/before/source/src/calc.mjs'), 'utf8'), /n =>/);
  assert.match(readFileSync(path.join(f.folder, 'feedback/clear-name/after/source/src/calc.mjs'), 'utf8'), /value =>/);
  const exported = feedbackCommand({ run: f.folder, action: 'export', folder: path.join(f.root, 'benchmark') });
  assert.ok('cases' in exported && typeof exported.labels === 'string');
  assert.equal(exported.cases, 2);
  assert.ok(exported.labels.includes('/private/'));
});
