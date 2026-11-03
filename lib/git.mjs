import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export function git(repo, args, { allowFail = false } = {}) {
  const result = spawnSync('git', ['-C', repo, '-c', 'core.quotePath=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (result.status === 0) return result.stdout;
  if (allowFail) return null;
  throw new Error(result.error?.message ?? `git ${args[0]}: ${result.stderr.trim()}`);
}

export const head = repo => git(repo, ['rev-parse', 'HEAD']).trim();
export const within = (file, prefix) => file === prefix || (prefix.endsWith('/') && file.startsWith(prefix));
export const safePath = value => typeof value === 'string' && value.length > 0 && value !== '.' && !path.isAbsolute(value) && !value.includes('\\') && !value.split('/').some(p => p === '..' || p === '.');

export function sourceManifest(repo) {
  const files = [...new Set(git(repo, ['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0').filter(Boolean))].sort();
  return Object.fromEntries(files.map(file => {
    if (!safePath(file) || /(^|\/)(\.env($|\.)|\.dev\.vars($|\.)|\.npmrc$|id_rsa$|id_ed25519$)/.test(file) && !/\.(example|sample|template)$/.test(file)) throw new Error(`Sensitive source path must not enter a run: ${file}`);
    try {
      const full = path.join(repo, file);
      const stat = lstatSync(full);
      const bytes = stat.isSymbolicLink() ? readlinkSync(full) : readFileSync(full);
      return [file, createHash('sha256').update(String(stat.mode)).update(bytes).digest('hex')];
    } catch (error) { if (error.code === 'ENOENT') return [file, null]; throw error; }
  }));
}

export function manifestChanges(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(file => (before[file] ?? null) !== (after[file] ?? null)).sort();
}

export function saveSourceSnapshot(repo, files, folder) {
  mkdirSync(folder, { recursive: true });
  const manifest = {};
  for (const file of files) {
    if (!safePath(file)) throw new Error('Invalid snapshot path');
    try {
      const source = path.join(repo, file);
      if (lstatSync(source).isSymbolicLink()) throw new Error(`Cannot snapshot changed symlink: ${file}`);
      const body = readFileSync(source);
      const dest = path.join(folder, 'source', file);
      mkdirSync(path.dirname(dest), { recursive: true });
      writeFileSync(dest, body);
      manifest[file] = createHash('sha256').update(body).digest('hex');
    } catch (error) { if (error.code === 'ENOENT') manifest[file] = null; else throw error; }
  }
  writeFileSync(path.join(folder, 'snapshot.json'), JSON.stringify({ repo, head: head(repo), files: manifest }, null, 2) + '\n');
}

export function changedFiles(repo, base) {
  return [...new Set([
    ...git(repo, ['diff', '--no-renames', '--name-only', '-z', base]).split('\0'),
    ...git(repo, ['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean))].sort();
}

export function treeId(repo, base) {
  const hash = createHash('sha256');
  hash.update(git(repo, ['diff', '--binary', '--no-ext-diff', base]));
  for (const file of changedFiles(repo, base)) {
    hash.update(file + '\0');
    try {
      const full = path.join(repo, file);
      const stat = lstatSync(full);
      hash.update(String(stat.mode));
      hash.update(stat.isSymbolicLink() ? readlinkSync(full) : readFileSync(full));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  return hash.digest('hex');
}

export function scopeErrors(repo, base, block, project) {
  const protectedPaths = ['.git/', '.claude/', '.agents/', ...project.protectedPaths];
  return changedFiles(repo, base).flatMap(file => {
    if (!block.paths.some(p => within(file, p)) || protectedPaths.some(p => within(file, p))) return [`Outside allowed scope: ${file}`];
    try { if (lstatSync(path.join(repo, file)).isSymbolicLink()) return [`Changed symlink is not allowed: ${file}`]; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return [];
  });
}

export function cloneAt(source, dest, commit) {
  git(source, ['clone', '--no-hardlinks', '--no-checkout', '--', source, dest]);
  git(dest, ['remote', 'remove', 'origin']);
  git(dest, ['checkout', '-q', '--detach', commit]);
  git(dest, ['config', 'core.hooksPath', '/dev/null']);
  git(dest, ['config', 'commit.gpgsign', 'false']);
  for (const key of ['user.name', 'user.email']) {
    const value = git(source, ['config', '--get', key], { allowFail: true });
    if (value?.trim()) git(dest, ['config', key, value.trim()]);
  }
}
