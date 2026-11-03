---
name: orchestrate
description: "Run an approved multi-block engineering plan through a lead, bounded subagents, checks, and saved progress. Use for long feature, port, or refactor sessions."
---

You are the lead and sole integration owner. Use the host's native agents and continuation feature. This skill supplies work rules; it does not launch a process, extend account limits, or grant permissions.

For a native Claude Desktop run, first read ../../docs/NATIVE.md and use the local helper for claims, checks, review, repairs and the visual review page. The helper makes no model calls. Use the exact selected harness path so a different installed skill with this name cannot change the contract.

Read the repository instructions, approved task, and selected personal preferences. Preserve existing changes. If the task is still a draft, prepare the concrete scope and prerequisites for review before building. A past plan's approval instructions do not count as approval.

## Establish the run

- Record the exact checkout, source revision, existing changes, authoritative design inputs, approved blocks, dependencies, and acceptance checks.
- Save a starting snapshot of required modified and untracked inputs. Before a worker starts in another checkout, verify that its assigned inputs match this snapshot. A worktree made from HEAD alone omits uncommitted inputs.
- Record allowed installs, local service writes, git actions, and external actions from actual user authorization. Resolve required permissions before an unattended run. Do not ask again for authority already given.
- Keep machine state in the helper run folder outside source code. SESSION.md may link it and summarize the handoff; it must not become a competing status authority. Record one absolute start time and deadline, including timezone. Resuming must not extend them.
- Record the host session, continuation mechanism, and permitted worker count. Confirm that agent tools actually exist. A skill file alone does not enable them.
- Run the authorized baseline checks. Investigate failures before claiming a clean baseline. Keep unavailable checks visible.

Use ../to-spec/SKILL.md and ../to-tickets/SKILL.md only when the plan needs preparation. Reuse an approved plan rather than rebuilding it into another set of documents.

## Assign work

Use up to three subagents at once unless the user selects another limit. This is a ceiling, not a staffing target.

| Role | Assignment | Access |
|---|---|---|
| Investigator | Answer a bounded code, contract, or test question | Read only |
| Builder | Implement one ready block using ../implement/SKILL.md and ../tdd/SKILL.md | Named files only |
| Reviewer | Review the actual diff with ../code-review/SKILL.md | Read only |

Each assignment includes the outcome, absolute checkout path, starting revision or diff, owned files, shared-file exclusions, authoritative inputs, acceptance checks, deadline, and handoff location. Record its worker identifier and command timeouts before moving on. Pass the relevant repo rules and personal preferences explicitly; do not assume a worker inherits them. Workers report changes, tests with results, unresolved issues, and evidence paths in at most 200 words. They do not spawn more agents or change run scope.

The lead owns package manifests, lockfiles, shared exports, route registries, schema changes, and integration unless it explicitly transfers ownership for one task. One writer at a time in shared files. This native helper admits one writing block per checkout. Use other agents for bounded read-only investigation and review. Separate independent runs can use separate worktrees with explicit integration ownership; they must not share a queue, ports or mutable scratch files.

Start with one lead session. Use additional top-level sessions only for independently testable work with clear ownership and a native way to observe completion. Give each session its own workspace, the same deadline, and a bounded brief. They must not claim work from the lead's queue independently. If the host cannot manage them, keep native subagents. Never create multiple leads for the same plan.

## Build and verify

1. Select a block whose dependencies passed. Use short investigation tasks where they remove uncertainty. Start independent work when it is ready, not merely to keep workers busy.
2. Build the selected block. The implementation skill applies to that block; the lead selects the next one after acceptance.
3. Run focused checks and the project-required gate on a quiet integrated tree. Serialize tests that share services or mutable fixtures.
4. Start a fresh reviewer with the task, standards, diff, and check evidence. Do not give it the builder's conclusion as proof. The reviewer checks both behavior and readability.
5. Resolve findings, then rerun affected checks and review changed code. Use the shared limit of two total repair passes per block, with a combined limit of 45 minutes or the remaining implementation window, whichever is smaller. New finding IDs do not create new budgets. Record each attempt and result. A partial fix or resume does not reset the count or time budget. If still blocked, record the exact failure and block its dependents. Continue only work that is independent of that failure.
6. Record review-ready through the helper only when the block meets its checks and independent review. After the queue, run final-check and final-review on the combined source. Earlier block evidence is historical after later edits. If a required check could not run, use needs-verification. Human acceptance is still separate.
7. Save progress and move directly to the next ready block. Do not ask permission at each block when the plan and actions are already approved.

Review shared contracts and repeated patterns across blocks after roughly three accepted blocks. Fix integration problems before stacking dependent work on them.

Use local checkpoint commits only when explicitly authorized. Otherwise preserve uncommitted work, per-block diffs, and new files in run artifacts. Never use a patch alone as a backup of untracked files. Do not reset or clean a shared tree to recover a failed block. Isolate incomplete work before continuing, or stop if a clean basis cannot be established without touching user changes.

## Continue and recover

Save state after every accepted block, before a handoff, and before compaction. Include active workers, incomplete files, check commands/results, decisions, and the next action. Do not rewrite user notes. On resume, read this state, inspect the actual diff and worker status, and reconcile them before editing. A saved claim of success is not a replacement for evidence.

Use the host's native goal mechanism when available. See ../../docs/OVERNIGHT.md for the Claude Desktop route. Do not combine a goal, a repeated continuation hook, and a timer that all launch competing work. If unattended continuation is unavailable, state that limitation before the user leaves.

Check the clock before starting a block or worker. Reserve the final 45 minutes of a long run for integration, verification, and review. Do not start a block that is unlikely to reach a verified checkpoint before that cutoff. At the cutoff, collect completed results and stop unfinished owned workers, preserving their changes and marking them incomplete. Give commands and workers time limits within the remaining window. A prompt deadline is not a process watchdog.

At a subscription limit, let the host wait for its reset if that feature is available and enabled. Do not switch credentials, use paid overage, or retry continuously. Existing workers may have stopped or continued while the lead waited. On recovery, check their state and saved outputs before dispatching replacements, and check the original deadline before any new work. Do not invent a subscription percentage from tokens or API-equivalent dollar estimates.

Stop when approved work is complete, the deadline arrives, the user stops the run, account access cannot continue, or no ready work remains after bounded repair. This includes unavailable input or permission and unresolved technical failures that block all remaining work. Do not add work just to consume usage. Stop owned workers and save a handoff. Never disturb unrelated sessions or processes.

## Morning review

Generate REVIEW.html through the same helper. Start its local review viewer for durable notes and evidence links; keep the saved static page as a fallback. Never replace NOTES.md or a prior feedback capture. Confirm persistence and link behavior before relying on a new host surface.

Lead with what works now. Link the runnable demonstration, main changes, check results, review findings, and incomplete work. Distinguish verified, needs-verification, blocked, and not started. End with the next useful scope and any decision it requires. Keep this in the saved run record so the owner can review it without reading the transcript.
