# Readiness assessment

Reviewed 2026-11-02. Starting revision: `e576678`. Scope: all tracked runtime modules, seven skills and their references, templates, evals, preferences, tests and run documentation.

**Verdict: suitable for a supervised native pilot, followed by a bounded queue once that pilot passes.** The helper has useful enforcement and review artifacts. This audit does not qualify uninterrupted overnight execution, a live Claude account or model-generated code quality.

## Findings addressed

| Finding | Effect before the fix | Correction and evidence |
|---|---|---|
| Failed native gates exited successfully | Shell callers could treat a rejected review or failed check as success | Exit 1 for failed gates; structured evidence is preserved. CLI-level regression in [native tests](../test/native.test.ts). |
| Frozen runs lost supporting files | `to-spec` referenced a missing task template; `orchestrate` referenced a missing overnight guide | Freeze docs and templates with the runtime. Their contents participate in the runtime identity. Frozen-reference regression. |
| Final-window repairs were refused | A final reviewer could find a defect after the implementation cutoff, but the helper refused its repair | Reopen reviewed blocks during reserved final time, under the existing counter and deadline. New blocks remain prohibited. |
| Reopening an earlier block included later work | An unrelated later block appeared as an out-of-scope edit during repair | Capture the repair's starting source and retain the earlier changed-file list. Two-block regression covers this path. |
| Final rechecks overwrote review history | A later verdict replaced the previous final review in `attempt-0` | Archive each check cycle separately from repair-budget counting. Regression verifies the original verdict survives. |
| CLI checkpoint reports appeared stale | An authorized commit changed HEAD without changing checked source, making the report reject its own checkpoint | Recognize the recorded checkpoint only while its content and HEAD match. A later source edit still invalidates evidence. |
| Skills and docs disagreed about native use | Planning pointed Desktop at RUN.json; overnight text said the helper and scope checks did not apply | Use NATIVE.json for Desktop. Correct the mode distinctions and remove a repeated planning-approval loop. |

Five targeted regressions failed against the starting code and passed after the corrections. The original baseline was 56 passing tests; all 61 tests and strict TypeScript checking now pass locally on Node 26.5.1. A two-block scripted exercise also completed checks, a rejected review, repair, explicit closure and the final gate. No real model call was used.

In the Codex browser, the served example saved a note, opened an exact source-line link, returned to the review and reloaded. The note, expanded section and reading position were retained. This verifies that browser surface, not Claude Desktop's preview or eight-hour host continuation.

The [CI workflow](../.github/workflows/check.yml) repeats `npm ci --ignore-scripts` and `npm run check` on Node 24.12.0 and Node 26. It uses pinned actions with read-only repository permissions. The bundled skill validator could not run because PyYAML is absent; changed frontmatter and local references were checked directly instead. No package was installed to run that optional validator.

## What remains a limit

- **Host qualification:** Desktop goal continuation, permission prompts, actual subagent availability, quota recovery and local service/device access need a first-run check in the intended session. The helper cannot keep the computer awake or stop host workers at the deadline.
- **Review quality:** fresh identities and finding closure are enforced as records. Fresh contexts and honest, useful judgment depend on real delegation. There is no calibrated reviewer corpus yet.
- **Behavioral evidence:** project checks can be meaningful or weak. The helper records what ran; it cannot infer a missing user journey. Protect existing gate configuration and have the reviewer inspect test quality.
- **Cross-run ownership:** the helper serializes one run. Two separate run folders can still target the same checkout. The lead must use distinct writable checkouts and isolate ports and mutable data.
- **Native scope:** source hashes cover Git-visible files, not ignored build output, running services or remote state. Rebuild what a check consumes and save interaction or persisted-state evidence where relevant.
- **CLI scope:** CLI execution is an optional, separately qualified path. It does not provide the native final integrated review action or Desktop subscription guarantees. Do not use it as the default overnight launcher.
- **Learning loop:** capture and export work. Clustering, benchmark execution and promotion remain deliberate agent/human steps. The quality command summarizes supplied labels; it is not an LLM judge.

## Comparison with the supplied examples

