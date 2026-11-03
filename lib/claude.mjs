import path from 'node:path';
import { homedir } from 'node:os';
import { runBounded } from './process.mjs';
import { cleanEnv, commandFor } from './checks.mjs';

import { REVIEW_SCHEMA } from './quality.mjs';
export { REVIEW_SCHEMA, reviewPassed } from './quality.mjs';

export function settingsFor(inputs, folder, saved, role) {
  const { project } = inputs;
  const runtimeRoot = path.dirname(path.dirname(process.execPath));
  const readPaths = [saved.repo, path.join(folder,'skills'), path.join(folder,'preferences'), runtimeRoot, ...project.readOnlyPaths];
  const read = readPaths.flatMap(p => [`Read(/${p})`,`Read(/${p}/**)`]);
  const secrets = ['**/.env','**/.env.*','**/.dev.vars*','**/.npmrc','**/id_rsa','**/id_ed25519'];
  const gitCommands = ['git status *','git diff *','git show *','git log *','git ls-files *','git rev-parse *'];
  const commands = role === 'review' ? gitCommands : [...gitCommands, ...project.commands, ...project.checks.map(s => commandFor(s.command, { ...saved, folder }))];
  const protectedPaths = [path.join(saved.repo,'.git'), path.join(saved.repo,'.claude'), path.join(saved.repo,'.agents'), ...project.protectedPaths.map(p => path.join(saved.repo,p)), ...project.copyPaths.map(p => path.join(saved.repo,p))];
  return {
    disableAllHooks: true,
    permissions: {
      defaultMode: 'dontAsk',
      allow: [...read, ...commands.map(c => `Bash(${c})`), ...(role !== 'review' ? ['Edit(./**)','Write(./**)'] : [])],
      deny: ['mcp__*','Agent','Task','Skill','WebFetch','WebSearch', ...secrets.map(p => `Read(${p})`), ...protectedPaths.flatMap(p => [`Edit(/${p})`,`Edit(/${p}/**)`,`Write(/${p})`,`Write(/${p}/**)`]), ...['git add *','git commit *','git push *','git remote *','git reset *','git clean *','git fetch *','git pull *','ssh *','scp *','docker *','colima *','npm install *','npm ci *','npm publish *','pnpm install *'].map(c => `Bash(${c})`)],
    },
    sandbox: {
      enabled: true, failIfUnavailable: true, allowUnsandboxedCommands: false, autoAllowBashIfSandboxed: false, excludedCommands: [],
      filesystem: {
        denyRead: [homedir(),'/Users','/home','/root','/Volumes','/private/var','/tmp','/var/tmp',...secrets.map(p => `${saved.repo}/${p}`)],
        allowRead: readPaths,
        denyWrite: [path.join(folder,'inputs.json'),path.join(folder,'state.json'),path.join(folder,'TASK.md'),path.join(folder,'NOTES.md'),path.join(folder,'skills'),path.join(folder,'preferences'),...protectedPaths,...project.readOnlyPaths,...(role === 'review' ? [saved.repo] : [])],
      },
      network: { ...project.network, strictAllowlist: true, allowUnixSockets: [], allowAllUnixSockets: false },
    },
  };
}

function skill(inputs, name) {
  const source = inputs.skills[`${name}/SKILL.md`];
  if (!source) throw new Error(`Missing selected skill: ${name}`);
  return source.replace(/^---\n[\s\S]*?\n---\n/, '').trim();
}

export function promptFor(inputs, folder, block, saved, role, checks, prior = null) {
  const selected = role !== 'review' ? ['implement','tdd'] : ['code-review'];
  const prefs = inputs.preferences.settings.instructions;
  const evidence = role === 'review' && checks && { ...checks, steps: checks.steps.map(({ output, ...step }) => ({ ...step, outputTail: output?.slice(-2000) })) };
  return [
    `Role: ${role}. Follow the selected adapted skills below. They are supplied directly; no Skill tool or installed plugin is needed. Do not spawn agents.`,
    ...selected.map(name => `Selected skill: ${name}\nSource file: ${path.join(folder,'skills',name,'SKILL.md')}\n${skill(inputs,name)}`),
    `Supporting skill files: ${path.join(folder,'skills')}. Resolve relative references from each skill's source file, not from the application checkout. Read relevant references when needed.`,
    `Selected block: ${JSON.stringify(block)}\nCheckout: ${saved.repo}\nBase: ${saved.base}\nDelivery: ${inputs.plan.delivery}`,
    `TASK.md:\n${inputs.brief}`,
    role === 'repair' ? `Repair the recorded failure within the existing task. Do not weaken checks or redefine acceptance.\n${JSON.stringify(checks)}` : '',
    prior ? `Previous required findings need explicit independent closure. Preserve finding IDs for unresolved issues.\n${JSON.stringify(prior)}` : '',
    `Repository instructions from the approved source:\n${Object.entries(inputs.instructions).map(([name,body])=>`${name}\n${body}`).join('\n\n')}`,
    prefs ? `Selected personal preferences:\n${inputs.preferences.files[prefs]}` : 'No personal preferences were selected.',
    `Required checks: ${JSON.stringify(inputs.project.checks)}\nPermitted development network: ${JSON.stringify(inputs.project.network)}. Use only the supplied test environment. No production access, push, merge, deploy, installs, or commits.`,
    role === 'review' ? `Check evidence:\n${JSON.stringify(evidence)}\nReturn only the requested structured review. A builder report is not proof. Read the diff and untracked files. Do not edit or run checks again.` : 'Leave the implementation uncommitted. The runner independently runs the required checks and review. Report missing dependencies or unresolved decisions; do not silently change the task.',
  ].join('\n\n');
}

export function runClaude({ inputs, folder, saved, role, prompt, maxUsd, timeoutMs }) {
  const settings = settingsFor(inputs, folder, saved, role);
  const tools = role === 'review' ? 'Read,Glob,Grep,Bash' : 'Read,Edit,Write,Glob,Grep,Bash';
  const args = ['--safe-mode','-p',prompt,'--model',inputs.plan.model,'--max-budget-usd',String(maxUsd),'--max-turns',String(inputs.plan.maxTurns),'--no-session-persistence','--output-format','json','--permission-mode','dontAsk','--setting-sources','','--settings',JSON.stringify(settings),'--tools',tools,'--strict-mcp-config','--mcp-config','{"mcpServers":{}}'];
  if (role === 'review') args.push('--json-schema',JSON.stringify(REVIEW_SCHEMA));
  const run = runBounded(process.env.HARNESS_CLAUDE_BIN || 'claude', args, { cwd: saved.repo, timeoutMs, env: cleanEnv(saved.repo,inputs.project.env,path.join(folder,'scratch','model')) });
  try {
    const value = JSON.parse(run.stdout);
    return { ok: run.status === 0 && !run.error && value.is_error !== true, costUsd: Number.isFinite(value.total_cost_usd) && value.total_cost_usd >= 0 ? value.total_cost_usd : null, text: value.result ?? '', review: value.structured_output ?? null, error: run.error?.message ?? (run.status !== 0 ? run.stderr.slice(-1000) : null) };
  } catch { return { ok: false, costUsd: null, text: '', review: null, error: run.error?.message ?? (run.stderr || 'CLI did not return valid JSON').slice(-1000) }; }
}
