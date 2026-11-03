import type { ModelCall } from '../lib/types.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync, symlinkSync } from 'node:fs';
import path from 'node:path';
import { fixture, goodModel, passedReview } from './fixture.ts';
import { execute, preview } from '../lib/runner.ts';
import { prepare, readRun, saveState, schedule, recover, withLock } from '../lib/workspace.ts';
import { git, head } from '../lib/git.ts';
import { loadDraft } from '../lib/config.ts';
import { report, reviewModel } from '../lib/report.ts';

test('preview makes no clone or model call; project selection is required', t => {
  const f = fixture(t);
  assert.equal(prepare(f.args).writes, false);
  assert.equal(existsSync(f.folder), false);
  assert.throws(() => loadDraft(f.task), /--project is required/);
  assert.throws(() => prepare({...f.args,folder:path.join(f.repo,'run')}), /outside the source/);
  f.prepare();
  assert.equal(preview(f.folder).execute, false);
  assert.equal(existsSync(path.join(f.folder, 'blocks')), false);
});

test('approval binds inputs and execution refuses edits to saved skills', t => {
  const f = fixture(t);
  const hash = prepare(f.args).approvalHash;
  writeFileSync(path.join(f.task, 'TASK.md'), 'A changed requirement.');
  assert.throws(() => prepare({ ...f.args, approve: hash }), /Approval does not match/);
  f.prepare();
  writeFileSync(path.join(f.folder, 'skills/implement/SKILL.md'), 'Different skill');
  assert.throws(() => execute(f.folder, { invoke: goodModel }), /skills changed/);
});

test('one diff block runs real checks and fresh review, without a commit or source mutation', t => {
  const f = fixture(t);
  writeFileSync(path.join(f.repo, 'uncommitted.txt'), 'Keep owner work');
  writeFileSync(path.join(f.repo, 'src/calc.mjs'), 'Owner changes');
  f.prepare();
  const calls: ModelCall[] = [];
  const result = execute(f.folder, { invoke: call => {
    calls.push(call);
    if (call.role === 'build') assert.equal(readFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'utf8'), 'export const double = n => n;\n');
    return goodModel(call);
  } });
  assert.equal(result.results[0].status, 'review_ready');
  assert.deepEqual(calls.map(c => c.role), ['build', 'review']);
  assert.match(calls[0].prompt, /Selected skill: implement/);
  assert.match(calls[0].prompt, /Selected skill: tdd/);
  assert.match(calls[1].prompt, /Selected skill: code-review/);
  assert.match(calls[1].prompt, /"passed":true/);
  const block = result.state.blocks.double;
  assert.equal(head(block.repo), f.base);
  assert.equal(git(block.repo, ['remote']).trim(), '');
  assert.equal(head(f.repo), f.base);
  assert.equal(readFileSync(path.join(f.repo, 'src/calc.mjs'), 'utf8'), 'Owner changes');
  assert.equal(readFileSync(path.join(f.repo, 'uncommitted.txt'), 'utf8'), 'Keep owner work');
  assert.equal(result.state.spentUsd, 0.2);
  assert.match(readFileSync(result.review, 'utf8'), /Evidence current: true/);
  writeFileSync(path.join(f.folder,'NOTES.md'),'Keep my review feedback.');
  report(f.folder);
  assert.equal(readFileSync(path.join(f.folder,'NOTES.md'),'utf8'),'Keep my review feedback.');
});

