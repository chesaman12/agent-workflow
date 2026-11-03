# Claude Desktop workflow

Use Claude Desktop's Code workspace as the execution host. This helper records state, runs explicitly configured checks, validates reviews and produces the review page. It never launches a model, installs anything or changes global configuration. Use the project's actual Node executable in the commands below.

## Before coding

Read the current repository rules, actual source and owner decisions. Use `to-spec` to prepare TASK.md and `to-tickets` only for larger scope. Keep the task readable in a few minutes. Include a short design decision per substantial block, code/pattern links and useful diagrams. Reuse approved decisions; ask only about choices that still affect scope or authority.

Create a task folder outside source with TASK.md and NATIVE.json from the templates. Supply an explicit project JSON with its checkout, instruction files, protected paths and required check commands. Any language or stack can supply shell checks. Personal preferences are optional via `--preferences`; they are not global project rules.

Set actual absolute `stopAt` and `finalReviewAt` timestamps when launching. Do not reuse yesterday's timestamps or extend them on resume. Reserve final review time appropriate to the run. Declare any service, scratch-folder and port ownership in TASK.md. Check commands must rebuild ignored output they consume when necessary; a source hash cannot prove cached runtime freshness.

Native dependency setup stays with the host under existing authorization; the helper does not automatically run the project setup list. Its checks cover Git-visible source, not every ignored file or host action. Host permissions still control agent access.

The helper works in the explicitly selected native checkout, including existing uncommitted source. Preserve owner changes and select an isolated checkout before initialization if needed. Never point two runs at one writable checkout. Do not choose, merge, reset or clean another person's checkout silently.

Preview, then bind the owner's existing approval to the exact inputs:

```sh
node /path/to/harness/harness.ts native --action init --task /path/to/task --project /path/to/project.json --run /path/to/run
node /path/to/harness/harness.ts native --action init --task /path/to/task --project /path/to/project.json --run /path/to/run --approve HASH
```

The hash is an input-integrity check, not a substitute for authorization. If the scope and actions are already approved, the lead can execute both commands without asking again. Include the same `--preferences` on both calls when selected.

Initialization returns a `helper` path under the run's runtime folder. Use that frozen helper for every later command, including resume and serving the review. Upgrading the shared harness then cannot change an active run. The frozen copy contains only the small runtime and selected skill sources; application dependencies are not copied.

## Each block

Use actual host worker IDs for `--actor`. Give the builder the task, design, selected rules, named files and the implement/TDD skills. Give a separate reviewer the frozen code, task, design, checks and prior required findings. Do not present the builder's confidence as evidence.

One block owns this checkout at a time. Other agents can investigate read-only. For parallel writing, prepare genuinely independent runs in separate checkouts with explicit integration ownership; this helper does not merge them.

```sh
node /path/to/harness/harness.ts native --action claim --run /path/to/run --block first --actor BUILDER_ID
```

The builder implements the block. The lead stops writes before checks and review:

```sh
node /path/to/harness/harness.ts native --action check --run /path/to/run --block first --actor LEAD_ID
```

A failing check is not a review pass. Required checks run locally through the helper, with bounded commands and private scratch space. No changes to source or required check configuration are allowed to make a gate pass. Inspect any scope error before continuing.

After passing checks, the reviewer saves this envelope outside source. `tree` comes from the check result. Findings need stable IDs and the fields shown in the review skill; optional advice uses `blocking: false`. Missing required evidence goes in `notVerified` and blocks acceptance. The helper retains each missing check as a required `verification-*` finding; a later empty list does not erase it. Its closure must cite the actual evidence. Human or external interaction claims still require a trustworthy reviewer, not merely a file or a success sentence.

```json
{
  "tree": "HASH_FROM_CHECK",
  "review": {
    "standards": {"passed": true, "findings": []},
    "spec": {"passed": true, "findings": []},
    "summary": "Concrete outcome and important review conclusion.",
    "notVerified": [],
    "closed": []
  }
}
```

```sh
node /path/to/harness/harness.ts native --action review --run /path/to/run --block first --actor REVIEWER_ID --input /path/to/review.json
```

The helper rejects builder identities as reviewers. This records provenance, not OS-enforced isolation or proof of a new context. The lead must actually dispatch a fresh read-only reviewer and preserve its output.

On a required finding or failed check:

```sh
node /path/to/harness/harness.ts native --action repair --run /path/to/run --block first --actor BUILDER_ID
```

