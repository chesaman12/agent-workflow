# Upstream skills and local changes

Source: https://github.com/mattpocock/skills

Pinned revision: `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d`. The upstream MIT license is in LICENSE. These are local adaptations, not an installed upstream plugin. Updates require reviewing the diff at a new pinned revision. There is no automatic download at run time.

| Skill | Kept | Adapted |
|---|---|---|
| to-spec | Exploration, test boundaries, decisions, scope | One local TASK.md; actual files/types; short repairs |
| to-tickets | Complete vertical slices, dependencies, owner review | NATIVE.json or RUN.json execution metadata; no issue publication or repeated approval |
| implement | Spec, tests during work, review before delivery | Selected block; uncommitted changes; bounded repairs; defer missing decisions |
| tdd | Public interfaces, behavioral tests, red/green loop, mocking | Agreed test boundaries; no repeated approval; required refactoring allowed |
| code-review | Separate Standards and Spec, smell guidance | One fresh read-only session; uncommitted/new files; TASK.md; structured findings |
| codebase-design | Design guidance and deepening reference | Project vocabulary wins; no automatic parallel design exercise |

The runner injects implement and tdd for the builder and code-review for the reviewer. Supporting references are available in the run's skill snapshot. Planning skills are read by the interactive planning session. No global skill invocation or tracker integration is assumed.

`orchestrate` is a local skill, not an upstream Matt Pocock skill. It coordinates the six adapted skills in native long sessions: bounded delegation, integrated checks, repair limits, saved progress, and handoff. It does not change the CLI controller's permissions or enable its subagents.

Upstream punctuation was normalized. Project names, commands, paths, and personal style rules stay outside these skills.

Quality-loop update: planning now requires proportionate ownership and caller examples; maintainability findings can block acceptance with concrete consequences; reviewers retain required findings until explicit closure. Native orchestration records state through the local helper. Testing guidance permits persisted-state and external-effect assertions when they are the contract. These are local changes, not claims about upstream behavior.
