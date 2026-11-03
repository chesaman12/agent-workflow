import path from 'node:path';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runBounded } from './process.mjs';
import { ROOT } from './config.mjs';
import { treeId, scopeErrors, head } from './git.mjs';

export const shellQuote = value => "'" + String(value).replaceAll("'", "'\"'\"'") + "'";

export function commandFor(command, { repo, base, folder }) {
  const values = { node: process.execPath, harness: ROOT, repo, base, preferences: path.join(folder, 'preferences') };
  return command.replace(/\{(node|harness|repo|base|preferences)\}/g, (_, key) => shellQuote(values[key]));
}

export function cleanEnv(repo, extra = {}, scratchFolder = null) {
  const env = {};
  for (const key of ['HOME','PATH','TMPDIR','LANG','USER','LOGNAME']) if (process.env[key]) env[key] = process.env[key];
  env.PATH = `${path.dirname(process.execPath)}:${env.PATH ?? '/usr/bin:/bin'}`;
  env.TMPDIR = scratchFolder ?? path.join(repo, '.harness-tmp');
  mkdirSync(env.TMPDIR, { recursive: true });
  env.NPM_CONFIG_CACHE = path.join(env.TMPDIR, 'npm-cache');
  env.NPM_CONFIG_USERCONFIG = path.join(env.TMPDIR, 'npm-userconfig');
  env.NPM_CONFIG_GLOBALCONFIG = path.join(env.TMPDIR, 'npm-globalconfig');
  env.XDG_CACHE_HOME = path.join(env.TMPDIR, 'cache');
  if (!scratchFolder) {
    const exclude = path.join(repo, '.git', 'info', 'exclude');
    if (!readFileSync(exclude, 'utf8').includes('/.harness-tmp/')) appendFileSync(exclude, '\n/.harness-tmp/\n');
  }
  return { ...env, ...extra };
}

export function runCommands(steps, context, { env = {}, remainingMs = Infinity } = {}) {
  const results = [];
  const end = Date.now() + remainingMs;
  for (const step of steps) {
    const budget = Math.min(step.timeoutMinutes * 60000, end - Date.now());
    if (budget <= 0) { results.push({ name: step.name, passed: false, reason: 'Run deadline reached' }); break; }
    const startedAt = new Date().toISOString();
    const command = commandFor(step.command, context);
    const run = runBounded('sh', ['-c', command], { cwd: context.repo, env: cleanEnv(context.repo, env, path.join(context.folder, 'scratch', path.basename(context.repo))), timeoutMs: Math.floor(budget) });
    results.push({ name: step.name, command, startedAt, finishedAt: new Date().toISOString(), passed: run.status === 0 && !run.error, exitCode: run.status, output: `${run.stdout}\n${run.stderr}`, reason: run.error?.message ?? null });
    if (!results.at(-1).passed) break;
  }
  return results;
}

export function checkBlock(inputs, block, saved, folder, remainingMs) {
  const before = treeId(saved.repo, saved.base);
  const errors = scopeErrors(saved.repo, saved.base, block, inputs.project);
  if (errors.length) return { passed: false, errors, steps: [], tree: before };
  const steps = runCommands([...inputs.project.checks, ...inputs.preferences.settings.checks], { ...saved, folder }, { env: inputs.project.env, remainingMs });
  const after = treeId(saved.repo, saved.base);
  if (after !== before) errors.push('Checks changed source files; inspect and rerun on the final changes');
  const expected = inputs.project.checks.length + inputs.preferences.settings.checks.length;
  const result = { passed: !errors.length && steps.length === expected && steps.every(s => s.passed), tree: after, head: head(saved.repo), errors, steps, checkedAt: new Date().toISOString() };
  const dir = path.join(folder, 'results', block.id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'checks.json'), JSON.stringify(result, null, 2) + '\n');
  return result;
}
