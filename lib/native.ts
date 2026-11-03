import type { Block, Flags, NativeBlock, NativeInputs, NativePlan, NativeState, PrepareArgs, Review } from './types.ts';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ROOT, digest, fileBundle, json, loadProject, loadPreferences, runtimeId } from './config.ts';
import { head, safePath, within, sourceManifest, manifestChanges, saveSourceSnapshot } from './git.ts';
import { saveState, withLock, unlockStoppedRun, freezeRuntime } from './workspace.ts';
import { runCommands } from './checks.ts';
import { beginRepair, completionErrors, validateRepairLimits, carryRequired } from './quality.ts';

const active = (record?: NativeBlock) => ['building', 'repairing', 'checking', 'awaiting-review'].includes(record?.status ?? '');
const identity = (repo: string) => ({ head: head(repo), tree: digest(sourceManifest(repo)) });
const nonempty = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && !value.includes('{{');

export function readNative(folder: string) {
  const inputs = json<NativeInputs>(path.join(folder, 'inputs.json'));
  const state = json<NativeState>(path.join(folder, 'state.json'));
  if (inputs.mode !== 'native' || digest(inputs) !== state.approvalHash) throw new Error('Native run inputs changed');
  if (inputs.runtimeId !== runtimeId()) throw new Error('Harness changed; finish with the pinned copy or prepare a new run');
  if (readFileSync(path.join(folder, 'TASK.md'), 'utf8') !== inputs.brief) throw new Error('Approved task changed');
  if (digest(fileBundle(path.join(ROOT, 'skills'))) !== digest(inputs.skills)) throw new Error('Selected skills changed; use the pinned harness copy');
  if (Object.keys(inputs.preferences.files).length && digest(fileBundle(path.join(folder, 'preferences'))) !== digest(inputs.preferences.files)) throw new Error('Selected preferences changed');
  return { inputs, state };
}

