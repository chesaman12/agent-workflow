import type { Block, Checks, CLIBlock, CLIInputs, CLIState, Failure, InvokeModel, ModelRole, Review } from './types.ts';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRun, saveState, schedule, startBlock, checkpoint, withLock } from './workspace.ts';
import { runCommands, checkBlock } from './checks.ts';
import { runClaude, promptFor, settingsFor } from './claude.ts';
import { changedFiles, treeId, head, saveSourceSnapshot } from './git.ts';
import { report } from './report.ts';
import { beginRepair, completionErrors, carryRequired } from './quality.ts';

function runDeadline(state: CLIState): number {
  if (typeof state.deadline !== 'number' || !Number.isFinite(state.deadline)) throw new Error('Run deadline is missing or invalid');
  return state.deadline;
}

function write(folder: string, id: string, name: string, value: unknown) {
  const dir = path.join(folder, 'results', id);
  const attempt = readRun(folder).state.blocks[id]?.repairAttempts ?? 0;
  const archive = path.join(dir, `attempt-${attempt}`);
  mkdirSync(archive, { recursive: true });
  for (const target of [path.join(dir, name), path.join(archive, name)]) writeFileSync(target, JSON.stringify(value, null, 2) + '\n');
}

export function preview(folder: string) {
  const { inputs, state } = readRun(folder);
  const next = schedule(inputs,state).find(b => b.status === 'pending');
  const saved = { repo: path.join(folder,'blocks',next?.id ?? 'next'), base: state.acceptedHead };
  return { execute: false, next: next ?? null, delivery: inputs.plan.delivery, remainingUsd: Math.max(0,inputs.plan.maxUsd-state.spentUsd), costUnknown: state.costUnknown, deadline: state.deadline ? new Date(state.deadline).toISOString() : null, settings: settingsFor(inputs,folder,saved,'build') };
}

function modelCall(folder: string, inputs: CLIInputs, block: Block, saved: CLIBlock, role: ModelRole, checks: Checks | Failure | null, invoke: InvokeModel, prior: Review | null = null) {
  const state = readRun(folder).state;
  const remainingMs = Math.min(runDeadline(state), state.blocks[block.id]?.repairDeadline ?? Infinity)-Date.now();
  const maxUsd = inputs.plan.maxUsd-state.spentUsd;
  if (state.costUnknown || remainingMs <= 0 || maxUsd <= 0) throw new Error('No time or known budget remains');
  const prompt = promptFor(inputs,folder,block,saved,role,checks,prior);
  writeFileSync(path.join(folder,'results',block.id,`${role}-prompt.md`),prompt);
  write(folder,block.id,`${role}-settings.json`,settingsFor(inputs,folder,saved,role));
  state.costUnknown = true;
  saveState(folder,state);
  let result;
  try { result = invoke({ inputs, folder, saved, role, prompt, maxUsd, timeoutMs: Math.floor(remainingMs) }); }
  catch (error) { result = { ok: false, costUsd: null, error: error instanceof Error ? error.message : String(error) }; }
  const current = readRun(folder).state;
  const cost = result.costUsd;
  const known = typeof cost === 'number' && Number.isFinite(cost) && cost >= 0;
  current.costUnknown = !known;
  current.spentUsd += known ? cost : maxUsd;
  saveState(folder,current);
  write(folder,block.id,`${role}.json`,result);
  if (!result.ok || !known) throw new Error(result.error || (known ? `${role} did not complete` : 'Model cost was not reported; continuation stopped'));
  return result;
}

