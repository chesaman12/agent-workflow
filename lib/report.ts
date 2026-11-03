import type { Checks, Design, NativeBlock, Review, SourceLink } from './types.ts';
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRun, schedule } from './workspace.ts';
import { readNative } from './native.ts';
import { changedFiles, head, treeId, sourceManifest } from './git.ts';
import { digest, json } from './config.ts';
import { writeReviewPage } from './review-page.ts';

export interface Presentation {
  summary?: string;
  decisions?: string[];
  blocks?: Record<string, {
    outcome?: string;
    readFirst?: SourceLink[];
    demonstration?: string;
    screenshots?: { file: string; caption?: string }[];
  }>;
}
export interface ReviewBlock {
  id: string; title: string; status: string; repo: string;
  base?: string; tree?: string; evidenceCurrent: boolean; reason: string;
  files: string[]; review: Review | null; openReview: Review | null;
  checks: Checks | null; repairAttempts: number; design: Partial<Design>;
  detail: NonNullable<Presentation['blocks']>[string];
  reviewPath: string; checksPath: string; firstSnapshot: string;
}
export interface ReviewModel {
  id: string; title: string; source: string; base: string; folder: string;
  mode: string; status: string; ready: boolean; blocks: ReviewBlock[];
  presentation: Presentation; deadline?: number; stopReason?: string;
  final: (Partial<NativeBlock> & { evidenceCurrent: boolean; checksPath: string; reviewPath: string }) | null;
  notesPath: string; taskPath: string;
}
const readIf = <T>(file: string): T | null => existsSync(file) ? json<T>(file) : null;

export function reviewModel(folder: string): ReviewModel {
  const mode = json<{ mode?: string }>(path.join(folder, 'inputs.json')).mode;
  const nativeRun = mode === 'native' ? readNative(folder) : null;
  const cliRun = nativeRun ? null : readRun(folder);
  const inputs = nativeRun?.inputs ?? cliRun!.inputs;
  const state = nativeRun?.state ?? cliRun!.state;
  const source = inputs.project.repo;
  const presentation = readIf<Presentation>(path.join(folder, 'PRESENTATION.json')) ?? {};
  const current = nativeRun ? { tree: digest(sourceManifest(source)), head: head(source) } : null;
  const planned = nativeRun ? inputs.plan.blocks : schedule(cliRun!.inputs, cliRun!.state);
  const blocks: ReviewBlock[] = planned.map(block => {
    const nativeSaved = nativeRun?.state.blocks[block.id];
    const cliSaved = cliRun?.state.blocks[block.id];
    const saved = nativeSaved ?? cliSaved;
    const repo = nativeRun ? source : cliSaved?.repo ?? source;
    const dir = path.join(folder, 'results', block.id);
    const checks = nativeRun ? nativeSaved?.checks ?? null : readIf<Checks>(path.join(dir, 'checks.json'));
    const review = nativeRun ? nativeSaved?.review ?? null : readIf<{ review?: Review }>(path.join(dir, 'review.json'))?.review ?? null;
    const checkpointCurrent = !!cliSaved && existsSync(repo) && cliSaved.status === 'accepted' && cliSaved.head === head(repo) && checks?.head === cliSaved.base;
    const evidenceCurrent = !!checks && existsSync(repo) && (nativeRun
      ? checks.tree === current!.tree && checks.head === current!.head
      : !!cliSaved && checks.tree === treeId(repo, cliSaved.base) && (!checks.head || checks.head === head(repo) || checkpointCurrent));
    return {
      id: block.id, title: block.title, status: saved?.status ?? ('status' in block ? String(block.status) : 'planned'), repo,
      base: saved?.base, tree: checks?.tree, evidenceCurrent, reason: saved?.reason ?? '',
      files: nativeRun ? nativeSaved?.files ?? [] : cliSaved && existsSync(repo) ? changedFiles(repo, cliSaved.base) : [],
      review, openReview: saved?.openReview ?? review, checks, repairAttempts: saved?.repairAttempts ?? 0,
      design: block.design ?? {}, detail: presentation.blocks?.[block.id] ?? {},
      reviewPath: path.join(dir, 'review.json'), checksPath: path.join(dir, 'checks.json'),
      firstSnapshot: path.join(dir, 'attempt-0', 'snapshot', 'source'),
    };
  });
  const final = nativeRun?.state.final;
  const finalCurrent = !!current && final?.checks?.tree === current.tree && final?.checks?.head === current.head;
  const ready = nativeRun ? final?.status === 'review_ready' && finalCurrent : blocks.every(b => ['accepted', 'review_ready'].includes(b.status) && b.evidenceCurrent);
  return {
    id: nativeRun?.state.runId ?? digest(folder), title: inputs.plan.name, source, base: inputs.base, folder,
    mode: nativeRun ? 'Claude Desktop' : 'CLI', status: ready ? 'Ready for your review' : nativeRun?.state.stopped ? 'Stopped with a handoff' : 'Work remains',
    ready, blocks, presentation, deadline: state.deadline, stopReason: nativeRun?.state.stopReason,
    final: nativeRun ? { ...final, evidenceCurrent: finalCurrent, checksPath: path.join(folder, 'results', 'final', 'checks.json'), reviewPath: path.join(folder, 'results', 'final', 'review.json') } : null,
    notesPath: path.join(folder, 'NOTES.md'), taskPath: path.join(folder, 'TASK.md'),
  };
}

export function report(folder: string) {
  const model = reviewModel(folder);
  const lines = [`# ${model.title}`, '', model.status, '', `[Open visual review](${path.join(folder, 'REVIEW.html')})`, '', `[Your notes](${model.notesPath}) are never regenerated.`, '', `[Approved task](${model.taskPath})`, ''];
  if (model.stopReason) lines.push(`Stopped: ${model.stopReason}`, '');
  for (const block of model.blocks) {
    lines.push(`## ${block.title}: ${block.status}`, '', `Evidence current: ${block.evidenceCurrent}`, `Repair passes: ${block.repairAttempts}`, '');
    if (block.reason) lines.push(block.reason, '');
    if (block.review?.summary) lines.push(block.review.summary, '');
    for (const file of block.files) lines.push(`- [${file}](${path.join(block.repo, file)})`);
    lines.push('', `[Review](${block.reviewPath}) | [Check evidence](${block.checksPath})`, '');
  }
  if (model.final) lines.push(`Final integrated evidence current: ${!!model.final.evidenceCurrent}`, '', `[Final review](${model.final.reviewPath}) | [Final checks](${model.final.checksPath})`, '');
  lines.push('Human acceptance remains separate. Open the visual review, exercise the demonstration, and leave corrections in your normal conversation or saved notes.', '');
  const file = path.join(folder, 'REVIEW.md');
  writeFileSync(file, lines.join('\n'));
  writeReviewPage(model);
  return file;
}
