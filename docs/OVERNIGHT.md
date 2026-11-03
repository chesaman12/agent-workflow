# Long runs in a native coding session

Current implementation: use [the native helper workflow](NATIVE.md) for state, claims, checks, bounded repairs, final acceptance and the visual review. The helper makes no model calls. SESSION.md is a handoff summary, not a second status authority. Use the frozen helper returned by initialization. The guidance below still applies to host continuation, account limits and resource ownership.


Use the host to run the agents. Use this harness to define the work, verification, delegation, and saved handoff. Start with skills/orchestrate/SKILL.md. Project commands, permissions, source paths, and personal taste belong in the run inputs.

## Claude Desktop

Use a local session in the Code tab. Read the orchestration skill by its absolute path; no global installation is needed. The repository skills are not automatically installed slash commands.

Prepare the task and a SESSION.md record before starting. Confirm the source checkout includes the required uncommitted inputs. Resolve permissions needed by the actual plan, including test setup and dependencies, while the owner is present.

Claude's native `/goal` starts another turn while a completion condition remains unmet. It works in Desktop. Auto mode handles routine tool decisions separately. Neither feature grants authority beyond the task. Confirm both are available in the actual session. Do not silently fall back to bypass permissions. [Claude goal documentation](https://code.claude.com/docs/en/goal), [Desktop permissions](https://code.claude.com/docs/en/desktop#choose-a-permission-mode).

After preparation and approval, use a condition like this, replacing the absolute record path:

```text
/goal Follow the approved task and orchestration instructions recorded in /absolute/path/to/SESSION.md. Complete all ready approved blocks, with the required checks and independent review. Keep SESSION.md current and continue to the next ready block without asking again. Finish with the owner review and evidence. End when all approved work is verified, the saved absolute deadline is reached, or every remaining block has a documented blocker after bounded repair. Do not extend the deadline, scope, or permissions on resume. Report partial completion honestly.
```

The condition is a model-evaluated stopping rule, not a hard process timeout. The goal can pause or end on errors. At usage limits, automatic continuation depends on the host's reset-wait feature. Test availability before leaving. The saved absolute deadline remains authoritative because a resumed goal's own timer can reset. [Goal lifecycle](https://code.claude.com/docs/en/goal).

Current Claude Code supports waiting for a subscription reset and continuing in an open interactive session. Confirm the Desktop session supports it and has not disabled it. Keep the computer awake; a long sleep can require manual continuation. Repeated limit hits can also stop automatic recovery. This is separate from enabling paid usage credits. [Reset waiting](https://code.claude.com/docs/en/interactive-mode#wait-for-a-usage-limit-to-reset).

## Codex

Use one lead chat with the native goal and subagent tools available in that session. Ask the lead to create the goal explicitly. Confirm that the goal is active and a bounded worker can finish a real task before relying on unattended continuation. This flow does not use `harness.mjs` or require a global skill install.

Give the lead the absolute paths to the approved task, checkout, orchestration skill, and saved session record. For example:

```text
Set a goal to complete the approved work in /absolute/path/to/SESSION.md. Read the linked task, repo rules, selected preferences, and orchestration skill. Use native subagents with named ownership and one integration owner. Verify each ready block, save progress, and continue without asking for approval already granted. Preserve the original deadline and repair budget on resume. Leave the uncommitted changes, check evidence, independent review, and remaining work for owner review. Use only the actions and billing mode already authorized in the session.
```

When another agent is using the source checkout, copy its complete working tree into a separate workspace before starting. Include required modified and untracked inputs, then verify the copy against the source snapshot. Keep a frozen starting copy for comparison. A new checkout from the last commit does not preserve uncommitted work.

Keep worker outputs in their assigned workspaces. A fresh lead must reconcile the saved record with actual files, check evidence, and worker status before dispatching replacements. Do not reset an exhausted repair budget or treat a stale success claim as verification. Preserve owner notes in a separate file.

Availability and continuation depend on the host session. A goal is not a hard process watchdog, and native subagents do not inherit the CLI controller's sandbox or accounting. A successful saved-state handoff does not prove recovery from an account limit, app crash, or sleeping computer. Keep those limits visible in the handoff.

## Account limits

For subscription-only work, use the intended subscription account and turn off usage credits/extra usage in that account. An API key can select API billing instead. A prompt cannot enforce account billing settings. [Subscription authentication](https://support.claude.com/en/articles/11145838-using-claude-code-with-your-pro-or-max-plan), [Usage credits](https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans).

Multiple sessions and subagents share account limits. This harness has no verified meter for remaining subscription percentage. Record a visible starting allowance if useful, but do not equate tokens or API dollars with a fraction of a subscription. Use the approved backlog and deadline to bound useful work. [Subagent usage](https://code.claude.com/docs/en/sub-agents).

## Before leaving

- The correct account is active, paid overage is off, and the local computer will remain awake with Desktop open.
- The goal is visibly active, required tools work, and normal build/test commands do not wait for approval.
- The baseline is measured; the first small block demonstrates the build, check, review, and continuation cycle.
- The lead has saved the absolute deadline, scope, permissions, active workers, and next action.
- Required local services work. Agents are not tasked with repairing the machine overnight.
- Required UI interactions can actually be exercised with the available tools and permissions. Test one representative interaction during preparation. A working build, simulator launch, or screenshot is not a substitute. Record unavailable checks and continue independent work under the approved scope.

These checks make the run suitable for unattended work; they do not guarantee uninterrupted execution. Local execution depends on the host and machine. Desktop scheduled tasks are a separate option for recurring work, not required for this single run. [Desktop scheduling requirements](https://code.claude.com/docs/en/desktop-scheduled-tasks).

## Keep the handoff current

Use the template's Current handoff section as one dated snapshot. Replace stale field values when the lead checkpoints, and update the Work table with it. Put useful older events in Evidence and decisions. Keep owner notes in their separate file. An old "nothing verified" entry must not sit beside a later verified revision as if both describe the present.

Identify what each check tested, including tracked changes and new files when the tree is uncommitted. Record changes made after the check as still needing verification. On resume, compare the snapshot with files, logs, and worker status before dispatching work. If they disagree, record the uncertainty and reconcile it first.

Give each worker its own scratch directory and record its path with the assignment. Check a script's resolved path and write targets before running it; a shared filename does not establish ownership. Run mutation tests that rewrite source in a disposable copy of the intended tree, with isolated build output. Never restore saved source over a checkout another worker may be editing. If workers collide, reconcile affected files with their owners and rerun checks whose evidence could have been contaminated. Preserve the incident in the handoff.

The lead schedules checks that share build output, local service limits, or heavy machine resources. During the integrated gate, pause competing checks and writes to the tested tree. Record the failure and rerun with those conflicts removed before attributing a timeout to load. A focused pass does not replace the failed gate, and suspected contention is not a reason to weaken assertions or raise timeouts without evidence.

## How this differs from the CLI controller

`harness.mjs` still uses bounded, sequential builder/reviewer calls in private checkouts. It disables subagents and hooks. It does not run this native goal flow or measure subscription percentage. Keep it for controlled pilots where its accounting and isolation are useful.

The native session uses the same task, implementation, test, and review skills, with orchestrate directing the work. Host permissions and the lead enforce the work rules. The controller's sandbox, scope checks, and dollar/deadline accounting do not apply. No extra JavaScript controller, global hook, or installer is required for this flow.
