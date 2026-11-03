import type { Checks, Finding, RepairLimits, RepairRecord, Review, ReviewAxis } from './types.ts';
import { createHash } from 'node:crypto';

const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const findingSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    id: { type: 'string' }, file: { type: 'string' }, line: { type: 'integer', minimum: 1 },
    category: { enum: ['correctness', 'architecture', 'readability', 'verification'] },
    blocking: { type: 'boolean' }, message: { type: 'string' }, suggestion: { type: 'string' },
  },
  required: ['id', 'file', 'line', 'category', 'blocking', 'message', 'suggestion'],
};
const axisSchema = {
  type: 'object', additionalProperties: false,
  properties: { passed: { type: 'boolean' }, findings: { type: 'array', items: findingSchema } },
  required: ['passed', 'findings'],
};
export const REVIEW_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    standards: axisSchema, spec: axisSchema, summary: { type: 'string' },
    notVerified: { type: 'array', items: { type: 'string' } },
    closed: { type: 'array', items: {
      type: 'object', additionalProperties: false,
      properties: { id: { type: 'string' }, reason: { type: 'string' } }, required: ['id', 'reason'],
    } },
  }, required: ['standards', 'spec', 'summary', 'notVerified', 'closed'],
};

export function findings(review?: Review | null): (Finding & { axis: ReviewAxis })[] {
  return (['standards', 'spec'] as const).flatMap(axis => (Array.isArray(review?.[axis]?.findings) ? review[axis].findings : []).filter(f => f && typeof f === 'object').map(f => ({ ...f, axis })));
}

function requiredRecords(review?: Review | null): (Finding & { axis: ReviewAxis })[] {
  const missing = Array.isArray(review?.notVerified) ? review.notVerified.filter(text) : [];
  return [...findings(review).filter(f => f.blocking), ...missing.map(message => ({
    id: `verification-${createHash('sha256').update(message.trim()).digest('hex').slice(0, 12)}`,
    axis: 'spec' as const, file: 'TASK.md', line: 1, category: 'verification' as const, blocking: true,
    message: `Required verification missing: ${message}`,
    suggestion: 'Run the required check and cite its actual saved evidence in the independent closure. Otherwise keep this finding open.',
  }))];
}

export function reviewErrors(input: unknown, prior: Review | null = null) {
  if (!input || typeof input !== 'object') return ['Review is missing'];
  const review = input as Review;
  const errors = [];
  const ids = new Set();
  if (!text(review.summary)) errors.push('Review needs a summary');
  if (!Array.isArray(review.notVerified) || review.notVerified.some(v => !text(v))) errors.push('Invalid notVerified list');
  else if (review.notVerified.length) errors.push(...review.notVerified.map(v => `Required verification missing: ${v}`));
  for (const axis of ['standards', 'spec'] as const) {
    const value = review[axis];
    if (!value || typeof value.passed !== 'boolean' || !Array.isArray(value.findings)) {
      errors.push(`Incomplete ${axis} verdict`);
      continue;
    }
    for (const f of value.findings) {
      if (!f || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,79}$/.test(f.id ?? '') || ids.has(f.id) || !text(f.file) ||
          !Number.isInteger(f.line) || f.line < 1 || typeof f.blocking !== 'boolean' || !text(f.message) || !text(f.suggestion) ||
          !['correctness', 'architecture', 'readability', 'verification'].includes(f.category)) {
        errors.push(`Malformed or duplicate ${axis} finding`);
        continue;
      }
      ids.add(f.id);
      if (f.blocking) errors.push(`${f.id}: ${f.message}`);
    }
    if (!value.passed) errors.push(`${axis} review did not pass`);
  }
  const closed = review.closed ?? [];
  const priorIds = new Set(requiredRecords(prior).map(f => f.id));
  if (!Array.isArray(closed) || closed.some(c => !c || !text(c.id) || !text(c.reason))) errors.push('Invalid finding closures');
  else {
    if (new Set(closed.map(c => c.id)).size !== closed.length) errors.push('Duplicate finding closure');
    for (const c of closed) {
      if (!priorIds.has(c.id)) errors.push(`Closure has no prior required finding: ${c.id}`);
      if (ids.has(c.id)) errors.push(`Finding is both open and closed: ${c.id}`);
    }
    for (const id of priorIds) if (!findings(review).some(f => f.id === id && f.blocking) && !closed.some(c => c.id === id)) errors.push(`Required finding disappeared or was downgraded without closure: ${id}`);
  }
  return errors;
}