Repair, check and review again. Preserve unresolved finding IDs; explicitly close resolved required findings with `{"id":"finding-id","reason":"Evidence for closure"}`. Two total repair passes and 45 minutes are defaults for the entire block, clipped to its remaining implementation window. New findings, replacement workers and resumes never reset the budget. If exhausted, preserve work and report incomplete. This shared checkout does not advance past unresolved partial changes.

A final review can require reopening an already reviewed block through `repair`, consuming that block's remaining budget. Recheck and independently review it, then repeat final verification. Do not waive a material finding to meet a deadline.

## Final source and review artifact

After all blocks pass, stop writers and run final checks and an independent integrated review. The final reviewer assesses all approved outcomes, cross-block patterns and outstanding final findings, not just the last diff. Use a reviewer identity that has not built a block.

```sh
node /path/to/harness/harness.ts native --action final-check --run /path/to/run --actor LEAD_ID
node /path/to/harness/harness.ts native --action final-review --run /path/to/run --actor FINAL_REVIEWER_ID --input /path/to/final-review.json
node /path/to/harness/harness.ts review --run /path/to/run
node /path/to/harness/harness.ts serve --run /path/to/run
```

The viewer binds only to 127.0.0.1 and prints its local URL. Leave its owned process available for review; record how to restart it. Stop only that process when no longer needed. It has no model/API calls or external assets. The served view supports durable notes and code links with line anchors. Static REVIEW.html and REVIEW.md remain available when an embedded host cannot open localhost. Test actual host access before depending on it.

Populate optional PRESENTATION.json to keep the page concise:

```json
{
  "summary": "What works now and the main limitation.",
  "decisions": ["Only actual owner decisions."],
  "blocks": {
    "first": {
      "outcome": "Observable result.",
      "readFirst": [{"file":"src/example.ts","line":12,"label":"Entry point","why":"Owns the important state transition."}],
      "demonstration": "Specific steps and expected result.",
      "screenshots": []
    }
  }
}
```

Use relative repo paths or absolute artifact paths inside the run. Include screenshot paths/captions only when evidence exists. A screenshot does not prove interaction. Design components and pattern links come from NATIVE.json. Detailed reviews, first-pass source snapshots and check logs are linked automatically. Do not produce a second long narrative.

The report never rewrites NOTES.md. The viewer saves notes with version checks and backup copies; a conflict preserves the draft instead of overwriting another edit. Reading position and expanded sections are saved separately. Refreshing, tab switching and report regeneration must not erase feedback. Keep feedback in normal conversation when the review host is unavailable.

## Continue, recover and stop

Read `native --action status --run /path/to/run` and inspect actual worker state before resuming. state.json is authoritative. SESSION.md can link it but must not maintain a second truth. Never edit the state file by hand.

After confirming an interrupted worker stopped and inspecting its changes, use `native --action recover --run /path/to/run --block first --actor LEAD_ID --reason "What stopped and what was preserved"`, then `repair` if budget remains. Recovery retains counters and deadlines. A dead helper process lock can be cleared by this command; a live lock cannot.

Use `native --action stop --run /path/to/run --actor LEAD_ID --reason "Why the run ended"` for an incomplete handoff. Source writes, host continuation and the model's quota remain host responsibilities. There is no hard watchdog for the host session. Required commands are bounded; unsupported continuation or unavailable checks must remain explicit. Do not launch competing goal, hook and timer loops. Do not switch billing modes or credentials.

## Learn from accepted corrections

When the owner asks to retain a correction, capture it before editing. Input JSON has `id`, `block`, `files` (relative paths), the owner's `criticism`, a candidate `principle`, `scope` (`project`, `personal` or `general`) and optional failure `family`. Run `feedback --action capture --run /path/to/run --input /path/to/correction.json`.

After the owner actually accepts the corrected code, run `feedback --action accept` with `id`, `accepted: true` and `ownerStatement`. Neither command changes permanent policy. Keep captures small and selected; do not mine unrelated transcripts. The saved before/after code survives later source edits.

`feedback --action export --run /path/to/run --folder /path/to/new-benchmark` creates anonymized development cases and separate private labels. Restrict a benchmark reviewer's tools to its public case. Examples already supplied as guidance are not held-out evidence. Use new task/failure families for validation.

`eval --action quality --input /path/to/human-labels.json` summarizes human-adjudicated reviewer cases and measured first-pass/after-review trials. Record important issue matches, false blockers, correctness, acceptance and owner review/repair minutes. It does not infer labels or create an LLM score. Improve policy only after owner-approved examples and a meaningful comparison.