for (const kind of ['no-op', 'failing-check', 'scope', 'protected', 'review-rejects', 'review-incomplete', 'review-mutates', 'builder-commits']) {
  test(`${kind} cannot become accepted`, t => {
    const f = fixture(t);
    f.prepare();
    let reviews = 0;
    const result = execute(f.folder, { invoke: call => {
      if (call.role === 'review') {
        reviews++;
        const review = passedReview();
        if (kind === 'review-rejects') { review.spec.passed = false; review.spec.findings.push({ id: 'behavior', file: 'src/calc.mjs', line: 1, category: 'correctness', blocking: true, message: 'Missing required behavior', suggestion: 'Implement the required behavior.' }); }
        if (kind === 'review-incomplete') Reflect.deleteProperty(review, 'standards');
        if (kind === 'review-mutates') writeFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'export const double = n => 99;');
        return { ok: true, costUsd: 0.1, review };
      }
      if (kind !== 'no-op') goodModel(call);
      if (kind === 'failing-check') writeFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'export const double = n => 8;');
      if (kind === 'scope') writeFileSync(path.join(call.saved.repo, 'outside.txt'), 'extra');
      if (kind === 'protected') writeFileSync(path.join(call.saved.repo, '.gitignore'), '*');
      if (kind === 'builder-commits') { git(call.saved.repo, ['add', '-A']); git(call.saved.repo, ['commit', '-qm', 'Unapproved checkpoint']); }
      return { ok: true, costUsd: 0.1 };
    } });
    assert.equal(result.results[0].status, 'failed');
    assert.equal(result.state.acceptedHead, f.base);
    assert.equal(reviews, kind.startsWith('review-') ? 1 : 0);
  });
}

test('checks that rewrite source invalidate their own evidence', t => {
  const f = fixture(t, { project: { checks: [{ name: 'rewrite', command: "printf '\n' >> src/calc.mjs", timeoutMinutes: 1 }] } });
  f.prepare();
  let reviews = 0;
  const result = execute(f.folder, { invoke: call => { if (call.role === 'review') reviews++; return goodModel(call); } });
  assert.ok('reason' in result.results[0]);
  assert.match(result.results[0].reason, /Checks changed source/);
  assert.equal(reviews, 0);
});

test('unknown cost stops continuation and is not erased by recovery', t => {
  const f = fixture(t);
  f.prepare();
  const result = execute(f.folder, { invoke: () => ({ ok: false, costUsd: null }) });
  assert.equal(result.state.costUnknown, true);
  assert.equal(result.state.spentUsd, 2);
  assert.throws(() => execute(f.folder), /cost is unknown/);
});

test('deadline persists and an exhausted cap prevents the next model call', t => {
  const f = fixture(t);
  f.prepare();
  const result = execute(f.folder, { invoke: call => ({ ...goodModel(call), costUsd: 2 }) });
  assert.equal(result.results[0].status, 'failed');
  assert.ok('reason' in result.results[0]);
  assert.match(result.results[0].reason, /budget remains/);
  const deadline = result.state.deadline;
  const again = execute(f.folder, { invoke: () => { throw Error('Must not run'); } });
  assert.equal(again.state.deadline, deadline);
  assert.deepEqual(again.results, []);
});

test('a saved expired deadline prevents a new block from starting', t => {
  const f = fixture(t);
  f.prepare();
  const { state } = readRun(f.folder);
  state.deadline = Date.now() - 1;
  saveState(f.folder, state);
  const result = execute(f.folder, { invoke: () => { throw Error('Must not run'); } });
  assert.deepEqual(result.results, []);
  assert.equal(existsSync(path.join(f.folder,'blocks')), false);
  assert.equal(result.state.deadline, state.deadline);
});

test('tracked environment examples are allowed, but real environment files are refused', t => {
  const examples = fixture(t, { extraFiles: { '.env.local.example': 'PUBLIC_EXAMPLE=example\n' } });
  assert.equal(prepare(examples.args).writes, false);
  const local = fixture(t, { extraFiles: { '.env.local': 'DUMMY_VALUE=fixture\n' } });
  assert.throws(() => prepare(local.args), /local environment files/);
});

test('preferences snapshot only named files, not the surrounding directory', t => {
  const f = fixture(t);
  const preferences = path.join(f.root,'preferences.json');
  writeFileSync(preferences,JSON.stringify({instructions:'STYLE.md',checks:[]}));
  writeFileSync(path.join(f.root,'STYLE.md'),'Use clear names.');
  writeFileSync(path.join(f.root,'unrelated.txt'),'Do not copy this file.');
  const draft = loadDraft(f.task,f.projectFile,preferences);
  assert.deepEqual(Object.keys(draft.inputs.preferences.files),['STYLE.md']);
});

