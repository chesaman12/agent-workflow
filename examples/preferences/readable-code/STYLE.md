# Example readability preferences

These optional example preferences apply only when explicitly selected for a run. Copy and edit them to match your own engineering standards. They are not general harness policy.

- Never use the em dash character in new code, comments, docs, or messages.
- Comments must not cite docs, section numbers, local sessions, chats, or work phases. Explain a short current reason only when it adds something the code does not show. Remove design essays and edit history.
- Keep the main path readable. Use named intermediate results and clear error handling. Polling must show its stopping condition; do not hide it inside `for (;;)` or `while (true)`.
- Do not compress code or scatter it into trivial helpers to meet a line-count rule.
- Use short, plain sentences in documentation. State behavior and limits. Do not add a new design document for every small repair.
- Use the tool's working directory. Do not use shell navigation commands that invoke a login-profile hook.

The companion eval-cases.mjs provides small exercises for these preferences. They are development examples, not a calibrated judge dataset.
