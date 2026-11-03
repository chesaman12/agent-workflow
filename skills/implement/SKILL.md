---
name: implement
description: "Implement an approved block using its design, behavioral checks and repository standards."
disable-model-invocation: true
---

Read TASK.md, the selected block, repository rules and explicitly selected personal preferences. Follow ../tdd/SKILL.md at the relevant behavioral boundaries.

Before coding a substantial change, identify its caller, ownership of state and policy, interfaces, effects and existing patterns. Use the task's design decision. If it is missing, provide a short sketch first. Reconsider a material departure before investing in the wrong shape. Routine decisions within the approved outcome do not need another permission request.

Build one coherent slice. Keep policy and important state in clear owners. Prefer direct control flow and useful interfaces over forwarding helpers, duplicated representations or callbacks that require reconstructing event order. A single coordinator can own a use case without doing every calculation itself. Do not split files just to satisfy a size metric.

Run focused checks during development. Preserve required gates and tests. Inspect the resulting diff against behavior and design. Keep the first implementation snapshot available for later comparison. An independent reviewer receives source, requirements and actual evidence; your completion report is not proof.

During repair, address the named findings and affected callers. Preserve finding IDs. If local fixes repeatedly complicate the same state model, reconsider its ownership within the remaining repair budget. Report missing input or unavailable checks instead of silently waiving them. The run's shared repair count and deadline survive replacement agents and resumes.

Leave changes uncommitted unless the run explicitly authorizes lead-owned checkpoints. Do not push, merge, deploy, install, weaken checks, change permanent rules or expand scope based on a skill alone. Workers do not edit controller state directly.

End with the observable result, key code links, actual checks, demonstration and unresolved issues. The lead records status through the selected execution path.