Sources were inspected at Matt Pocock revision `4ae2317` and pstack revision `ae5650f`. The Matt revision matches this repo's [provenance file](../skills/UPSTREAM.json). No upstream package was installed.

| Source idea | Current implementation and decision |
|---|---|
| Matt: conversation to spec | Keep actual-source exploration and synthesis. Our [to-spec](../skills/to-spec/SKILL.md) uses a short local brief with file links. Upstream publishes a long issue-tracker spec and generally avoids file paths. The local choice fits short evening reviews. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/to-spec/SKILL.md). |
| Matt: separate Standards and Spec | Keep both verdicts. Our [review skill](../skills/code-review/SKILL.md) uses one fresh reviewer and structured blockers. Upstream uses two parallel lenses and treats code smells as advisory. Material maintainability findings can block here, with concrete consequences and a simpler alternative. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/code-review/SKILL.md). |
| Matt: implementation plus tests and review | Keep the short build/test/review sequence. Local code adds persisted gates and bounded repair. Upstream also commits automatically; this workflow requires actual commit authority. [Source](https://github.com/mattpocock/skills/blob/4ae2317ddb22b046e26455e4f9c9b3aaaf62212d/skills/engineering/implement/SKILL.md). |
| Pstack: architecture before code | Our brief requires callers, owners, interfaces and likely change points. Adopt usage-first sketches. Do not require two competing model designs for every task; current upstream architect always uses arena for alternatives. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/architect/SKILL.md). |
| Pstack: adversarial proof | Reproduce behavioral defects and test the fix. Do not replace qualitative review with current `interrogate`, which discards findings without a runnable failure, including style and structure. It solves a different problem from your main complaint. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/interrogate/SKILL.md). |
| Pstack: `/correct` | Prefer eliminating repeated mistakes through ownership, types and checks. Prove a check fails on rejected code and permits accepted code. Our feedback records preserve examples, but promotion requires owner approval. Avoid adding a lint rule for every one-off correction. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/correct/SKILL.md). |
| Pstack: `/reflect` | Keep the distinction between candidate lessons and approved policy. Our capture is opt-in and scoped. Upstream uses several reviewers, transcript analysis and skill-edit approval. There is no need to add that whole process before collecting examples. [Source](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/reflect/SKILL.md). |
| Pstack: show work and drive the real app | Existing evidence records and the review page provide the decision trail. The valuable next project work is a repeatable real user journey with isolated setup, observable results and cleanup. Put it in that project's checks, not a generic application-specific harness. [Evidence trail](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/show-me-your-work/SKILL.md), [verification skill](https://github.com/cursor/plugins/blob/ae5650febf4320793844c12c4adaa937f417f8da/pstack/skills/create-verification-skill/SKILL.md). |

The game example's deterministic replay, allocation limits, size budgets and formal state-machine checks are useful when the product has those requirements. They are not generic proof of maintainability. Keep comment restrictions in optional preferences; clear names and tests matter more than a universal comment ban. PR count and subscription consumption are not quality metrics.

## Highest-impact next work

1. **Use a concrete design checkpoint on the first real block.** Measure first-pass acceptance and manual restructuring time. This targets code generation before a reviewer has to clean it up.
2. **Calibrate review on actual rejected and accepted code.** Start with 5-10 examples plus acceptable controls. Measure important issues caught, missed issues and false blockers. Keep labels private from reviewers.
3. **Add one repeatable user journey to each pilot project.** Measure successful execution on current source, missing checks and time to reproduce failures. This strengthens behavioral verification without adding a generic framework.
4. **Promote only recurring, demonstrated lessons.** Prefer architecture/types, then targeted checks. Measure recurrence and false-positive cost. Preserve project and personal scope.
5. **Qualify longer runs in stages.** Complete one block, then a few blocks, then an overnight queue. Measure accepted outcomes and owner review time, not agent-hours. Keep the absolute deadline and shared repair budget.

See [GUIDE.md](GUIDE.md) for the five-step workflow and the review artifacts. See [evals/README.md](../evals/README.md) for the evaluation procedure and its current gaps.
