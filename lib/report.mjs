import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readRun, schedule } from './workspace.mjs';
import { readNative } from './native.mjs';
import { changedFiles, head, treeId, sourceManifest } from './git.mjs';
import { digest, json } from './config.mjs';
import { writeReviewPage } from './review-page.mjs';

const readIf = file => existsSync(file) ? json(file) : null;

export function reviewModel(folder) {
  const mode = json(path.join(folder, 'inputs.json')).mode;
  const { inputs, state } = mode === 'native' ? readNative(folder) : readRun(folder);
  const native = mode === 'native';
  const source = inputs.project.repo;
  const presentation = readIf(path.join(folder, 'PRESENTATION.json')) ?? {};
  const current = native ? { tree: digest(sourceManifest(source)), head: head(source) } : null;
  const blocks = (native ? inputs.plan.blocks : schedule(inputs, state)).map(block => {
    const saved = state.blocks[block.id];
    const repo = native ? source : saved?.repo;
    const dir = path.join(folder, 'results', block.id);
    const checks = native ? saved?.checks : readIf(path.join(dir, 'checks.json'));
    const review = native ? saved?.review : readIf(path.join(dir, 'review.json'))?.review;
    const evidenceCurrent = !!checks && !!repo && existsSync(repo) && (native ? checks.tree === current.tree && checks.head === current.head : checks.tree === treeId(repo, saved.base) && (!checks.head || checks.head === head(repo)));
    return {
      id: block.id, title: block.title, status: saved?.status ?? block.status ?? 'planned', repo,
      base: saved?.base, tree: checks?.tree, evidenceCurrent, reason: saved?.reason ?? '',
      files: native ? saved?.files ?? [] : saved && existsSync(repo) ? changedFiles(repo, saved.base) : [],
      review, openReview: saved?.openReview ?? review, checks, repairAttempts: saved?.repairAttempts ?? 0,
      design: block.design ?? {}, detail: presentation.blocks?.[block.id] ?? {},
      reviewPath: path.join(dir, 'review.json'), checksPath: path.join(dir, 'checks.json'),
      firstSnapshot: path.join(dir, 'attempt-0', 'snapshot', 'source'),
    };
  });
  const finalCurrent = native && state.final?.checks?.tree === current.tree && state.final?.checks?.head === current.head;
  const ready = native ? state.final?.status === 'review_ready' && finalCurrent : blocks.every(b => ['accepted', 'review_ready'].includes(b.status) && b.evidenceCurrent);
  return {
    id: state.runId ?? digest(folder), title: inputs.plan.name, source, base: inputs.base, folder,
    mode: native ? 'Claude Desktop' : 'CLI', status: ready ? 'Ready for your review' : state.stopped ? 'Stopped with a handoff' : 'Work remains',
    ready, blocks, presentation, deadline: state.deadline, stopReason: state.stopReason,
    final: native ? { ...state.final, evidenceCurrent: finalCurrent, checksPath: path.join(folder, 'results', 'final', 'checks.json'), reviewPath: path.join(folder, 'results', 'final', 'review.json') } : null,
    notesPath: path.join(folder, 'NOTES.md'), taskPath: path.join(folder, 'TASK.md'),
  };
}

export function report(folder) {
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
