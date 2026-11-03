import type { CLIPlan, CLIInputs, Command, FileBundle, Preferences, Project } from './types.ts';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { git, head, safePath } from './git.ts';
import { validateRepairLimits } from './quality.ts';

export const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered((value as Record<string, unknown>)[key])]));
  return value;
}

export const digest = (value: unknown) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(ordered(value))).digest('hex');
export const json = <T = unknown>(file: string): T => JSON.parse(readFileSync(file, 'utf8')) as T;
const filled = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && !value.includes('{{');
const positive = (value: number) => Number.isFinite(value) && value > 0;

export function filesUnder(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).sort((a,b) => a.name.localeCompare(b.name)).flatMap(entry => {
    const file = path.join(folder, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Input symlinks are not allowed: ${file}`);
    return entry.isDirectory() ? filesUnder(file) : [file];
  });
}

export function fileBundle(folder: string): FileBundle {
  return Object.fromEntries(filesUnder(folder).map(file => [path.relative(folder, file), readFileSync(file, 'utf8')]));
}

export function runtimeId() {
  return digest({ cli: readFileSync(path.join(ROOT, 'harness.ts'), 'utf8'), lib: fileBundle(path.join(ROOT, 'lib')), docs: fileBundle(path.join(ROOT, 'docs')), templates: fileBundle(path.join(ROOT, 'templates')), package: readFileSync(path.join(ROOT, 'package.json'), 'utf8') });
}

function commands(value: Command[], label: string, required = false) {
  if (!Array.isArray(value) || (required && !value.length)) throw new Error(`${label} must be a list${required ? ' with at least one command' : ''}`);
  for (const step of value) if (!filled(step.name) || !filled(step.command) || !positive(step.timeoutMinutes)) throw new Error(`${label}: each command needs name, command, and positive timeoutMinutes`);
  if (new Set(value.map(s => s.name)).size !== value.length) throw new Error(`${label}: command names must be unique`);
}

function paths(value: string[], label: string) {
  if (!Array.isArray(value) || value.some(p => !safePath(p))) throw new Error(`${label} must list relative files or directories ending /`);
}

export function validatePlan(plan: CLIPlan) {
  validateRepairLimits(plan);
  if (plan.version !== 1 || !filled(plan.name) || !filled(plan.model)) throw new Error('RUN.json needs version 1, name and model');
  for (const key of ['maxUsd','maxTurns','timeoutMinutes'] as const) if (!positive(plan[key])) throw new Error(`${key} must be positive`);
  if (!Number.isInteger(plan.maxTurns)) throw new Error('maxTurns must be an integer');
  if (!['diff','commits'].includes(plan.delivery)) throw new Error('delivery must be diff or commits');
  if (!Array.isArray(plan.blocks) || !plan.blocks.length) throw new Error('blocks must not be empty');
  if (plan.delivery === 'diff' && plan.blocks.length !== 1) throw new Error('diff delivery supports one block; a multi-block run needs explicitly selected local commits');
  const seen = new Set();
  for (const block of plan.blocks) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(block.id) || seen.has(block.id) || !filled(block.title)) throw new Error('Each block needs a unique id and title');
    if (!Array.isArray(block.dependsOn) || block.dependsOn.some(id => !seen.has(id))) throw new Error(`${block.id}: dependencies must name earlier blocks`);
    paths(block.paths, `${block.id} paths`);
    if (!block.paths.length) throw new Error(`${block.id}: paths must not be empty`);
    seen.add(block.id);
  }
}

export function loadProject(file?: string): Project {
  if (!file) throw new Error('--project is required; there is no default repository or policy');
  const project = json<Project>(file);
  if (project.version !== 1 || !filled(project.repo)) throw new Error('Project needs version 1 and repo');
  project.repo = path.resolve(path.dirname(file), project.repo);
  for (const key of ['copyPaths','protectedPaths','instructions'] as const) paths(project[key] ??= [], key);
  project.setup ??= [];
  commands(project.setup, 'setup');
  commands(project.checks, 'checks', true);
  project.commands ??= [];
  if (!Array.isArray(project.commands) || project.commands.some(c => !filled(c))) throw new Error('commands must list shell permission patterns');
  project.readOnlyPaths ??= [];
  if (!Array.isArray(project.readOnlyPaths) || project.readOnlyPaths.some(p => !filled(p))) throw new Error('readOnlyPaths must be a list');
  project.readOnlyPaths = project.readOnlyPaths.map(p => path.resolve(path.dirname(file), p));
  project.network ??= { allowedDomains: [], allowLocalBinding: false };
  if (!Array.isArray(project.network.allowedDomains) || project.network.allowedDomains.some(d => !filled(d)) || typeof project.network.allowLocalBinding !== 'boolean') throw new Error('network needs allowedDomains and allowLocalBinding');
  project.env ??= {};
  if (!project.env || Array.isArray(project.env) || typeof project.env !== 'object' || Object.values(project.env).some(v => typeof v !== 'string')) throw new Error('env must map names to test-only string values');
  return project;
}

export function loadPreferences(file?: string): Preferences {
  if (!file) return { settings: { checks: [] }, files: {} };
  const settings = json<Preferences['settings']>(file);
  commands(settings.checks ??= [], 'preference checks');
  if (!safePath(settings.instructions)) throw new Error('Preferences must name their instructions file');
  paths(settings.files ??= [], 'preference files');
  const files = Object.fromEntries([...new Set([settings.instructions, ...settings.files])].map(name => {
    const full = path.join(path.dirname(file), name);
    if (!lstatSync(full).isFile()) throw new Error(`Preference inputs must be regular files: ${name}`);
    return [name, readFileSync(full, 'utf8')];
  }));
  return { settings, files };
}

export function loadDraft(task?: string, projectFile?: string, preferenceFile?: string) {
  if (!task) throw new Error('--task must name a folder containing TASK.md and RUN.json');
  const plan = json<CLIPlan>(path.join(task, 'RUN.json'));
  validatePlan(plan);
  const brief = readFileSync(path.join(task, 'TASK.md'), 'utf8');
  if (!filled(brief)) throw new Error('TASK.md must be completed');
  const project = loadProject(projectFile);
  const base = head(project.repo);
  const instructions = Object.fromEntries(project.instructions.map(file => [file, git(project.repo, ['show', `${base}:${file}`])]));
  for (const item of project.copyPaths) {
    const full = path.join(project.repo, item);
    if (!existsSync(full) || lstatSync(full).isSymbolicLink()) throw new Error(`Copy source must exist and not be a symlink: ${full}`);
    if (git(project.repo, ['ls-files', '--', item]).trim()) throw new Error(`copyPaths must contain only untracked dependencies or generated files: ${item}`);
  }
  const tracked = git(project.repo, ['ls-tree', '-r', '--name-only', base]).split('\n');
  if (tracked.some(f => /(^|\/)(\.env($|\.)|\.dev\.vars($|\.)|id_rsa$|id_ed25519$)/.test(f) && !/\.(example|sample|template)$/.test(f))) throw new Error('Source tracks credentials or local environment files');
  const inputs: CLIInputs = { version: 1, plan, brief, project, instructions, preferences: loadPreferences(preferenceFile), skills: fileBundle(path.join(ROOT, 'skills')), runtimeId: runtimeId(), base };
  return { inputs, approvalHash: digest(inputs), sourceChangesExcluded: git(project.repo, ['status','--porcelain']).trim() };
}
