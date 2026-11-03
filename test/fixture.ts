import type { TestContext } from 'node:test';
import type { CLIPlan, FileBundle, ModelCall, ModelResult, PrepareArgs, Project, Review } from '../lib/types.ts';
export interface FixtureOptions { plan?: Partial<CLIPlan>; project?: Partial<Project>; extraFiles?: FileBundle }
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { git, head } from '../lib/git.ts';
import { prepare } from '../lib/workspace.ts';

export const passedReview = (): Review => ({ standards: { passed: true, findings: [] }, spec: { passed: true, findings: [] }, summary: 'Requested behavior is covered.', notVerified: [] });

export function fixture(t: TestContext, { plan = {}, project = {}, extraFiles = {} }: FixtureOptions = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'harness-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const repo = path.join(root, 'source');
  const task = path.join(root, 'task');
  const folder = path.join(root, 'run');
  mkdirSync(repo);
  mkdirSync(task);
  const files = {
    '.gitignore': 'node_modules/\n',
    'RULES.md': 'Use existing public contracts. Do not weaken checks.\n',
    'src/calc.mjs': 'export const double = n => n;\n',
    'test/calc.test.mjs': "import assert from 'node:assert/strict'; import {test} from 'node:test'; import {double} from '../src/calc.mjs'; test('double', () => {assert.equal(double(4),8);assert.equal(double(-3),-6);});\n",
    ...extraFiles,
  };
  for (const [name, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(repo, name)), { recursive: true });
    writeFileSync(path.join(repo, name), body);
  }
  git(repo, ['init', '-q', '-b', 'main']);
  git(repo, ['config', 'user.name', 'Test fixture']);
  git(repo, ['config', 'user.email', 'fixture@example.invalid']);
  git(repo, ['add', '-A']);
  git(repo, ['-c', 'commit.gpgsign=false', 'commit', '-qm', 'Fixture']);
  writeFileSync(path.join(task, 'TASK.md'), 'Double numbers while preserving the export. Verify positive and negative values. No product decisions remain.\n');
  writeFileSync(path.join(task, 'RUN.json'), JSON.stringify({ version: 1, name: 'Double numbers', model: 'fixture', maxUsd: 2, maxTurns: 10, timeoutMinutes: 1, maxRepairPasses: 0, delivery: 'diff', blocks: [{ id: 'double', title: 'Double numbers', paths: ['src/calc.mjs'], dependsOn: [] }], ...plan }));
  const projectFile = path.join(root, 'project.json');
  writeFileSync(projectFile, JSON.stringify({ version: 1, repo, instructions: ['RULES.md'], checks: [{ name: 'behavior', command: '{node} --test test/*.test.mjs', timeoutMinutes: 1 }], protectedPaths: ['test/','.gitignore','RULES.md'], ...project }));
  const args: PrepareArgs = { task, project: projectFile, folder };
  return { root, repo, task, folder, projectFile, args, base: head(repo), prepare: () => prepare({ ...args, approve: prepare(args).approvalHash }) };
}

export function goodModel({ role, saved }: Pick<ModelCall, 'role' | 'saved'>): ModelResult {
  if (role === 'build') writeFileSync(path.join(saved.repo, 'src/calc.mjs'), 'export const double = n => n * 2;\n');
  return { ok: true, costUsd: 0.1, review: role === 'review' ? passedReview() : null };
}
