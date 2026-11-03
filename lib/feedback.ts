import type { Flags, SourceManifest } from './types.ts';
interface FeedbackRecord {
  id: string; block: string; scope: 'project' | 'personal' | 'general';
  family: string; criticism: string; principle: string; files: string[];
  repo: string; status: 'candidate' | 'accepted'; capturedAt: string; sourceTree: string;
  ownerStatement?: string; acceptedAt?: string;
}
interface FeedbackInput {
  id: string; block: string; scope: FeedbackRecord['scope']; family?: string;
  criticism: string; principle: string; files: string[];
  accepted?: boolean; ownerStatement?: string;
}
import { existsSync, mkdirSync, readdirSync, writeFileSync, cpSync } from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { json, digest } from './config.ts';
import { safePath, sourceManifest, saveSourceSnapshot } from './git.ts';
import { reviewModel } from './report.ts';

function records(folder: string): FeedbackRecord[] {
  const root = path.join(folder, 'feedback');
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => json<FeedbackRecord>(path.join(root, e.name, 'record.json')));
}
function save(folder: string, record: FeedbackRecord) {
  writeFileSync(path.join(folder, 'feedback', record.id, 'record.json'), JSON.stringify(record, null, 2) + '\n');
  const lines = ['# Accepted corrections and candidate lessons', '', 'Captures do not change permanent policy.', ''];
  for (const item of records(folder)) lines.push(`- [${item.id}](./${item.id}/record.json): ${item.status}; ${item.scope}; ${item.principle}`);
  writeFileSync(path.join(folder, 'feedback', 'INDEX.md'), lines.join('\n') + '\n');
}

export function feedbackCommand(flags: Flags & { run: string }) {
  const folder = path.resolve(flags.run);
  const model = reviewModel(folder);
  if (flags.action === 'list') return records(folder);
  if (flags.action === 'export') {
    if (!flags.folder || existsSync(flags.folder)) throw new Error('Export needs a new --folder');
    const accepted = records(folder).filter(r => r.status === 'accepted');
    if (!accepted.length) throw new Error('No owner-accepted corrections to export');
    const target = path.resolve(flags.folder);
    const labels = [];
    for (const record of accepted) for (const version of ['before', 'after']) {
      const id = randomBytes(8).toString('hex');
      const dest = path.join(target, 'public', id);
      mkdirSync(dest, { recursive: true });
      cpSync(path.join(folder, 'feedback', record.id, version, 'source'), path.join(dest, 'source'), { recursive: true });
      writeFileSync(path.join(dest, 'TASK.md'), 'Review the supplied code for material maintainability problems. Name specific locations and consequences. Do not invent findings. This is a development example, not an untouched held-out case.\n');
      labels.push({ id, sourceRecord: record.id, version, expectedImportantIssue: version === 'before' ? record.criticism : null, ownerAccepted: version === 'after', family: record.family ?? record.id, split: 'development' });
    }
    mkdirSync(path.join(target, 'private'));
    writeFileSync(path.join(target, 'private', 'labels.json'), JSON.stringify(labels, null, 2) + '\n');
    return { public: path.join(target, 'public'), labels: path.join(target, 'private', 'labels.json'), cases: labels.length, warning: 'Restrict reviewer access to public. These examples are development material, not an independent quality result.' };
  }
  if (!flags.input) throw new Error('Feedback needs --input JSON with the owner words and selected files');
  const value = json<FeedbackInput>(flags.input);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value.id ?? '')) throw new Error('Feedback needs a stable lowercase id');
  const dest = path.join(folder, 'feedback', value.id);
  if (flags.action === 'capture') {
    if (existsSync(dest)) throw new Error('Feedback id already exists');
    if (!value.criticism?.trim() || !value.principle?.trim() || !['project', 'personal', 'general'].includes(value.scope)) throw new Error('Capture needs actual criticism, a candidate principle and its scope');
    const block = model.blocks.find(b => b.id === value.block);
    if (!block?.repo || !Array.isArray(value.files) || !value.files.length || value.files.some(f => !safePath(f))) throw new Error('Capture needs a known block and relative source files');
    const manifest = sourceManifest(block.repo);
    if (value.files.some(f => !manifest[f])) throw new Error('Selected feedback files must exist in the source manifest');
    mkdirSync(dest, { recursive: true });
    saveSourceSnapshot(block.repo, value.files, path.join(dest, 'before'));
    const record: FeedbackRecord = { id: value.id, block: block.id, scope: value.scope, family: value.family ?? value.id, criticism: value.criticism, principle: value.principle, files: value.files, repo: block.repo, status: 'candidate', capturedAt: new Date().toISOString(), sourceTree: digest(manifest) };
    save(folder, record);
    return { record: path.join(dest, 'record.json'), status: record.status, policyChanged: false };
  }
  if (flags.action === 'accept') {
    const record = json<FeedbackRecord>(path.join(dest, 'record.json'));
    if (record.status !== 'candidate') throw new Error('Only a candidate correction can be accepted');
    if (value.accepted !== true || !value.ownerStatement?.trim()) throw new Error('Acceptance needs the actual owner acceptance statement; silence is not acceptance');
    sourceManifest(record.repo);
    saveSourceSnapshot(record.repo, record.files, path.join(dest, 'after'));
    const before = json<{ files: SourceManifest }>(path.join(dest, 'before', 'snapshot.json')).files;
    const after = json<{ files: SourceManifest }>(path.join(dest, 'after', 'snapshot.json')).files;
    if (digest(before) === digest(after)) throw new Error('No corrected code has been recorded');
    Object.assign(record, { status: 'accepted', ownerStatement: value.ownerStatement, acceptedAt: new Date().toISOString() });
    save(folder, record);
    return { status: record.status, policyChanged: false, next: 'Compare recurring accepted examples before proposing a permanent constraint.' };
  }
  throw new Error('Feedback action must be capture, accept, list or export');
}