export const reviewPassed = (review: unknown, prior: Review | null = null) => reviewErrors(review, prior).length === 0;

export function carryRequired(prior: Review | null | undefined, review: Review | null | undefined, allowClosure = true): Review {
  const pending = new Map(requiredRecords(prior).map(f => [f.id, f]));
  const current = findings(review);
  for (const f of requiredRecords(review)) if (f.blocking === true && text(f.id)) pending.set(f.id, f);
  const complete = !!review && (['standards', 'spec'] as const).every(axis => typeof review?.[axis]?.passed === 'boolean' && Array.isArray(review[axis].findings));
  if (allowClosure && complete && review && Array.isArray(review.closed)) {
    for (const item of review.closed) if (item && text(item.id) && text(item.reason) && ![...current, ...requiredRecords(review)].some(f => f.id === item.id)) pending.delete(item.id);
  }
  const axis = (name: ReviewAxis) => ({ passed: false, findings: [...pending.values()].filter(f => f.axis === name).map(({ axis, ...finding }) => finding) });
  return { standards: axis('standards'), spec: axis('spec'), summary: 'Required findings retained until explicit independent closure.', notVerified: [], closed: [] };
}

export function completionErrors({ checks, review, prior, currentTree, currentHead, expectedChecks, builder, reviewer }: { checks?: Checks | null; review: unknown; prior?: Review | null; currentTree: string; currentHead: string; expectedChecks?: string[]; builder?: string; reviewer?: string }) {
  const errors = reviewErrors(review, prior);
  if (builder && (!reviewer || builder === reviewer)) errors.push('A different reviewer identity is required');
  if (!checks?.passed || !Array.isArray(checks.steps) || checks.steps.some(s => !s.passed || s.exitCode !== 0)) errors.push('Required checks did not pass');
  if (checks?.tree !== currentTree || (checks?.head && checks.head !== currentHead)) errors.push('Verification is stale for the current source');
  if (expectedChecks && (checks?.steps?.length !== expectedChecks.length || expectedChecks.some(name => !checks.steps.some(s => s.name === name)))) errors.push('Required check coverage is incomplete');
  return [...new Set(errors)];
}

export function beginRepair<T extends RepairRecord>(record: T, { maxRepairPasses = 2, repairMinutes = 45 }: RepairLimits, deadline: number, now = Date.now()): T & Required<RepairRecord> {
  const started = record.repairStartedAt ?? now;
  const stopAt = Math.min(record.repairDeadline ?? Infinity, started + repairMinutes * 60000, deadline);
  if ((record.repairAttempts ?? 0) >= maxRepairPasses) throw new Error('Repair pass limit reached; preserve incomplete work');
  if (now >= stopAt) throw new Error('Repair time limit reached; preserve incomplete work');
  return { ...record, repairStartedAt: started, repairDeadline: stopAt, repairAttempts: (record.repairAttempts ?? 0) + 1 };
}

export function validateRepairLimits(plan: RepairLimits) {
  const passes = plan.maxRepairPasses ?? 2;
  const minutes = plan.repairMinutes ?? 45;
  if (!Number.isInteger(passes) || passes < 0 || passes > 5) throw new Error('maxRepairPasses must be an integer from 0 to 5');
  if (!Number.isFinite(minutes) || minutes <= 0) throw new Error('repairMinutes must be positive');
}