test('failed blocks stay isolated; dependencies block; independent work continues from accepted work', t => {
  const blocks = [
    { id: 'first', title: 'First', paths: ['src/calc.mjs'], dependsOn: [] },
    { id: 'broken', title: 'Broken', paths: ['src/calc.mjs'], dependsOn: ['first'] },
    { id: 'dependent', title: 'Dependent', paths: ['src/calc.mjs'], dependsOn: ['broken'] },
    { id: 'independent', title: 'Independent', paths: ['src/extra.mjs'], dependsOn: [] },
  ];
  const f = fixture(t, { plan: { delivery: 'commits', blocks } });
  f.prepare();
  const result = execute(f.folder, { all: true, invoke: call => {
    const id = path.basename(call.saved.repo);
    if (call.role === 'build' && id === 'broken') writeFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'export const double = n => 99;');
    else if (call.role === 'build' && id === 'independent') {
      assert.equal(readFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'utf8'), 'export const double = n => n * 2;\n');
      writeFileSync(path.join(call.saved.repo, 'src/extra.mjs'), 'export const value = 1;\n');
    } else return goodModel(call);
    return { ok: true, costUsd: 0.1 };
  } });
  assert.deepEqual(result.results.map(r => [r.id, r.status]), [['first', 'accepted'], ['broken', 'failed'], ['independent', 'accepted']]);
  assert.equal(schedule(readRun(f.folder).inputs, result.state)[2].status, 'blocked');
  assert.equal(head(f.repo), f.base);
  assert.equal(git(result.state.acceptedRepo, ['rev-list', '--count', `${f.base}..HEAD`]).trim(), '2');
});

test('a live lock blocks another controller; interrupted blocks require explicit recovery', t => {
  const f = fixture(t);
  f.prepare();
  withLock(f.folder, () => {
    assert.throws(() => execute(f.folder), /locked/);
    assert.throws(() => recover(f.folder, 'double', 'Inspect interrupted work'), /still alive/);
  });
  const { state } = readRun(f.folder);
  state.blocks.double = { startedAt: new Date().toISOString(), status: 'running', repo: path.join(f.folder, 'missing'), base: f.base };
  state.costUnknown = true;
  saveState(f.folder, state);
  assert.throws(() => recover(f.folder, 'double', ''), /reason/);
  recover(f.folder, 'double', 'Process stopped before returning cost');
  assert.equal(readRun(f.folder).state.costUnknown, true);
  assert.equal(readRun(f.folder).state.blocks.double.status, 'failed');
});

test('copied dependencies are private and preserve internal relative links', t => {
  const f = fixture(t, { project: { copyPaths: ['node_modules/'] } });
  mkdirSync(path.join(f.repo, 'node_modules/pkg'), { recursive: true });
  writeFileSync(path.join(f.repo, 'node_modules/pkg/value'), 'original');
  symlinkSync('pkg/value', path.join(f.repo, 'node_modules/link'));
  f.prepare();
  writeFileSync(path.join(f.folder, 'base/node_modules/link'), 'private');
  assert.equal(readFileSync(path.join(f.repo, 'node_modules/link'), 'utf8'), 'original');
  assert.equal(readFileSync(path.join(f.folder, 'base/node_modules/pkg/value'), 'utf8'), 'private');
});


test('an authorized CLI checkpoint retains current evidence until source changes', t => {
  const f = fixture(t, { plan: { delivery: 'commits' } });
  f.prepare();
  const result = execute(f.folder, { invoke: goodModel });
  assert.equal(result.results[0].status, 'accepted');
  assert.equal(reviewModel(f.folder).ready, true);
  const repo = result.state.blocks.double.repo;
  writeFileSync(path.join(repo, 'src/calc.mjs'), 'export const double = n => n * 3;\n');
  assert.equal(reviewModel(f.folder).ready, false);
});
