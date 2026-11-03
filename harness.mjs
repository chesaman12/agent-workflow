#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { prepare, readRun, recover, schedule } from './lib/workspace.mjs';
import { execute, preview } from './lib/runner.mjs';
import { report } from './lib/report.mjs';
import { loadDraft } from './lib/config.mjs';
import { evalCommand } from './evals/run.mjs';
import { nativeCommand } from './lib/native.mjs';
import { startReviewServer } from './lib/review-server.mjs';
import { feedbackCommand } from './lib/feedback.mjs';

const help = `Agent Workflow

  node harness.mjs native --action init --task TASK_FOLDER --project PROJECT_JSON --run RUN_FOLDER
  node harness.mjs native --action claim|check|review|repair|final-check|final-review|status --run RUN_FOLDER --block ID --actor WORKER_ID [--input REVIEW_JSON]
  node harness.mjs feedback --action capture|accept|list|export --run RUN_FOLDER [--input JSON --folder EXPORT_FOLDER]
  node harness.mjs eval --action quality --input HUMAN_LABELS_JSON
  node harness.mjs serve --run RUN_FOLDER                Visual review with durable notes
  node harness.mjs prepare --task TASK_FOLDER --project PROJECT_JSON --run RUN_FOLDER [--preferences PREFERENCES_JSON]
  node harness.mjs prepare ... --approve HASH
  node harness.mjs run --run RUN_FOLDER                  Preview only
  node harness.mjs run --run RUN_FOLDER --execute        Build and review one block
  node harness.mjs run --run RUN_FOLDER --execute --all  Process eligible blocks
  node harness.mjs status --run RUN_FOLDER
  node harness.mjs review --run RUN_FOLDER
  node harness.mjs recover --run RUN_FOLDER --block ID --reason TEXT
  node harness.mjs doctor --task TASK_FOLDER --project PROJECT_JSON [--preferences PREFERENCES_JSON]
  node harness.mjs eval --action list|prepare|grade [--case ID --folder PATH --cases MODULE]

prepare and run preview by default. No global installation is required.
TASK.md holds requirements. RUN.json holds execution settings. Project rules are always explicit.
`;

try {
  const [command, ...args] = process.argv.slice(2);
  if (!command || command === 'help' || command === '--help') { console.log(help); }
  else {
    const options = Object.fromEntries(['task','project','run','preferences','approve','block','reason','action','case','folder','cases','input','actor','port'].map(k => [k,{type:'string'}]));
    options.execute={type:'boolean'}; options.all={type:'boolean'};
    const { values: flags } = parseArgs({args,options});
    const absolute = key => flags[key] ? path.resolve(flags[key]) : undefined;
    let result;
    if (command === 'serve') {
      if (!flags.run) throw new Error('--run is required');
      const { url } = await startReviewServer(absolute('run'), { port: flags.port ? Number(flags.port) : 0 });
      result = { url, notes: path.join(absolute('run'), 'NOTES.md'), listening: '127.0.0.1 only' };
    } else if (command === 'feedback') {
      if (!flags.run) throw new Error('--run is required');
      result = feedbackCommand(flags);
    } else if (command === 'native') {
      if (!flags.run) throw new Error('--run is required');
      result = nativeCommand(flags);
      if (result.writes !== false && flags.action !== 'status') report(absolute('run'));
    } else if (command === 'eval') result = await evalCommand(flags);
    else if (command === 'doctor') {
      const { inputs, sourceChangesExcluded } = loadDraft(absolute('task'),absolute('project'),absolute('preferences'));
      result = { valid: true, source: inputs.project.repo, sourceChangesExcluded, copyPaths: inputs.project.copyPaths, network: inputs.project.network, modelRunPerformed: false, checksExecuted: false };
    } else {
      if (!flags.run) throw new Error('--run is required');
      const folder = absolute('run');
      if (command === 'prepare') result=prepare({task:absolute('task'),project:absolute('project'),preferences:absolute('preferences'),folder,approve:flags.approve});
      else if (command === 'run') result=flags.execute ? execute(folder,{all:flags.all}) : preview(folder);
      else if (command === 'review') result={review:report(folder)};
      else if (command === 'recover') result=recover(folder,flags.block,flags.reason);
      else if (command === 'status') { const {inputs,state}=readRun(folder); result={name:inputs.plan.name,blocks:schedule(inputs,state),spentUsd:state.spentUsd,costUnknown:state.costUnknown,deadline:state.deadline??null}; }
      else throw new Error(`Unknown command: ${command}`);
    }
    console.log(JSON.stringify(result,null,2));
    if (result.machinePassed === false || result.results?.some(r=>r.status==='failed')) process.exitCode=1;
  }
} catch (error) { console.error(error.message); process.exitCode=2; }
