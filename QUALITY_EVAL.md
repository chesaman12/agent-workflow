# Quality evaluation inputs

`node harness.mjs eval --action quality --input /path/to/results.json` summarizes human labels. It makes no model call and does not infer acceptance.

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

These are schema examples, not measured results. Use actual owner labels and elapsed minutes. A human maps reviewer findings to important issue IDs and judges false blockers; string matching cannot do that reliably. Keep task, model/version, environment, budgets, replicate and source snapshots in the trial record even when they are not aggregate metrics.

Start with 5-10 rejected examples with accepted corrections and comparable good controls. The existing feedback exporter makes development material, not untouched validation. Split by task/failure family and hide private labels from reviewer tools. Then compare the current workflow, added design guidance, and added calibrated review/repair on matched tasks with comparable environments and budgets. Keep first-pass and final results separate. No automatic rule promotion or arbitrary composite quality score.

Provisional targets for discussion: detect at least 80% of owner-important issues, at most one false blocker per ten acceptable controls, and reduce median owner review plus repair time by 30% without correctness regression. Report raw counts and all failures. Small samples identify direction; they do not prove a general improvement.
