---
name: to-spec
description: "Turn a conversation and actual code into a short task and design brief for review."
disable-model-invocation: true
---

Read the actual implementation, callers, types, tests and repository rules. Synthesize the current conversation into TASK.md using ../../templates/TASK.md. Do not repeat answered questions or require a new interview. Surface only unresolved choices that change the design, behavior or authority.

For substantial work, make the design concrete before coding:

- Show a small caller example and identify the owners of important state, business rules and external effects.
- Name existing interfaces and patterns to reuse, with specific file/symbol links.
- Trace the important success and failure paths. Use a small responsibility or state diagram when it explains more clearly than prose.
- Describe one likely future change and where it should be localized.
- Compare a second approach only for a real tradeoff. A small repair may explicitly keep the existing design.

A coordinator may call validation, domain rules, persistence and external services. Do not create forwarding layers merely to name each execution stage. Read ../codebase-design/SKILL.md when the interface itself needs design work.

Choose test boundaries that expose the task's meaningful behavior. Existing interfaces are preferred, but a task may need more than one boundary to verify persistence, external effects and UI behavior. Record missing coverage and real device/service needs. Existing user authorization applies; do not ask permission again for routine tests.

Keep the opening brief readable in a few minutes. Put details behind links. Separate approved scope, proposed scope and decisions still needed. Use ../to-tickets/SKILL.md only when several independently reviewable blocks help. Execution budgets and dependencies belong in the run configuration, not a second requirements document.
