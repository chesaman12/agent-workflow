import type { Block, CLIInputs, CLIState, FileBundle, NativeState, PrepareArgs } from './types.ts';
import { constants, cpSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, lstatSync, readlinkSync, openSync, closeSync, unlinkSync } from 'node:fs';
import path from 'node:path';
import { cloneAt, git, head } from './git.ts';
import { digest, fileBundle, json, loadDraft, runtimeId, ROOT } from './config.ts';

export function saveState(folder: string, state: CLIState | NativeState) {
  const temp = path.join(folder, 'state.tmp');
  writeFileSync(temp, JSON.stringify(state, null, 2) + '\n');
  renameSync(temp, path.join(folder, 'state.json'));
}

export function readRun(folder: string) {
  const inputs = json<CLIInputs>(path.join(folder, 'inputs.json'));
  const state = json<CLIState>(path.join(folder, 'state.json'));
  if (digest(inputs) !== state.approvalHash) throw new Error('Approved inputs changed; prepare a new run');
  if (inputs.runtimeId !== runtimeId()) throw new Error('Harness code changed; prepare a new run');
  if (readFileSync(path.join(folder, 'TASK.md'), 'utf8') !== inputs.brief) throw new Error('Approved task changed');
  if (digest(fileBundle(path.join(folder, 'skills'))) !== digest(inputs.skills)) throw new Error('Approved skills changed');
  if (digest(fileBundle(path.join(folder, 'preferences'))) !== digest(inputs.preferences.files)) throw new Error('Approved preferences changed');
  return { inputs, state };
}

function writeBundle(folder: string, files: FileBundle) {
  mkdirSync(folder, { recursive: true });
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(folder, rel);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
}

export function copyDependencies(source: string, dest: string, paths: string[]) {
  for (const rel of paths) {
    if (/^(\.git|\.claude|\.agents)(\/|$)/.test(rel)) throw new Error(`Cannot copy tool state: ${rel}`);
    cpSync(path.join(source, rel), path.join(dest, rel), {
      recursive: true, mode: constants.COPYFILE_FICLONE, verbatimSymlinks: true,
      filter(file) {
        if (/^(\.env(?:\..*)?|\.dev\.vars.*|\.npmrc|id_rsa|id_ed25519)$/.test(path.basename(file))) return false;
        if (lstatSync(file).isSymbolicLink()) {
          const link = readlinkSync(file);
          const resolved = path.resolve(path.dirname(file), link);
          if (path.isAbsolute(link) || !resolved.startsWith(path.resolve(source) + path.sep)) throw new Error(`Dependency symlink leaves its checkout: ${file}`);
        }
        return true;
      },
    });
  }
}

export function freezeRuntime(folder: string) {
  const runtime = path.join(folder, 'runtime');
  mkdirSync(runtime, { recursive: true });
  for (const name of ['harness.ts', 'package.json', 'lib', 'evals', 'skills']) cpSync(path.join(ROOT, name), path.join(runtime, name), { recursive: true });
  mkdirSync(path.join(runtime, 'docs'));
  cpSync(path.join(ROOT, 'docs', 'NATIVE.md'), path.join(runtime, 'docs', 'NATIVE.md'));
  return path.join(runtime, 'harness.ts');
}

export function prepare({ task, project, preferences, folder, approve }: PrepareArgs) {
  const draft = loadDraft(task, project, preferences);
  const { inputs, approvalHash } = draft;
  const source = path.resolve(inputs.project.repo);
  if (!folder || path.resolve(folder) === source || path.resolve(folder).startsWith(source + path.sep)) throw new Error('Run folder must be outside the source checkout');
  if (!approve) return { writes: false, approvalHash, source: inputs.project.repo, base: inputs.base, sourceChangesExcluded: draft.sourceChangesExcluded, plan: inputs.plan, checks: inputs.project.checks, setup: inputs.project.setup, copyPaths: inputs.project.copyPaths, network: inputs.project.network, skills: Object.keys(inputs.skills).filter(f => f.endsWith('SKILL.md')), preferences: inputs.preferences.settings.instructions ?? null };
  if (approve !== approvalHash) throw new Error('Approval does not match the current task, source, project, preferences and skills');
  if (existsSync(folder)) throw new Error('Run folder already exists');
  mkdirSync(folder, { recursive: true });
  freezeRuntime(folder);
  writeFileSync(path.join(folder, 'inputs.json'), JSON.stringify(inputs, null, 2) + '\n');
  writeFileSync(path.join(folder, 'TASK.md'), inputs.brief);
  writeFileSync(path.join(folder, 'NOTES.md'), '# Owner review\n\nReview minutes:\nRepair minutes:\nAccepted: undecided\n\n## Feedback\n\n');
  writeBundle(path.join(folder, 'skills'), inputs.skills);
  writeBundle(path.join(folder, 'preferences'), inputs.preferences.files);
  cloneAt(inputs.project.repo, path.join(folder, 'base'), inputs.base);
  copyDependencies(inputs.project.repo, path.join(folder, 'base'), inputs.project.copyPaths);
  const state: CLIState = { version: 1, approvalHash, base: inputs.base, acceptedRepo: path.join(folder, 'base'), acceptedHead: inputs.base, spentUsd: 0, costUnknown: false, blocks: {} };
  saveState(folder, state);
  return { writes: true, folder, approvalHash, base: inputs.base };
}

export function schedule(inputs: CLIInputs, state: CLIState) {
  return inputs.plan.blocks.map(block => ({ ...block, status: state.blocks[block.id]?.status ?? (block.dependsOn.some(id => state.blocks[id]?.status !== 'accepted') ? 'blocked' : 'pending') }));
}

export function startBlock(folder: string, block: Block) {
  const { inputs, state } = readRun(folder);
  const repo = path.join(folder, 'blocks', block.id);
  mkdirSync(path.dirname(repo), { recursive: true });
  state.blocks[block.id] = { status: 'running', repo, base: state.acceptedHead, startedAt: new Date().toISOString() };
  saveState(folder, state);
  cloneAt(state.acceptedRepo, repo, state.acceptedHead);
  copyDependencies(path.join(folder, 'base'), repo, inputs.project.copyPaths);
  return state.blocks[block.id];
}

export function checkpoint(repo: string, title: string) {
  git(repo, ['add', '-A']);
  git(repo, ['commit', '-qm', title]);
  return head(repo);
}

export function withLock<T>(folder: string, callback: () => T): T {
  const file = path.join(folder, 'run.lock');
  let fd;
  try { fd = openSync(file, 'wx'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'EEXIST') throw new Error('Run is locked. Use recover only after its process has stopped.'); throw error; }
  writeFileSync(fd, JSON.stringify({ pid: process.pid }));
  try { return callback(); }
  finally { closeSync(fd); unlinkSync(file); }
}

export function recover(folder: string, id: string, reason?: string) {
  if (!reason?.trim()) throw new Error('Recovery needs --reason');
  unlockStoppedRun(folder);
  const { state } = readRun(folder);
  if (state.blocks[id]?.status !== 'running') throw new Error('Only an interrupted running block can be recovered');
  Object.assign(state.blocks[id], { status: 'failed', reason });
  saveState(folder, state);
  return state.blocks[id];
}

export function unlockStoppedRun(folder: string) {
  const lock = path.join(folder, 'run.lock');
  if (existsSync(lock)) {
    const { pid } = json<{ pid: number }>(lock);
    try { process.kill(pid, 0); throw new Error('Run process is still alive'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    unlinkSync(lock);
  }
}
