# What these evals measure

The harness is project-neutral. These exercises use synthetic collections, file retention and background jobs. Project-specific examples and owner feedback belong in an external run pack or ignored `.local/` folder.

| Layer | What exists | What it proves |
|---|---|---|
| Harness tests | `npm test` checks state, scope, repair limits, evidence, notes and process handling. | The controller follows its rules under test. It does not prove model code quality. |
| Behavior exercises | [cases.ts](cases.ts) defines six small tasks. [run.ts](run.ts) prepares isolated repos and grades assertions plus submitted tests. | A submitted implementation meets those small task constraints. |
| Reviewer calibration | [quality.ts](quality.ts) summarizes human-adjudicated issue matches and false blockers. | How supplied reviewer results compare with supplied owner labels. No reviewer is launched by this command. |
| Generation trials | The same summary keeps first-pass and after-review results separate, including correctness, owner acceptance and review/repair time. | Descriptive results for supplied trials. It does not run an A/B experiment. |

The actual build/review/repair loop lives in [the native workflow](../docs/NATIVE.md), [the review skill](../skills/code-review/SKILL.md) and [the acceptance checks](../lib/quality.ts). That loop is implemented. A calibrated reviewer benchmark, held-out quality corpus and automatic comparison runner are not implemented. Renaming examples does not fill those gaps.

## Run a behavior exercise

From the repository root:

```sh
node harness.ts eval --action list
node harness.ts eval --action prepare --case reuse --folder /path/to/new-eval
```

Give the generated TASK.md and repo to a coding session. After it finishes:

```sh
node harness.ts eval --action grade --case reuse --folder /path/to/new-eval
```

Preparation and grading make no model calls. Grading executes the submitted code in that fixture repo with time limits, so use a disposable environment. Mechanical assertions do not establish readability or sound architecture; the result also names the human review still required.

The cases cover reuse, reading actual model fields, respecting approval boundaries, unavailable dependencies, preserving checks and an ordinary small change. Optional [readability exercises](../examples/preferences/readable-code/eval-cases.ts) can be selected with `--cases`; they are examples of an owner's preferences, not universal policy.

## Calibrate review and generation quality

1. Capture actual rejected code and accepted corrections with the [feedback commands](../docs/NATIVE.md). Include comparable acceptable examples.
2. Export the accepted examples. Give a fresh reviewer only the public source, without the private labels. Record its findings.
3. Have the owner map findings to important issue IDs and mark false blockers. Record acceptance and time for real generation trials.
4. Save those observations in the format below and run:

```sh
node harness.ts eval --action quality --input /path/to/results.json
```

This command calculates summaries. It cannot manufacture missing judgments, prove the reviewer was independent or claim improvement from an empty dataset.

<details>
<summary>Input format with illustrative data</summary>

```json
{
  "reviewerCases": [
    {"id":"rejected-example","acceptable":false,"importantIssues":["state-owner"],"matchedIssues":["state-owner"],"falseBlockers":0},
    {"id":"good-control","acceptable":true,"importantIssues":[],"matchedIssues":[],"falseBlockers":0}
  ],
  "trials": [
    {"id":"trial-1-before","task":"representative-feature","variant":"design-checkpoint","stage":"first-pass","correctnessPassed":true,"ownerAccepted":false,"reviewMinutes":12,"repairMinutes":15},
    {"id":"trial-1-after","task":"representative-feature","variant":"design-checkpoint","stage":"after-review","correctnessPassed":true,"ownerAccepted":true,"reviewMinutes":5,"repairMinutes":0}
  ]
}
```

</details>

These are schema examples, not measured results. Use actual owner labels and elapsed minutes. A human maps reviewer findings to important issue IDs and judges false blockers; string matching cannot do that reliably. Keep task, model/version, environment, budgets, replicate and source snapshots in the trial record even when they are not aggregate metrics.

Start with 5-10 rejected examples with accepted corrections and comparable good controls. The existing feedback exporter makes development material, not untouched validation. Split by task/failure family and hide private labels from reviewer tools. Then compare the current workflow, added design guidance, and added calibrated review/repair on matched tasks with comparable environments and budgets. Keep first-pass and final results separate. No automatic rule promotion or arbitrary composite quality score.

Choose acceptance thresholds with the owner after collecting a representative baseline. Report raw counts, false blockers, missed important issues and all failures. Small samples identify direction; they do not prove a general improvement.
