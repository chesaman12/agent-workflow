# Agent harness

A reusable workflow for planning, building and reviewing coding work in Claude Code Desktop. Give direction in a short task brief. Review a visual page afterward. The same harness works with different repositories and developers through explicit project settings and optional personal preferences.

## What you use

1. **Before coding:** review TASK.md, its small design sketch and the approved scope.
2. **During the run:** one lead selects ready blocks and assigns bounded builders and independent reviewers. The helper runs the project's real checks and records evidence, findings and repair budgets.
3. **Afterward:** open REVIEW.html through the local viewer. Read the outcome, important code links, design, findings and remaining work. Your notes survive regeneration and have versioned backups.

Read [the native workflow](docs/NATIVE.md) for the commands the lead uses. You do not need to learn them to review a run. Start with one real block, then grow the queue when quality and owner review time justify it.

## Three connected loops

- Build, check and correct the implementation.
- Independent quality review, bounded repairs and independent closure. Defaults: two total repair passes per block, 45 minutes shared, clipped by the absolute deadline.
- Capture accepted human corrections, group recurring lessons, evaluate a proposed constraint and promote it only with owner approval.

Required maintainability findings can block completion even when tests pass. Optional advice can coexist with a pass. Missing required evidence, stale checks or a disappeared required finding cannot pass. Final integrated checks and review apply to the actual combined source.

The native helper makes no model calls. Claude Desktop supplies agents, context and continuation. The helper does not guarantee that a host session stays alive for eight hours. Preserve its absolute deadlines and qualify continuation in the actual host before an unattended run. Use the frozen helper returned by initialization so changes to the shared harness cannot alter an active run.

## What each part is for

| Part | Purpose |
|---|---|
| `skills/` | Seven existing planning, design, implementation, testing, review and orchestration skills. Six are adapted from Matt Pocock, with provenance in UPSTREAM.json. |
| `harness.mjs` | One command entry point for native run state, checks, review, notes, feedback and evals. |
| `lib/` | Internal state, evidence, process, review and presentation code. No separate commands to learn. |
| `templates/` | Task brief and run/project configuration. No built-in project profile or default repo. |
| `evals/` | Executable behavior exercises and summaries of human-labeled quality results. |
| `examples/preferences/` | Optional example preferences and checks. Copy and adapt them; they are not default policy. |
| `test/` | Tests of the harness, not proof that a model writes good code. |

Project-specific paths, commands, architecture and service permissions belong in the project's configuration and run pack. Do not put them in general skills or controller code. A different developer can omit personal preferences entirely.

Start a feature, port or refactor with [the generic launch prompt](templates/LAUNCH.md). Supply the target repository and outcome, then use that repository's checks and architecture rules. The harness does not assume an application framework, company or local checkout path.

Keep private run packs, owner feedback and personal preferences outside the shared repository or in its ignored `.local/` folder. Generated `runs/` are ignored too. Shared fixtures use sample data. The adapted skills retain their [upstream attribution](skills/UPSTREAM.json) and [license](skills/LICENSE).

## Native use

Requirements: Git and Node 22 or newer. There are no package dependencies or global install steps. Use the Node executable available in the environment.

The lead prepares TASK.md and NATIVE.json from templates, supplies an explicit project JSON, previews inputs and records existing owner approval. Then it uses `native` actions to claim, check, review and repair blocks, and to perform the final gate. See [NATIVE.md](docs/NATIVE.md).

```sh
node harness.mjs native --action init --task /path/to/task --project /path/to/project.json --run /path/to/run
node harness.mjs native --action init --task /path/to/task --project /path/to/project.json --run /path/to/run --approve HASH
node /path/to/run/runtime/harness.mjs review --run /path/to/run
node /path/to/run/runtime/harness.mjs serve --run /path/to/run
```

The local viewer listens only on 127.0.0.1. It serves an explicit evidence allowlist and saves NOTES.md separately from the report. Static HTML and Markdown copies remain usable when a host cannot open localhost. Check actual links and note persistence in the chosen review surface. The viewer does not publish a site.

## Optional CLI execution

The existing CLI controller remains available for isolated controlled tasks. It takes RUN.json, snapshots approved source and selected rules, uses private clones, runs checks, invokes a separate reviewer and performs bounded repairs. Unlike native mode, `run --execute` invokes the Claude CLI and consumes its configured account allowance. It is not the default subscription-only Desktop launcher.

```sh
node harness.mjs prepare --task /path/to/task --project /path/to/project.json --run /path/to/run
node harness.mjs prepare --task /path/to/task --project /path/to/project.json --run /path/to/run --approve HASH
node /path/to/run/runtime/harness.mjs run --run /path/to/run
node /path/to/run/runtime/harness.mjs run --run /path/to/run --execute
```

Preparation and run preview make no model call. `delivery: "diff"` supports one uncommitted block. Multi-block CLI execution needs explicitly authorized local checkpoint commits and `--execute --all`. Native runs can keep a sequential multi-block queue uncommitted. Neither path pushes or merges automatically.

The CLI caps reported cost and time together across build, review and repair. Unknown cost stops continuation. Its model settings disable hooks, external agents and installed skills; selected skill text is supplied directly. Project setup and checks are trusted commands outside the model sandbox. This is not a secure environment for hostile code or a billing guarantee.

## Verification and learning

```sh
node --test test/*.test.mjs
node harness.mjs eval --action list
node harness.mjs eval --action prepare --case reuse --folder /path/to/new-eval
node harness.mjs eval --action grade --case reuse --folder /path/to/new-eval
node harness.mjs eval --action quality --input /path/to/human-labels.json
```

Behavior exercises run hidden assertions and submitted tests with time limits. Run candidate code in a disposable environment. Quality summaries require human labels and measured review/repair time; an empty corpus does not become a score. Keep reviewer calibration, generation quality and runtime reliability separate.

Feedback capture stores selected before/after code and the owner's words without changing permanent policy. Accepted examples can be exported as development cases with private labels. Do not call examples already supplied in prompts held-out tests. See the native workflow for the feedback commands and [quality evaluation format](QUALITY_EVAL.md).
