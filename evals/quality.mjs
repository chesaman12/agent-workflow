import { readFileSync } from 'node:fs';

const median = values => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

export function summarizeQuality(data) {
  if (!Array.isArray(data.reviewerCases) || !Array.isArray(data.trials)) throw new Error('Supply reviewerCases and trials arrays; no model score is inferred');
  const cases = data.reviewerCases;
  const caseIds = new Set();
  for (const item of cases) {
    if (!item.id || caseIds.has(item.id) || typeof item.acceptable !== 'boolean' || !Array.isArray(item.importantIssues) || !Array.isArray(item.matchedIssues) || !Number.isInteger(item.falseBlockers) || item.falseBlockers < 0) throw new Error('Reviewer cases need unique ids and human-adjudicated labels');
    if (new Set(item.importantIssues).size !== item.importantIssues.length || new Set(item.matchedIssues).size !== item.matchedIssues.length || item.matchedIssues.some(id => !item.importantIssues.includes(id))) throw new Error('Issue matches must identify unique expected issues');
    if (item.acceptable && item.importantIssues.length) throw new Error('Acceptable controls cannot contain required issues');
    caseIds.add(item.id);
  }
  const important = cases.reduce((n, c) => n + c.importantIssues.length, 0);
  const matched = cases.reduce((n, c) => n + c.matchedIssues.length, 0);
  const controls = cases.filter(c => c.acceptable);
  const groups = new Map();
  const trialIds = new Set();
  for (const trial of data.trials) {
    if (!trial.id || trialIds.has(trial.id) || !trial.task || !trial.variant || !['first-pass', 'after-review'].includes(trial.stage) || typeof trial.correctnessPassed !== 'boolean' || typeof trial.ownerAccepted !== 'boolean' || ![trial.reviewMinutes, trial.repairMinutes].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Trials need unique ids, task, variant, stage, behavioral outcome and owner labels with measured minutes');
    trialIds.add(trial.id);
    const key = `${trial.variant} / ${trial.stage}`;
    groups.set(key, [...(groups.get(key) ?? []), trial]);
  }
  return {
    reviewer: { cases: cases.length, importantIssues: important, matchedIssues: matched, recall: important ? matched / important : null, acceptableControls: controls.length, falseBlockersOnControls: controls.reduce((n, c) => n + c.falseBlockers, 0) },
    outcomes: [...groups.entries()].map(([condition, trials]) => ({ condition, trials: trials.length, correctnessPassed: trials.filter(t => t.correctnessPassed).length, ownerAccepted: trials.filter(t => t.ownerAccepted).length, medianOwnerMinutes: median(trials.map(t => t.reviewMinutes + t.repairMinutes)) })),
    conclusion: 'Descriptive human-labeled results only. Empty or small samples do not establish quality improvement. Compare matched tasks, environments and budgets; keep first-pass and repaired outcomes separate.',
  };
}

export function qualityCommand(flags) {
  if (!flags.input) throw new Error('Quality evaluation needs --input with measured trials and human labels');
  return summarizeQuality(JSON.parse(readFileSync(flags.input, 'utf8')));
}
