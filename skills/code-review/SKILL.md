---
name: code-review
description: "Review the changes since a fixed point (commit, branch, tag, or merge-base) along two axes: Standards (does the code follow this repo's documented coding standards?) and Spec (does the code match what the originating issue/spec asked for?). Reports both reviews separately. Use when the user wants to review a branch, a PR, work-in-progress changes, or asks to \"review since X\"."
---

Review all changes from the supplied base, including staged, unstaged, and untracked files:

- **Standards**: does the code conform to this repo's documented coding standards?
- **Spec**: does the code faithfully implement the originating issue / spec?

The runner starts this review in a fresh session with read-only tools. Review both axes separately. Do not spawn agents, edit files, or change the implementation.

TASK.md is the spec. The runner supplies the base, checkout, check evidence, repository rules, and selected personal preferences. No issue tracker setup is required.

## Process

### 1. Pin the fixed point

Whatever the user said is the fixed point (a commit SHA, branch name, tag, `main`, `HEAD~5`, etc.). If they didn't specify one, ask for it.

Use `git diff <base>` for tracked changes and `git ls-files --others --exclude-standard` for new files. Read new files too. The supplied base is the exact starting commit. Do not review only HEAD when the implementation is uncommitted.

Before going further, confirm the fixed point resolves (`git rev-parse <fixed-point>`) and there are tracked or untracked changes. Report a bad ref or empty change as incomplete.

### 2. Identify the spec source

Use the supplied TASK.md and selected block. Follow its code references when checking behavior. If a required decision is absent, report the missing decision. Do not substitute an older issue, branch note, or inferred requirement.

### 3. Identify the standards sources

Search the repo for every file that documents how code should be written. When `CODING_STANDARDS.md` or `CONTRIBUTING.md` exists, it must be on the list.

On top of whatever the repo documents, the Standards axis always carries the **smell baseline** below: a fixed set of Fowler code smells (_Refactoring_, ch.3) that applies even when a repo documents nothing. Two rules bind it:

- **The repo overrides.** A documented repo standard always wins; where it endorses something the baseline would flag, suppress the smell.
- **Always a judgement call.** A smell label alone is not a violation. A material maintainability problem can block acceptance when it demonstrates an approved boundary violation, unclear state/policy ownership, difficult control flow or scattered changes, with a concrete consequence and a simpler alternative. Like any standard here, skip anything tooling already enforces.

Each smell reads *what it is* → *how to fix*; match it against the diff:

- **Mysterious Name**: a function, variable, or type whose name doesn't reveal what it does or holds. → rename it; if no honest name comes, the design's murky.
- **Duplicated Code**: the same logic shape appears in more than one hunk or file in the change. → extract the shared shape, call it from both.
- **Feature Envy**: a method that reaches into another object's data more than its own. → move the method onto the data it envies.
- **Data Clumps**: the same few fields or params keep travelling together (a type wanting to be born). → bundle them into one type, pass that.
- **Primitive Obsession**: a primitive or string standing in for a domain concept that deserves its own type. → give the concept its own small type.
- **Repeated Switches**: the same `switch`/`if`-cascade on the same type recurs across the change. → replace with polymorphism, or one map both sites share.
- **Shotgun Surgery**: one logical change forces scattered edits across many files in the diff. → gather what changes together into one module.
- **Divergent Change**: one file or module is edited for several unrelated reasons. → split so each module changes for one reason.
- **Speculative Generality**: abstraction, parameters, or hooks added for needs the spec doesn't have. → delete it; inline back until a real need shows.
- **Message Chains**: long `a.b().c().d()` navigation the caller shouldn't depend on. → hide the walk behind one method on the first object.
- **Middle Man**: a class or function that mostly just delegates onward. → cut it, call the real target direct.
- **Refused Bequest**: a subclass or implementer that ignores or overrides most of what it inherits. → drop the inheritance, use composition.

### 4. Review and report

Review the actual code and its callers, not only the builder's summary. Check that tests exercise the requested behavior and that required checks really ran. Separate blocking defects and documented-standard violations from optional suggestions. Cite file locations and the affected requirement. Do not invent findings to fill the report.

Report Standards and Spec separately. Use stable finding IDs, file and line, category (`correctness`, `architecture`, `readability`, `verification`), `blocking`, message and suggested correction. Optional advice does not fail an axis. Required maintainability findings affect Standards even when tests pass; they do not need a runnable bug as proof. Avoid taste-only churn and speculative abstractions.

The structured verdict has `standards`, `spec`, `summary`, `notVerified` and `closed`. Each axis has `passed` and `findings`. `notVerified` lists missing required evidence and prevents acceptance. Put optional risks in nonblocking findings. On re-review, keep unresolved IDs and explicitly close each resolved required finding with `{id, reason}`. Explain the evidence for closure. A finding must not disappear merely because a new reviewer took over.

Review source and affected callers in fresh context. The builder cannot close its own required findings. Do not give benchmark reviewers human critiques or expected findings. For native runs, the lead records the checked tree and the actual reviewer identity through the helper described in ../../docs/NATIVE.md.

In a manual session, the same result may be written in plain text unless a structured response is requested.

## Why two axes

A change can pass one axis and fail the other:

- Code that follows every standard but implements the wrong thing → **Standards pass, Spec fail.**
- Code that does exactly what the issue asked but breaks the project's conventions → **Spec pass, Standards fail.**

Reporting them separately stops one axis from masking the other.