function buildAndReview(folder: string, inputs: CLIInputs, block: Block, saved: CLIBlock, invoke: InvokeModel): Checks {
  let prior: Review | null = null;
  let failure: Failure | null = null;
  for (let pass = 0; pass <= (inputs.plan.maxRepairPasses ?? 2); pass++) {
    const state = readRun(folder).state;
    const record = state.blocks[block.id];
    modelCall(folder, inputs, block, saved, failure ? 'repair' : 'build', failure, invoke);
    if (head(saved.repo) !== saved.base) throw new Error('Builder committed or changed its base; leave checkpointing to the runner');
    if (!changedFiles(saved.repo, saved.base).length) throw new Error('Builder produced no implementation changes');
    const remaining = Math.min(runDeadline(state), record.repairDeadline ?? Infinity) - Date.now();
    const checks = checkBlock(inputs, block, saved, folder, remaining);
    write(folder, block.id, 'checks.json', checks);
    saveSourceSnapshot(saved.repo, changedFiles(saved.repo, saved.base), path.join(folder, 'results', block.id, `attempt-${record.repairAttempts ?? 0}`, 'snapshot'));
    if (checks.errors.length) throw new Error(checks.errors.join('; '));
    let review: Review | null = null;
    let errors = ['Required checks failed'];
    if (checks.passed) {
      review = modelCall(folder, inputs, block, saved, 'review', checks, invoke, prior).review ?? null;
      if (head(saved.repo) !== saved.base || treeId(saved.repo, saved.base) !== checks.tree) throw new Error('Files or HEAD changed after checks');
      errors = completionErrors({ checks, review, prior, currentTree: treeId(saved.repo, saved.base), currentHead: head(saved.repo), expectedChecks: [...inputs.project.checks, ...inputs.preferences.settings.checks].map(s => s.name) });
      const updated = readRun(folder).state;
      updated.blocks[block.id].openReview = carryRequired(prior, review);
      saveState(folder, updated);
      if (!errors.length) return checks;
    }
    failure = { errors, checks, review };
    prior = review ? carryRequired(prior, review) : prior;
    const current = readRun(folder).state;
    current.blocks[block.id].failure = failure;
    saveState(folder, current);
    current.blocks[block.id] = beginRepair(current.blocks[block.id], inputs.plan, runDeadline(current));
    saveState(folder, current);
  }
  throw new Error('Repair pass limit reached');
}

export function execute(folder: string, { all = false, invoke = runClaude }: { all?: boolean; invoke?: InvokeModel } = {}) {
  return withLock(folder, () => {
    let { inputs, state } = readRun(folder);
    if (state.costUnknown) throw new Error('Previous cost is unknown; inspect it before preparing a new capped run');
    if (Object.values(state.blocks).some(b => b.status === 'running')) throw new Error('Interrupted block needs recover before continuing');
    state.deadline ??= Date.now()+inputs.plan.timeoutMinutes*60000;
    saveState(folder,state);
    const results = [];
    do {
      ({ inputs, state } = readRun(folder));
      if (state.costUnknown || Date.now() >= runDeadline(state) || state.spentUsd >= inputs.plan.maxUsd) break;
      const block = schedule(inputs,state).find(b => b.status === 'pending');
      if (!block) break;
      mkdirSync(path.join(folder,'results',block.id),{ recursive: true });
      let saved: CLIBlock | undefined;
      let outcome;
      try {
        saved = startBlock(folder,block);
        const setup = runCommands(inputs.project.setup,{ ...saved,folder },{ env: inputs.project.env,remainingMs: runDeadline(state)-Date.now() });
        write(folder,block.id,'setup.json',{steps:setup});
        if (setup.some(s => !s.passed) || setup.length !== inputs.project.setup.length) throw new Error('Dependency setup failed');
        if (changedFiles(saved.repo,saved.base).length) throw new Error('Setup changed tracked or unignored files');
        const checks = buildAndReview(folder, inputs, block, saved, invoke);
        const commit = inputs.plan.delivery === 'commits' ? checkpoint(saved.repo,block.title) : null;
        outcome = commit
          ? { status: 'accepted' as const, head: commit, tree: checks.tree }
          : { status: 'review_ready' as const, head: null, tree: checks.tree };
      } catch (error) { outcome = { status: 'failed' as const, reason: error instanceof Error ? error.message : String(error) }; }
      state = readRun(folder).state;
      Object.assign(state.blocks[block.id],outcome,{finishedAt:new Date().toISOString()});
      if (outcome.status === 'accepted' && saved) { state.acceptedHead=outcome.head; state.acceptedRepo=saved.repo; }
      saveState(folder,state);
      results.push({id:block.id,...outcome});
    } while (all);
    return { results, review: report(folder), state: readRun(folder).state };
  });
}