function validatePlan(plan: NativePlan) {
  validateRepairLimits(plan);
  if (plan.version !== 1 || !nonempty(plan.name) || !Number.isFinite(Date.parse(plan.stopAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(plan.stopAt)) throw new Error('NATIVE.json needs version 1, name and absolute stopAt');
  if (!Number.isFinite(Date.parse(plan.finalReviewAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(plan.finalReviewAt) || Date.parse(plan.finalReviewAt) >= Date.parse(plan.stopAt)) throw new Error('finalReviewAt must precede stopAt');
  if (Date.now() >= Date.parse(plan.finalReviewAt)) throw new Error('Implementation window has already ended');
  if (!Array.isArray(plan.blocks) || !plan.blocks.length) throw new Error('At least one block is required');
  const seen = new Set();
  for (const block of plan.blocks) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(block.id) || block.id === 'final' || seen.has(block.id) || !nonempty(block.title)) throw new Error('Blocks need unique ids and titles; final is reserved');
    if (!Array.isArray(block.paths) || !block.paths.length || block.paths.some(p => !safePath(p))) throw new Error(`${block.id}: invalid scope`);
    if (!Array.isArray(block.dependsOn) || block.dependsOn.some(id => !seen.has(id))) throw new Error(`${block.id}: dependencies must precede the block`);
    if (!nonempty(block.design?.summary)) throw new Error(`${block.id}: supply a short design decision or explain why the existing design applies`);
    seen.add(block.id);
  }
}

export function prepareNative({ task, project, preferences, folder, approve }: PrepareArgs) {
  if (!task || !project || !folder) throw new Error('Native init needs --task, --project and --run');
  const plan = json<NativePlan>(path.join(task, 'NATIVE.json'));
  validatePlan(plan);
  const settings = loadProject(project);
  const brief = readFileSync(path.join(task, 'TASK.md'), 'utf8');
  if (!nonempty(brief)) throw new Error('Complete TASK.md first');
  if (path.resolve(folder) === settings.repo || path.resolve(folder).startsWith(settings.repo + path.sep)) throw new Error('Run folder must be outside the source checkout');
  const initialManifest = sourceManifest(settings.repo);
  const instructions = Object.fromEntries(settings.instructions.map(file => [file, readFileSync(path.join(settings.repo, file), 'utf8')]));
  const inputs: NativeInputs = { version: 1, mode: 'native', plan, project: settings, preferences: loadPreferences(preferences), brief, instructions, initialManifest, base: head(settings.repo), skills: fileBundle(path.join(ROOT, 'skills')), runtimeId: runtimeId() };
  const approvalHash = digest(inputs);
  if (!approve) return { writes: false, approvalHash, source: settings.repo, base: inputs.base, plan, checks: settings.checks, modelCalls: false };
  if (approve !== approvalHash) throw new Error('Approval does not match the current task, source and harness');
  if (existsSync(folder)) throw new Error('Run folder already exists');
  mkdirSync(folder, { recursive: true });
  const helper = freezeRuntime(folder);
  writeFileSync(path.join(folder, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
  writeFileSync(path.join(folder, 'TASK.md'), brief);
  for (const [name, body] of Object.entries(inputs.preferences.files)) {
    const target = path.join(folder, 'preferences', name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  writeFileSync(path.join(folder, 'NOTES.md'), '# Your review notes\n\n');
  saveState(folder, { version: 2, mode: 'native', runId: randomUUID(), approvalHash, startedAt: new Date().toISOString(), deadline: Date.parse(plan.stopAt), implementationDeadline: Date.parse(plan.finalReviewAt), blocks: {}, builders: [], events: [] });
  return { writes: true, folder, helper, approvalHash, modelCalls: false };
}

function blockFor(inputs: NativeInputs, id: string): Block {
  if (id === 'final') return { id, title: 'Integrated verification', paths: inputs.plan.blocks.flatMap(b => b.paths), dependsOn: inputs.plan.blocks.map(b => b.id) };
  const block = inputs.plan.blocks.find(b => b.id === id);
  if (!block) throw new Error('Unknown block');
  return block;
}

function recordEvidence(folder: string, id: string, record: NativeBlock, name: string, value: unknown) {
  const dir = path.join(folder, 'results', id);
  const attempt = path.join(dir, `attempt-${(record.checkAttempts ?? 1) - 1}`);
  mkdirSync(attempt, { recursive: true });
  for (const target of [path.join(dir, name), path.join(attempt, name)]) writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

function assertWindow(state: NativeState, final = false) {
  if (state.stopped) throw new Error('Run is stopped');
  if (Date.now() >= (final ? state.deadline : state.implementationDeadline)) throw new Error(final ? 'Run deadline reached' : 'Implementation window ended; preserve work and begin final review');
}

function assertQuiet(state: NativeState, id: string | null) {
  if (Object.entries(state.blocks).some(([other, record]) => other !== id && active(record))) throw new Error('Another block owns the checkout. Finish or recover it before continuing');
}

function claim(inputs: NativeInputs, state: NativeState, id: string, actor: string) {
  assertWindow(state);
  assertQuiet(state, id);
  if (state.blocks[id]) throw new Error('Block already claimed; use repair or recover without resetting its budget');
  const block = blockFor(inputs, id);
  if (id === 'final') throw new Error('Use final-check after the blocks finish');
  if (block.dependsOn.some(dep => state.blocks[dep]?.status !== 'review_ready')) throw new Error('Block dependencies are incomplete');
  if (Object.values(state.blocks).some(r => ['needs-repair', 'blocked', 'interrupted'].includes(r.status ?? ''))) throw new Error('Incomplete changes share this checkout; resolve them before starting independent work');
  state.blocks[id] = { status: 'building', builder: actor, base: head(inputs.project.repo), baseline: sourceManifest(inputs.project.repo), repairAttempts: 0, startedAt: new Date().toISOString() };
  state.builders = [...new Set([...state.builders, actor])];
  state.final = null;
}

function check(inputs: NativeInputs, state: NativeState, folder: string, id: string) {
  const final = id === 'final';
  const finalRepair = state.final?.status === 'needs-repair';
  assertWindow(state, final || finalRepair);
  assertQuiet(state, final ? null : id);
  const block = blockFor(inputs, id);
  if (final && block.dependsOn.some(dep => state.blocks[dep]?.status !== 'review_ready')) throw new Error('Cannot finalize incomplete blocks');
  const record = final ? (state.final ??= { baseline: inputs.initialManifest, repairAttempts: 0 }) : state.blocks[id];
  if (!record || (!final && !['building', 'repairing', 'awaiting-review'].includes(record.status ?? ''))) throw new Error('Claim or repair the block before checking');
  if (Date.now() >= (record.repairDeadline ?? Infinity)) throw new Error('Repair time limit reached');
  const manifest = sourceManifest(inputs.project.repo);
  const files = manifestChanges(record.baseline, manifest);
  const protectedPaths = ['.git/', '.claude/', '.agents/', ...inputs.project.protectedPaths];
  const scope = files.filter(file => !block.paths.some(p => within(file, p)) || protectedPaths.some(p => within(file, p)));
  if (scope.length) throw new Error(`Outside allowed scope: ${scope.join(', ')}`);
  if (!final && head(inputs.project.repo) !== record.base) throw new Error('HEAD changed during the block; reconcile before checking');
  const before = identity(inputs.project.repo);
  record.checkAttempts = (record.checkAttempts ?? 0) + 1;
  record.status = 'checking';
  saveState(folder, state);
  const checkDeadline = final || finalRepair ? state.deadline : state.implementationDeadline;
  const remainingMs = Math.min(checkDeadline, record.repairDeadline ?? Infinity) - Date.now();
  const requiredChecks = [...inputs.project.checks, ...inputs.preferences.settings.checks];
  const steps = runCommands(requiredChecks, { repo: inputs.project.repo, base: inputs.base, folder }, { env: inputs.project.env, remainingMs });
  const after = identity(inputs.project.repo);
  const errors = before.tree === after.tree && before.head === after.head ? [] : ['Checks changed source; evidence is invalid'];
  record.files = [...new Set([...(record.files ?? []), ...files])].sort();
  record.checks = { ...after, steps, errors, checkedAt: new Date().toISOString(), environment: { node: process.version, platform: process.platform }, passed: !errors.length && steps.length === requiredChecks.length && steps.every(s => s.passed) };
  recordEvidence(folder, id, record, 'checks.json', record.checks);
  saveSourceSnapshot(inputs.project.repo, record.files, path.join(folder, 'results', id, `attempt-${record.checkAttempts - 1}`, 'snapshot'));
  record.status = record.checks.passed ? 'awaiting-review' : 'needs-repair';
  return { checks: record.checks, reviewInput: { tree: after.tree, review: null }, previousReview: record.openReview ?? null, builder: record.builder ?? state.builders };
}

function review(inputs: NativeInputs, state: NativeState, folder: string, id: string, actor: string, input: string) {
  assertWindow(state, true);
  const record = id === 'final' ? state.final : state.blocks[id];
  if (!record?.checks || record.status !== 'awaiting-review') throw new Error('Current passing checks are required before review');
  if (state.builders.includes(actor)) throw new Error('Review must use a separate reviewer identity from all builders');
  const result = json<{ tree: string; review: Review }>(input);
  if (result.tree !== record.checks.tree) throw new Error('Reviewer used a different source tree');
  const current = identity(inputs.project.repo);
  const errors = completionErrors({ checks: record.checks, review: result.review, prior: record.openReview, currentTree: current.tree, currentHead: current.head, expectedChecks: [...inputs.project.checks, ...inputs.preferences.settings.checks].map(s => s.name), builder: record.builder, reviewer: actor });
  recordEvidence(folder, id, record, 'review.json', { actor, tree: result.tree, review: result.review, prior: record.openReview ?? null, errors, recordedAt: new Date().toISOString() });
  record.openReview = carryRequired(record.openReview, result.review, current.tree === record.checks.tree && current.head === record.checks.head);
  record.review = result.review;
  record.reviewer = actor;
  record.status = errors.length ? 'needs-repair' : 'review_ready';
  record.reason = errors.join('; ');
  return { status: record.status, errors };
}

export function nativeCommand(flags: Flags & { run: string }) {
  const folder = path.resolve(flags.run);
  if (flags.action === 'init') return prepareNative({ folder, task: flags.task && path.resolve(flags.task), project: flags.project && path.resolve(flags.project), preferences: flags.preferences && path.resolve(flags.preferences), approve: flags.approve });
  if (flags.action === 'status') {
    const { inputs, state } = readNative(folder);
    const current = identity(inputs.project.repo);
    return { state, current, reviewReady: state.final?.status === 'review_ready' && state.final.checks?.tree === current.tree && state.final.checks?.head === current.head };
  }
  if (flags.action === 'recover') unlockStoppedRun(folder);
  if (!nonempty(flags.actor)) throw new Error('Record --actor using the actual lead or worker identifier');
  const actor = flags.actor;
  const action = flags.action;
  return withLock(folder, () => {
    const { inputs, state } = readNative(folder);
    const id = action?.startsWith('final-') ? 'final' : flags.block ?? '';
    if (['claim', 'check', 'review', 'repair', 'recover'].includes(action ?? '') && !id) throw new Error('--block is required');
    let result;
    if (flags.action === 'claim') claim(inputs, state, id, actor);
    else if (flags.action === 'check' || flags.action === 'final-check') result = check(inputs, state, folder, id);
    else if (flags.action === 'review' || flags.action === 'final-review') result = review(inputs, state, folder, id, actor, flags.input ?? '');
    else if (flags.action === 'repair') {
      const finalRepair = state.final?.status === 'needs-repair';
      assertWindow(state, finalRepair);
      assertQuiet(state, id);
      const record = state.blocks[id];
      if (!record || !(['needs-repair', 'interrupted'].includes(record.status ?? '') || record.status === 'review_ready' && finalRepair)) throw new Error('No failed check or required review repair is recorded');
      const repair = beginRepair(record, inputs.plan, finalRepair ? state.deadline : state.implementationDeadline);
      if (record.status === 'review_ready' && finalRepair) {
        repair.baseline = sourceManifest(inputs.project.repo);
        repair.base = head(inputs.project.repo);
      }
      state.blocks[id] = { ...repair, status: 'repairing', builder: actor };
      state.builders = [...new Set([...state.builders, actor])];
      if (state.final) state.final.status = 'needs-repair';
    } else if (flags.action === 'recover') {
      if (!nonempty(flags.reason)) throw new Error('Recovery needs a reason confirming the prior worker stopped and its changes were inspected');
      if (!active(state.blocks[id])) throw new Error('Only an active block can be recovered');
      state.blocks[id].status = 'interrupted';
      state.blocks[id].reason = flags.reason;
    } else if (flags.action === 'stop') {
      if (!nonempty(flags.reason)) throw new Error('Stop needs a reason');
      state.stopped = true;
      state.stopReason = flags.reason;
    } else throw new Error('Native action must be init, claim, check, review, repair, recover, final-check, final-review, status or stop');
    state.events.push({ at: new Date().toISOString(), action: action!, block: id || null, actor, reason: flags.reason ?? null });
    saveState(folder, state);
    return result ?? { status: id ? state.blocks[id]?.status : 'stopped', modelCalls: false };
  });
}
