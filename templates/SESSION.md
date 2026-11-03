# {{Run name}}

This is a human handoff for a native coding session. With the local helper, state.json is authoritative; link it instead of maintaining a second status table. Requirements remain in the linked task. This file is not a harness.ts RUN.json input. Keep human notes in a separate file that the lead never replaces.

- Run folder and state.json:
- Visual review and local viewer URL:
- Last reconciled source identity:

## Contract

- Task and approved scope:
- Checkout and initial revision:
- Existing changes and preserved design inputs:
- Repo rules and selected personal preferences:
- Approval source and allowed actions:
- Baseline checks and evidence:
- Host/session and continuation mechanism:
- Maximum concurrent workers:
- Started at, with timezone:
- Stop at, with timezone, unchanged on resume:
- Begin final review at:
- Billing mode and observed account limits, if available:
- Run status: preparing | running | waiting-for-reset | blocked | review-ready | stopped

## Work map

| Block | Outcome and acceptance reference | Depends on | Owner and allowed files | Evidence links |
|---|---|---|---|---|
| {{id}} | {{outcome}} | {{ids}} | {{owner; files}} | |

Read live status from the helper's state.json or `native --action status`. Do not copy statuses into a second table. A block's `review_ready` status means its checks and review passed; the run still needs final integrated checks and review. Human acceptance is separate.

## Current handoff

Keep one dated handoff snapshot here. Replace the lead's old field values at each handoff; move useful history to Evidence and decisions. Link the helper's current state rather than maintaining competing counters. Never replace human notes. If the record conflicts with files or logs on resume, reconcile it before assigning work or claiming success.

- Updated at, with timezone:
- Current checkout, revision, and uncommitted work:
- Active workers, exact workspaces, and separate scratch directories:
- Last verified integrated state, check result, and evidence path:
- Changes since that check and checks still needed:
- Incomplete changes and where they are saved:
- Current failure and repair attempts:
- Next action:
- Blocked decisions:

For a check on uncommitted work, save enough evidence to identify the tested tracked changes and new files. A commit id alone does not identify that tree. Keep build, automated tests, review, and UI interaction evidence distinct. A successful launch or screenshot does not prove that taps, typing, navigation, or scrolling work.

## Evidence and decisions

Record check commands, exit results, tested revision or diff, and log paths. Record material design decisions with their source. Keep long logs outside this file. Never record secrets.

## Owner review

- What works and how to demonstrate it:
- Main code and tests to inspect:
- Unverified behavior and known failures:
- What remains from the approved scope:
- Suggested next scope, outside this run:
