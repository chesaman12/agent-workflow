import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fixture, goodModel, passedReview } from './fixture.mjs';
import { reviewPassed, beginRepair, completionErrors, carryRequired } from '../lib/quality.mjs';
import { execute } from '../lib/runner.mjs';
import { summarizeQuality } from '../evals/quality.mjs';

export const requiredFinding = (id = 'ownership') => ({ id, file: 'src/calc.mjs', line: 1, category: 'architecture', blocking: true, message: 'Two owners encode the same rule.', suggestion: 'Put the calculation in its existing owner.' });
export function rejectedReview(id) {
  const review = passedReview();
  review.standards = { passed: false, findings: [requiredFinding(id)] };
  return review;
}

test('verdicts accept advice but reject missing evidence, malformed findings and disappearing blockers', () => {
  const advice = passedReview();
  advice.standards.findings = [{ ...requiredFinding(), blocking: false }];
  assert.equal(reviewPassed(advice), true);
  assert.equal(reviewPassed(advice, rejectedReview()), false);
  assert.equal(reviewPassed({ ...passedReview(), notVerified: ['Required keyboard interaction is unavailable'] }), false);
  assert.equal(reviewPassed({ ...passedReview(), standards: { passed: true, findings: [{ message: 'optional' }] } }), false);
  assert.equal(reviewPassed(passedReview(), rejectedReview()), false);
  const closed = { ...passedReview(), closed: [{ id: 'ownership', reason: 'The shared rule now has one owner.' }] };
  assert.equal(reviewPassed(closed, rejectedReview()), true);
  assert.equal(reviewPassed({ ...closed, spec: { passed: true, findings: [requiredFinding()] } }, rejectedReview()), false);
});

test('a dropped finding stays open through later reviews and stale closure evidence', () => {
  const prior = carryRequired(null, rejectedReview());
  const dropped = carryRequired(prior, passedReview());
  assert.equal(reviewPassed(passedReview(), dropped), false);
  const closure = { ...passedReview(), closed: [{ id: 'ownership', reason: 'One owner now.' }] };
  assert.equal(reviewPassed(passedReview(), carryRequired(prior, closure, false)), false);
  assert.equal(reviewPassed(passedReview(), carryRequired(prior, closure)), true);
});

test('missing verification remains a required finding until evidence is explicitly reviewed', () => {
  const missing = { ...passedReview(), notVerified: ['Required keyboard interaction'] };
  const debt = carryRequired(null, missing);
  assert.equal(reviewPassed(passedReview(), debt), false);
  const id = debt.spec.findings[0].id;
  const closure = { ...passedReview(), closed: [{ id, reason: 'The interaction log now shows the required sequence on the checked source.' }] };
  assert.equal(reviewPassed(closure, debt), true);
  assert.equal(reviewPassed(passedReview(), carryRequired(debt, closure)), true);
  assert.equal(reviewPassed(passedReview(), carryRequired(debt, { ...closure, notVerified: missing.notVerified })), false);
});

test('CLI cannot erase a required finding through two empty follow-up reviews', t => {
  const f = fixture(t, { plan: { maxRepairPasses: 2 } });
  f.prepare();
  let reviews = 0;
  const result = execute(f.folder, { invoke: call => call.role === 'review'
    ? { ok: true, costUsd: 0.1, review: reviews++ ? passedReview() : rejectedReview() }
    : goodModel({ ...call, role: 'build' }) });
  assert.equal(result.results[0].status, 'failed');
  assert.equal(result.state.blocks.double.openReview.standards.findings[0].id, 'ownership');
});

test('repair passes and deadlines cannot be reset by replacement findings or resume', () => {
  const first = beginRepair({}, {}, 999999, 1000);
  const second = beginRepair(first, {}, 99999999, 2000);
  assert.equal(second.repairAttempts, 2);
  assert.equal(second.repairDeadline, 999999);
  assert.equal(second.repairStartedAt, 1000);
  assert.throws(() => beginRepair(second, {}, 99999999, 3000), /pass limit/);
  assert.throws(() => beginRepair(first, {}, 99999999, 1000000), /time limit/);
});

