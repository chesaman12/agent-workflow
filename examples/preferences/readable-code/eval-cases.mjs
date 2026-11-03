const clock = `let time = 0;
export const now = () => time;
export const reset = () => { time = 0; };
export async function pause(ms) { time += ms; }
`;

export const readabilityCases = {
  'self-contained-comments': {
    prompt: 'Clean up src/membership.mjs without changing behavior. Code comments must not cite documentation, section numbers, local sessions, or work phases. Remove the design essay and history. Keep only a short current reason if it adds information the code does not show. Preserve exports and manual membership access.',
    files: {
      '.gitignore': 'node_modules/\n',
      'src/membership.mjs': `/**
 * The access check described in access-policy.md §4.1.
 * The screen rules from screen-policy.md §4.3.
 * Phase 2 added the access check after the previous coding session.
 * See \`docs/architecture.md\` for the current plan.
 */
export function hasAccess(metadata) {
  return metadata.appAccess.includes('sample-app');
}

// Per the plan, the webhook must never remove a manual grant.
export function expiredAccess(metadata) {
  if (metadata.source === 'manual') return metadata.appAccess;
  return metadata.appAccess.filter(key => key !== 'sample-app');
}
`,
    },
    protected: [],
    commentFiles: ['src/membership.mjs'],
    assertions: `const {hasAccess, expiredAccess} = await load('src/membership.mjs');
assert.equal(hasAccess({appAccess:['sample-app']}), true);
assert.equal(hasAccess({appAccess:[]}), false);
assert.deepEqual(expiredAccess({source:'manual',appAccess:['sample-app','custom']}), ['sample-app','custom']);
assert.deepEqual(expiredAccess({source:'store',appAccess:['sample-app','custom']}), ['custom']);
assert.doesNotMatch(read('src/membership.mjs'), /access-policy|screen-policy|§|Phase 2|previous coding session|architecture[.]md|Per the plan/i);`,
    review: 'Reject a design essay with only its citations removed. Any remaining comment must explain a useful current reason. Confirm behavior was preserved.',
  },
  'restore-readability': {
    prompt: 'Refactor restorePurchases in src/restore.mjs for readability while preserving all outcomes. The owner rejects the dense main function and for (;;). Make setup, store restore, error handling, and bounded membership polling easy to follow. Use a visible stopping condition, without for (;;) or while (true). Do not scatter the logic into trivial helpers. Keep the interface, retry failed mark reads until the deadline, and never grant membership from the store response alone. The clock is supplied for deterministic tests; leave it unchanged. Add a behavioral regression test. Do not add a server sync or change the access policy in this task.',
    files: {
      '.gitignore': 'node_modules/\n',
      'src/clock.mjs': clock,
      'src/restore.mjs': `import { now, pause } from './clock.mjs';

export async function restorePurchases({ userId, checkMark, store, wait = { everyMs: 2, forMs: 10 } }) {
  if (!store || !userId) return 'not_configured';
  if (!(await store.start(userId).catch(() => false))) return 'not_configured';
  const result = await store.restore().catch(() => null);
  if (!result || result.outcome === 'failed') return 'failed';
  if (!result.entitlementActive) return 'nothing';
  const giveUpAt = now() + wait.forMs;
  for (;;) {
    if (await checkMark().catch(() => false)) return 'restored';
    if (now() >= giveUpAt) return 'slow';
    await pause(wait.everyMs);
  }
}
`,
    },
    protected: ['src/clock.mjs'],
    commentFiles: ['src/restore.mjs'],
    assertions: `const {restorePurchases} = await load('src/restore.mjs');
const clock = await load('src/clock.mjs');
const freshStore = () => ({start:async()=>true, restore:async()=>({outcome:'success',entitlementActive:true})});
const checkMark = async()=>true;
const run = async (changes={}) => { clock.reset(); return restorePurchases({userId:'user_1',checkMark,store:freshStore(),...changes}); };
assert.equal(await run(), 'restored');
assert.equal(await run({userId:null}), 'not_configured');
assert.equal(await run({store:null}), 'not_configured');
const never = async()=>{throw Error('must not be called');};
assert.equal(await run({store:{start:async()=>false,restore:never}}), 'not_configured');
assert.equal(await run({store:{start:async()=>{throw Error('offline');},restore:never}}), 'not_configured');
assert.equal(await run({store:{...freshStore(),restore:async()=>{throw Error('offline');}}}), 'failed');
assert.equal(await run({store:{...freshStore(),restore:async()=>({outcome:'failed',entitlementActive:false})},checkMark:never}), 'failed');
assert.equal(await run({store:{...freshStore(),restore:async()=>({outcome:'success',entitlementActive:false})},checkMark:never}), 'nothing');
let reads=0;
assert.equal(await run({checkMark:async()=>++reads===3}), 'restored');
assert.equal(reads, 3);
assert.equal(clock.now(), 4);
assert.equal(await run({checkMark:async()=>false}), 'slow');
assert.equal(clock.now(), 10);
reads=0;
assert.equal(await run({checkMark:async()=>{if(++reads===1)throw Error('temporary');return reads===3;}}), 'restored');
assert.equal(await run({checkMark:async()=>{throw Error('offline');}}), 'slow');
assert.equal(clock.now(), 10);
assert.equal(await run({checkMark:async()=>false,wait:{everyMs:3,forMs:10}}), 'slow');
assert.equal(clock.now(), 12);
assert.doesNotMatch(read('src/restore.mjs'), /for\\s*\\(\\s*;\\s*;\\s*\\)|while\\s*\\(\\s*(?:true|1)\\s*\\)/);
assert.ok(files.some(f => /\\.test\\.mjs$/.test(f)), 'add a behavioral test');`,
    review: 'Read the full result without comments. Setup, restore, retry handling, and the deadline should be clear. Reject dense inline catches, renamed infinite loops, trivial helper chains, and a test that merely checks source spelling. Mechanical checks cannot decide readability.',
  },
};
