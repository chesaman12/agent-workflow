# Design and limits

Agent Workflow combines agent instructions with a small stateful helper. The host supplies agents and continuation. The helper records scope, runs project checks, tracks findings and bounds repair attempts. The [workflow guide](GUIDE.md) shows the steps and review artifacts.

Shared instructions describe the process. Project configuration supplies paths, commands, architecture rules and service permissions. Optional preferences hold personal standards. Run-specific plans, deadlines and feedback stay outside the shared repository or in ignored `.local/` files.

## Why the helper exists

| Mechanism | Purpose | Implementation |
|---|---|---|
| Frozen runtime | Keep shared workflow upgrades out of active runs | Copy the runtime, skills, docs and templates into the run. See [workspace.ts](../lib/workspace.ts). |
| Persisted state and source identity | Preserve progress across sessions and reject stale evidence | Record checks and reviews against the tested source. See [native.ts](../lib/native.ts). |
| Required findings and bounded repair | Prevent silent finding loss and endless review loops | Require explicit closure; preserve counters and deadlines on resume. See [quality.ts](../lib/quality.ts). |
| Final integrated gate | Verify the combined result after later blocks change earlier work | Reserve final review time; permit repairs within existing limits. See [native.ts](../lib/native.ts). |
| Separate report and notes | Regenerate evidence without erasing human feedback | Serve linked evidence and save notes with version checks. See [review-server.ts](../lib/review-server.ts). |

The [tests](../test/native.test.ts) and [CI workflow](../.github/workflows/check.yml) verify workflow behavior. They do not measure model-generated code quality or prove that a host can run unattended. Native mode and the optional CLI have separate execution contracts; see [NATIVE.md](NATIVE.md) and [OVERNIGHT.md](OVERNIGHT.md).

## What remains a limit

- **Host qualification:** Desktop goal continuation, permission prompts, actual subagent availability, quota recovery and local service/device access need a first-run check in the intended session. The helper cannot keep the computer awake or stop host workers at the deadline.
- **Review quality:** fresh identities and finding closure are enforced as records. Fresh contexts and honest, useful judgment depend on real delegation. There is no calibrated reviewer corpus yet.
- **Behavioral evidence:** project checks can be meaningful or weak. The helper records what ran; it cannot infer a missing user journey. Protect existing gate configuration and have the reviewer inspect test quality.
- **Cross-run ownership:** the helper serializes one run. Two separate run folders can still target the same checkout. The lead must use distinct writable checkouts and isolate ports and mutable data.
- **Native scope:** source hashes cover Git-visible files, not ignored build output, running services or remote state. Rebuild what a check consumes and save interaction or persisted-state evidence where relevant.
- **CLI scope:** CLI execution is an optional, separately qualified path. It does not provide the native final integrated review action or Desktop subscription guarantees. Do not use it as the default overnight launcher.
- **Learning loop:** capture and export work. Clustering, benchmark execution and promotion remain deliberate agent/human steps. The quality command summarizes supplied labels; it is not an LLM judge.

## Upstream influences

This comparison uses Matt Pocock revision `4ae2317` and pstack revision `ae5650f`. It describes those versions, not necessarily their latest behavior. The Matt revision matches this repo's [provenance file](../skills/UPSTREAM.json). Pstack is a design reference, not a dependency.

| Source idea | Current implementation and decision |
|---|---|
| Matt: conversation to spec | Keep actual-source exploration and synthesis. Our [to-spec](../skills/to-spec/SKILL.md) uses a short local brief with file links. Upstream publishes a long issue-tracker spec and generally avoids file paths. Local briefs keep repository review concise. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-spec/SKILL.md). |
| Matt: separate Standards and Spec | Keep both verdicts. Our [review skill](../skills/code-review/SKILL.md) uses one fresh reviewer and structured blockers. Upstream uses two parallel lenses and treats code smells as advisory. Material maintainability findings can block here, with concrete consequences and a simpler alternative. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review/SKILL.md). |
| Matt: implementation plus tests and review | Keep the short build/test/review sequence. Local code adds persisted gates and bounded repair. Upstream also commits automatically; this workflow requires actual commit authority. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/SKILL.md). |
| Pstack: architecture before code | Our brief requires callers, owners, interfaces and likely change points. Adopt usage-first sketches. This upstream revision requires competing designs through arena; keep alternatives optional for small tasks here. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/architect/SKILL.md). |
| Pstack: adversarial proof | Reproduce behavioral defects and test the fix. At this revision, `interrogate` discards findings without a runnable failure, including style and structure. Keep qualitative maintainability review alongside behavioral proof. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/interrogate/SKILL.md). |
| Pstack: `/correct` | Prefer eliminating repeated mistakes through ownership, types and checks. Prove a check fails on rejected code and permits accepted code. Our feedback records preserve examples, but promotion requires owner approval. Avoid adding a lint rule for every one-off correction. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/correct/SKILL.md). |
| Pstack: `/reflect` | Keep the distinction between candidate lessons and approved policy. Our capture is opt-in and scoped. Upstream uses several reviewers, transcript analysis and skill-edit approval. There is no need to add that whole process before collecting examples. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/reflect/SKILL.md). |
| Pstack: show work and drive the real app | Existing evidence records and the review page provide the decision trail. The valuable next project work is a repeatable real user journey with isolated setup, observable results and cleanup. Put it in that project's checks, not a generic application-specific harness. [Evidence trail](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/show-me-your-work/SKILL.md), [verification skill](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/create-verification-skill/SKILL.md). |

Deterministic replay, allocation limits, size budgets and formal state-machine checks belong in projects that need them. They are not generic proof of maintainability. Keep comment restrictions in optional preferences; clear names and tests matter more than a universal comment ban. PR count and subscription consumption are not quality metrics.

## Evaluation priorities

1. **Use concrete design checkpoints.** Measure first-pass acceptance and manual restructuring time. This targets code generation before a reviewer has to clean it up.
2. **Calibrate review on actual rejected and accepted code.** Start with 5-10 examples plus acceptable controls. Measure important issues caught, missed issues and false blockers. Keep labels private from reviewers.
3. **Verify representative user journeys.** Measure successful execution on current source, missing checks and time to reproduce failures. Keep these checks in the project they test.
4. **Promote only recurring, demonstrated lessons.** Prefer architecture/types, then targeted checks. Measure recurrence and false-positive cost. Preserve project and personal scope.
5. **Qualify longer runs in stages.** Complete one block, then a few blocks, then an overnight queue. Measure accepted outcomes and owner review time, not agent-hours. Keep the absolute deadline and shared repair budget.

See [GUIDE.md](GUIDE.md) for the five-step workflow and the review artifacts. See [evals/README.md](../evals/README.md) for the evaluation procedure and its current gaps.
