import type { EvalCases } from '../../../lib/types.ts';
const clock = `let time = 0;
export const now = () => time;
export const reset = () => { time = 0; };
export async function pause(ms) { time += ms; }
`;

export const readabilityCases: EvalCases = {
  'self-contained-comments': {
    prompt: 'Clean up src/access.mjs without changing behavior. Code comments must not cite documentation, section numbers, local sessions, or work phases. Remove the design essay and history. Keep only a short current reason if it adds information the code does not show. Preserve exports and permanent access grants.',
    files: {
      '.gitignore': 'node_modules/\n',
      'src/access.mjs': `/**
 * The access check described in access-policy.md §4.1.
 * The screen rules from screen-policy.md §4.3.
 * Phase 2 added the access check after the previous coding session.
 * See \`docs/architecture.md\` for the current plan.
 */
export function hasAccess(metadata) {
  return metadata.permissions.includes('read');
}

// Per the plan, expiration must never remove a permanent grant.
export function expiredAccess(metadata) {
  if (metadata.grantType === 'permanent') return metadata.permissions;
  return metadata.permissions.filter(key => key !== 'read');
}
`,
    },
    protected: [],
    commentFiles: ['src/access.mjs'],
    assertions: `const {hasAccess, expiredAccess} = await load('src/access.mjs');
assert.equal(hasAccess({permissions:['read']}), true);
assert.equal(hasAccess({permissions:[]}), false);
assert.deepEqual(expiredAccess({grantType:'permanent',permissions:['read','custom']}), ['read','custom']);
assert.deepEqual(expiredAccess({grantType:'temporary',permissions:['read','custom']}), ['custom']);
assert.doesNotMatch(read('src/access.mjs'), /access-policy|screen-policy|§|Phase 2|previous coding session|architecture[.]md|Per the plan/i);`,
    review: 'Reject a design essay with only its citations removed. Any remaining comment must explain a useful current reason. Confirm behavior was preserved.',
  },
  'polling-readability': {
    prompt: 'Refactor runJob in src/job.mjs for readability while preserving all outcomes. The owner rejects the dense main function and for (;;). Make connection, submission, error handling, and bounded completion polling easy to follow. Use a visible stopping condition, without for (;;) or while (true). Do not scatter the logic into trivial helpers. Keep the interface, retry failed completion reads until the deadline, and never report completion from a submission response alone. The clock is supplied for deterministic tests; leave it unchanged. Add a behavioral regression test. Do not add a worker or change scheduling policy in this task.',
    files: {
      '.gitignore': 'node_modules/\n',
      'src/clock.mjs': clock,
      'src/job.mjs': `import { now, pause } from './clock.mjs';

export async function runJob({ queueId, isComplete, client, wait = { everyMs: 2, forMs: 10 } }) {
  if (!client || !queueId) return 'not_configured';
  if (!(await client.connect(queueId).catch(() => false))) return 'not_configured';
  const result = await client.submit().catch(() => null);
  if (!result || result.outcome === 'failed') return 'failed';
  if (!result.accepted) return 'not_queued';
  const giveUpAt = now() + wait.forMs;
  for (;;) {
    if (await isComplete().catch(() => false)) return 'completed';
    if (now() >= giveUpAt) return 'pending';
    await pause(wait.everyMs);
  }
}
`,
    },
    protected: ['src/clock.mjs'],
    commentFiles: ['src/job.mjs'],
    assertions: `const {runJob} = await load('src/job.mjs');
const clock = await load('src/clock.mjs');
const freshClient = () => ({connect:async()=>true, submit:async()=>({outcome:'success',accepted:true})});
const isComplete = async()=>true;
const run = async (changes={}) => { clock.reset(); return runJob({queueId:'queue_1',isComplete,client:freshClient(),...changes}); };
assert.equal(await run(), 'completed');
assert.equal(await run({queueId:null}), 'not_configured');
assert.equal(await run({client:null}), 'not_configured');
const never = async()=>{throw Error('must not be called');};
assert.equal(await run({client:{connect:async()=>false,submit:never}}), 'not_configured');
assert.equal(await run({client:{connect:async()=>{throw Error('offline');},submit:never}}), 'not_configured');
assert.equal(await run({client:{...freshClient(),submit:async()=>{throw Error('offline');}}}), 'failed');
assert.equal(await run({client:{...freshClient(),submit:async()=>({outcome:'failed',accepted:false})},isComplete:never}), 'failed');
assert.equal(await run({client:{...freshClient(),submit:async()=>({outcome:'success',accepted:false})},isComplete:never}), 'not_queued');
let reads=0;
assert.equal(await run({isComplete:async()=>++reads===3}), 'completed');
assert.equal(reads, 3);
assert.equal(clock.now(), 4);
assert.equal(await run({isComplete:async()=>false}), 'pending');
assert.equal(clock.now(), 10);
reads=0;
assert.equal(await run({isComplete:async()=>{if(++reads===1)throw Error('temporary');return reads===3;}}), 'completed');
assert.equal(await run({isComplete:async()=>{throw Error('offline');}}), 'pending');
assert.equal(clock.now(), 10);
assert.equal(await run({isComplete:async()=>false,wait:{everyMs:3,forMs:10}}), 'pending');
assert.equal(clock.now(), 12);
assert.doesNotMatch(read('src/job.mjs'), /for\\s*\\(\\s*;\\s*;\\s*\\)|while\\s*\\(\\s*(?:true|1)\\s*\\)/);
assert.ok(files.some(f => /\\.test\\.mjs$/.test(f)), 'add a behavioral test');`,
    review: 'Read the full result without comments. Setup, submission, retry handling, and the deadline should be clear. Reject dense inline catches, renamed infinite loops, trivial helper chains, and a test that merely checks source spelling. Mechanical checks cannot decide readability.',
  },
};
