import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fixture, passedReview } from './fixture.mjs';
import { nativeCommand, prepareNative, readNative } from '../lib/native.mjs';
import { saveState } from '../lib/workspace.mjs';
import { report } from '../lib/report.mjs';
import { git } from '../lib/git.mjs';
import { startReviewServer } from '../lib/review-server.mjs';
import { feedbackCommand } from '../lib/feedback.mjs';

function nativeFixture(t, options, nativePlan = {}) {
  const f = fixture(t, options);
  const plan = { version: 1, name: 'Example project', stopAt: new Date(Date.now() + 3600000).toISOString(), finalReviewAt: new Date(Date.now() + 3000000).toISOString(), maxRepairPasses: 2, repairMinutes: 45, blocks: [{ id: 'double', title: 'Double a value', paths: ['src/'], dependsOn: [], design: { summary: 'Preserve the public function and keep calculation in one place.', components: [{ label: 'Calculation', owns: 'The doubling rule' }] } }] };
  Object.assign(plan, nativePlan);
  writeFileSync(path.join(f.task, 'NATIVE.json'), JSON.stringify(plan));
  const preview = prepareNative(f.args);
  prepareNative({ ...f.args, approve: preview.approvalHash });
  const command = (action, extra = {}) => nativeCommand({ run: f.folder, block: 'double', actor: 'lead', action, ...extra });
  function submit(result, { final = false, review = passedReview(), actor = 'reviewer' } = {}) {
    const input = path.join(f.root, 'review.json');
    writeFileSync(input, JSON.stringify({ tree: result.checks.tree, review }));
    return command(final ? 'final-review' : 'review', { actor, input });
  }
  function build() {
    command('claim', { actor: 'builder' });
    writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
    const result = command('check');
    submit(result);
    return result;
  }
  return { ...f, command, submit, build };
}

test('native mode checks real source, requires final review and preserves notes across reports', t => {
  const f = nativeFixture(t);
  f.build();
  assert.equal(f.command('status').reviewReady, false);
  const final = f.command('final-check');
  f.submit(final, { final: true, actor: 'final-reviewer' });
  assert.equal(f.command('status').reviewReady, true);
  writeFileSync(path.join(f.folder, 'NOTES.md'), 'Keep this owner correction.');
  report(f.folder);
  report(f.folder);
  assert.equal(readFileSync(path.join(f.folder, 'NOTES.md'), 'utf8'), 'Keep this owner correction.');
  assert.match(readFileSync(path.join(f.folder, 'REVIEW.html'), 'utf8'), /Ready for your review/);
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 3;\n');
  assert.equal(f.command('status').reviewReady, false);
});

test('native review rejects builder identity, missing evidence and stale source', t => {
  const f = nativeFixture(t);
  f.command('claim', { actor: 'builder' });
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
  const checks = f.command('check');
  assert.throws(() => f.submit(checks, { actor: 'builder' }), /separate reviewer/);
  assert.equal(f.submit(checks, { review: { ...passedReview(), notVerified: ['Required interaction unavailable'] } }).status, 'needs-repair');
  f.command('repair', { actor: 'replacement-builder' });
  const again = f.command('check');
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
  assert.equal(f.command('final-check').checks.passed, true);
  state.deadline = Date.now() - 1;
  saveState(f.folder, state);
  assert.throws(() => f.command('final-check'), /Run deadline/);
});

test('native source and scratch handling works in a Git worktree', t => {
  const f = fixture(t);
  const worktree = path.join(f.root, 'worktree');
  git(f.repo, ['worktree', 'add', '--detach', worktree, f.base]);
  const project = JSON.parse(readFileSync(f.projectFile));
  project.repo = worktree;
  writeFileSync(f.projectFile, JSON.stringify(project));
  writeFileSync(path.join(f.task, 'NATIVE.json'), JSON.stringify({ version: 1, name: 'Worktree', stopAt: new Date(Date.now()+3600000).toISOString(), finalReviewAt: new Date(Date.now()+3000000).toISOString(), blocks: [{ id: 'double', title: 'Double', paths: ['src/'], dependsOn: [], design: { summary: 'Use existing function.' } }] }));
  prepareNative({ ...f.args, approve: prepareNative(f.args).approvalHash });
  const flags = { run: f.folder, actor: 'builder', block: 'double' };
  nativeCommand({ ...flags, action: 'claim' });
  writeFileSync(path.join(worktree, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
  assert.equal(nativeCommand({ ...flags, action: 'check' }).checks.passed, true);
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
  assert.throws(() => f.command('check'), /Outside allowed scope/);
  assert.equal(f.command('status').reviewReady, false);
});

test('a frozen helper remains usable when a different harness version is selected', t => {
  const f = nativeFixture(t);
  const runtime = path.join(f.folder, 'runtime');
  const future = path.join(f.root, 'future-runtime');
  cpSync(runtime, future, { recursive: true });
  writeFileSync(path.join(future, 'lib/quality.mjs'), readFileSync(path.join(future, 'lib/quality.mjs'), 'utf8') + '\n');
  const run = dir => spawnSync(process.execPath, [path.join(dir, 'harness.mjs'), 'native', '--action', 'status', '--run', f.folder], { encoding: 'utf8' });
  assert.notEqual(run(future).status, 0);
  assert.match(run(future).stderr, /Harness changed/);
  assert.equal(run(runtime).status, 0);
});

test('served notes survive regeneration and restart, reject conflicting writes, and preserve reading position', async t => {
  const f = nativeFixture(t);
  f.build();
  const { server, url } = await startReviewServer(f.folder);
  t.after(() => server.close());
  const post = (route, value) => fetch(url+route, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
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
  const links = JSON.parse(readFileSync(path.join(f.folder, 'evidence-map.json')));
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
  assert.equal(feedbackCommand({ run: f.folder, action: 'accept', input }).policyChanged, false);
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'Later work');
  assert.match(readFileSync(path.join(f.folder, 'feedback/clear-name/before/source/src/calc.mjs'), 'utf8'), /n =>/);
  assert.match(readFileSync(path.join(f.folder, 'feedback/clear-name/after/source/src/calc.mjs'), 'utf8'), /value =>/);
  const exported = feedbackCommand({ run: f.folder, action: 'export', folder: path.join(f.root, 'benchmark') });
  assert.equal(exported.cases, 2);
  assert.ok(exported.labels.includes('/private/'));
});