test('completion needs command coverage, current source and a different reviewer', () => {
  const evidence = { checks: { passed: true, tree: 'one', head: 'h', steps: [{ name: 'test', passed: true, exitCode: 0 }] }, review: passedReview(), currentTree: 'one', currentHead: 'h', expectedChecks: ['test'], builder: 'b', reviewer: 'r' };
  assert.deepEqual(completionErrors(evidence), []);
  assert.ok(completionErrors({ ...evidence, currentTree: 'two' }).some(e => e.includes('stale')));
  assert.ok(completionErrors({ ...evidence, expectedChecks: ['test', 'integration'] }).some(e => e.includes('coverage')));
  assert.ok(completionErrors({ ...evidence, reviewer: 'b' }).some(e => e.includes('different reviewer')));
});

test('CLI repairs a required maintainability finding and independently closes it', t => {
  const f = fixture(t, { plan: { maxRepairPasses: 2 } });
  f.prepare();
  const roles = [];
  let reviewed = 0;
  const result = execute(f.folder, { invoke: call => {
    roles.push(call.role);
    if (call.role === 'review') return { ok: true, costUsd: 0.1, review: reviewed++ ? { ...passedReview(), closed: [{ id: 'ownership', reason: 'The repair removed the repeated ownership.' }] } : rejectedReview() };
    if (call.role === 'repair') {
      assert.match(call.prompt, /Two owners/);
      writeFileSync(path.join(call.saved.repo, 'src/calc.mjs'), 'export function double(value) { return value * 2; }\n');
      return { ok: true, costUsd: 0.1 };
    }
    return goodModel(call);
  } });
  assert.deepEqual(roles, ['build', 'review', 'repair', 'review']);
  assert.equal(result.results[0].status, 'review_ready');
  assert.equal(result.state.blocks.double.repairAttempts, 1);
  assert.match(readFileSync(path.join(f.folder, 'results/double/attempt-0/snapshot/source/src/calc.mjs'), 'utf8'), /n => n \* 2/);
  assert.match(readFileSync(path.join(f.folder, 'results/double/attempt-1/review.json'), 'utf8'), /removed the repeated ownership/);
});

test('CLI gives failed checks a bounded repair and rejects endless new findings', t => {
  const f = fixture(t, { plan: { maxRepairPasses: 2 } });
  f.prepare();
  let reviews = 0;
  const result = execute(f.folder, { invoke: call => {
    if (call.role === 'review') return { ok: true, costUsd: 0.1, review: rejectedReview(`issue-${++reviews}`) };
    return goodModel({ ...call, role: 'build' });
  } });
  assert.equal(result.results[0].status, 'failed');
  assert.match(result.results[0].reason, /Repair pass limit/);
  assert.equal(reviews, 3);
  assert.equal(result.state.blocks.double.repairAttempts, 2);
});

test('quality summaries keep correctness, first-pass quality and owner effort separate', () => {
  const summary = summarizeQuality({ reviewerCases: [
    { id: 'bad', acceptable: false, importantIssues: ['a', 'b'], matchedIssues: ['a'], falseBlockers: 0 },
    { id: 'good', acceptable: true, importantIssues: [], matchedIssues: [], falseBlockers: 1 },
  ], trials: [
    { id: 'one', task: 'task', variant: 'design', stage: 'first-pass', correctnessPassed: true, ownerAccepted: false, reviewMinutes: 10, repairMinutes: 20 },
    { id: 'two', task: 'task', variant: 'design', stage: 'after-review', correctnessPassed: true, ownerAccepted: true, reviewMinutes: 5, repairMinutes: 0 },
  ] });
  assert.equal(summary.reviewer.recall, 0.5);
  assert.equal(summary.reviewer.falseBlockersOnControls, 1);
  assert.deepEqual(summary.outcomes.map(o => o.medianOwnerMinutes), [30, 5]);
  assert.equal(summarizeQuality({ reviewerCases: [], trials: [] }).reviewer.recall, null);
  assert.throws(() => summarizeQuality({ reviewerCases: [], trials: [{ id: 'unlabeled' }] }), /owner labels/);
});
