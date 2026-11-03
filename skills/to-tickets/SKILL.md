---
name: to-tickets
description: Break a plan, spec, or the current conversation into reviewable blocks with dependencies, recorded in TASK.md and the selected run configuration.
disable-model-invocation: true
---

# To Tickets

Break a plan, spec, or conversation into a set of **tickets**: tracer-bullet vertical slices, each declaring the tickets that **block** it.

Use TASK.md for requirements. Desktop uses NATIVE.json for block paths, dependencies, design links and deadlines. The optional CLI controller uses RUN.json for its model, delivery and execution limits. No tracker is required.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes a reference (a spec path, an issue number or URL) as an argument, fetch it and read its full body and comments.

### 2. Explore the codebase

If you have not already explored the codebase, do so to understand the current state of the code. Ticket titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

Look for opportunities to prefactor the code to make the implementation easier. "Make the change easy, then make the easy change."

### 3. Draft vertical slices

Break the work into **tracer bullet** tickets.

<vertical-slice-rules>

- Each slice cuts a narrow but COMPLETE path through every layer (schema, API, UI, tests): vertical, NOT a horizontal slice of one layer
- A completed slice is demoable or verifiable on its own
- Each slice is sized to fit in a single fresh context window
- Any prefactoring should be done first

</vertical-slice-rules>

Give each ticket its **blocking edges**: the other tickets that must complete before it can start. A ticket with no blockers can start immediately.

**Wide refactors are the exception to vertical slicing.** A **wide refactor** is one mechanical change (rename a column, retype a shared symbol) whose **blast radius** fans across the whole codebase, so a single edit breaks thousands of call sites at once and no vertical slice can land green. Don't force it into a tracer bullet; sequence it as **expand-contract**. First expand: add the new form beside the old so nothing breaks. Then migrate the call sites over in batches sized by blast radius (per package, per directory), each batch its own ticket blocked by the expand, keeping CI green batch to batch because the old form still exists. Finally contract: delete the old form once no caller remains, in a ticket blocked by every migrate batch. This runner requires each accepted block to pass the project gate. When smaller batches cannot stay green, keep that coupled change in one reviewable block or plan it as supervised work. Do not promise an unattended sequence whose intermediate blocks cannot pass.

### 4. Review the proposed scope

Present the proposed breakdown as a numbered list. For each ticket, show:

- **Title**: short descriptive name
- **Blocked by**: which other tickets (if any) must complete first
- **What it delivers**: the end-to-end behaviour this ticket makes work

Resolve material choices about scope, dependencies and authority. Reuse existing approval when the breakdown preserves the approved outcome. Do not repeat a planning interview for routine implementation choices.

### 5. Save the approved breakdown

Keep the requirements and acceptance examples in TASK.md, under each block's title. Use the configuration for the selected execution mode described above. Do not repeat the requirements in both files. Each block must identify real existing code and types in TASK.md.

Use the local task template. Start with one small block. Set later batch sizes from the available review and repair budget. Do not publish issues, create remotes, or change a parent issue unless explicitly asked.
