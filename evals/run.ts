import type { EvalCases, Flags } from '../lib/types.ts';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { git, head, changedFiles } from '../lib/git.ts';
import { runBounded } from '../lib/process.ts';
import { cleanEnv } from '../lib/checks.ts';
import { traps } from './cases.ts';
import { qualityCommand } from './quality.ts';

export function prepareCase(id: string, folder: string, cases: EvalCases = traps) {
  const task=cases[id];
  if (!task) throw new Error('Unknown eval case');
  if (existsSync(folder)) throw new Error('Use a new eval folder');
  const repo=path.join(folder,'repo');
  mkdirSync(repo,{recursive:true});
  for (const [file,body] of Object.entries(task.files)) { mkdirSync(path.dirname(path.join(repo,file)),{recursive:true}); writeFileSync(path.join(repo,file),body); }
  git(repo,['init','-q','-b','main']);
  git(repo,['add','-A']);
  git(repo,['-c','user.name=Eval fixture','-c','user.email=fixture@example.invalid','-c','commit.gpgsign=false','commit','-qm','Start fixture']);
  writeFileSync(path.join(folder,'case.json'),JSON.stringify({id,base:head(repo)}));
  writeFileSync(path.join(folder,'TASK.md'),task.prompt+'\n\nWork only in the repo folder. Leave changes uncommitted. No push, install, network, or services.\n');
  return {id,repo,task:path.join(folder,'TASK.md'),modelRunPerformed:false};
}

export function gradeCase(id: string, folder: string, cases: EvalCases = traps) {
  const task=cases[id];
  const state=JSON.parse(readFileSync(path.join(folder,'case.json'), 'utf8')) as { id: string; base: string };
  if (!task || state.id!==id) throw new Error('Eval does not match prepared case');
  const repo=path.join(folder,'repo');
  const protectedChanged=task.protected.filter(file=>!existsSync(path.join(repo,file)) || readFileSync(path.join(repo,file),'utf8')!==task.files[file]);
  const files=git(repo,['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean);
  const code=`import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; import {pathToFileURL} from 'node:url'; import path from 'node:path'; const repo=${JSON.stringify(repo)}; const files=${JSON.stringify(files)}; const read=f=>readFileSync(path.join(repo,f),'utf8'); const load=f=>import(pathToFileURL(path.join(repo,f))); ${task.assertions}`;
  const result=runBounded(process.execPath,['--input-type=module','-e',code],{cwd:repo,env:cleanEnv(repo),timeoutMs:10000});
  const tests = runBounded(process.execPath, ['--test'], {
    cwd: repo, env: cleanEnv(repo), timeoutMs: 30000,
  });
  const testsPassed = tests.status === 0;
  return {
    id,
    machinePassed: changedFiles(repo, state.base).length > 0 &&
      !protectedChanged.length && result.status === 0 && testsPassed,
    protectedChanged,
    assertionsPassed: result.status === 0,
    testsPassed,
    testCommand: [process.execPath, '--test'],
    detail: result.error?.message ?? result.stderr.slice(-1000),
    testDetail: tests.error?.message ?? (tests.stdout + tests.stderr).slice(-3000),
    ownerReviewRequired: task.review,
  };
}

export async function evalCommand(flags: Flags) {
  if (flags.action === 'quality') return qualityCommand(flags);
  const cases: EvalCases | undefined = flags.cases ? Object.values(await import(pathToFileURL(path.resolve(flags.cases)).href) as Record<string, unknown>).find(v => v && typeof v === 'object') as EvalCases | undefined : traps;
  if (!cases) throw new Error('Eval module must export a case map');
  const action=flags.action??'list';
  if (action==='list') return Object.entries(cases).map(([id,t])=>({id,prompt:t.prompt}));
  if (!flags.folder || !flags.case) throw new Error('Eval needs --folder and --case');
  if (action==='prepare') return prepareCase(flags.case,path.resolve(flags.folder),cases);
  if (action==='grade') return gradeCase(flags.case,path.resolve(flags.folder),cases);
  throw new Error('Eval action must be list, prepare, or grade');
}
