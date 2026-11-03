# Start with one useful result

1. Paste [the generic launch prompt](templates/LAUNCH.md) into Claude Code Desktop. Fill in the harness path, target repository and desired outcome. No global installation is needed.
2. Review the short task brief, responsibility sketch, important pattern links and required checks. Approve one representative block before increasing the queue.
3. After the run, open the served visual review. Read the outcome and key code links, try the demonstration, and leave notes. Notes and reading position are saved separately from the generated page.

The lead uses [orchestrate](skills/orchestrate/SKILL.md) and [the native workflow](docs/NATIVE.md) to connect build, check, independent review and bounded repair. Final checks and review must match the combined source. A failed block stops after its repair budget; it cannot become complete by dropping a finding or skipping a required check.

Project commands, permissions and architecture rules are explicit run inputs. Personal preferences are optional. Keep private context outside the shared repo or in ignored `.local/` files.

Start with one block. Increase the queue when first-pass code quality and owner review time justify it. Read [the overnight guide](docs/OVERNIGHT.md) before relying on unattended host continuation. Passing harness tests does not prove that a host can run all night or that generated code meets your standards.
