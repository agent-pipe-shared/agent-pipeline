# Blind push Driver closure evidence — 2026-08-30

## Decision

`pipeline.blind-session-zero-followable-steps-on-push-path` is closed.  The
current happy path is exercised from a disposable, empty local repository by
following the Driver's published action protocol.  It reaches a recorded,
signature-authorized push approval rather than silently stopping after
onboarding or falling back to a hand-assembled command.

## Defect and correction

The final live failure was narrow and reproducible: a returned
`pipeline-state.mjs inspect` action intentionally has no `--root` argument.
The Driver executed it in the checkout that launched the Driver, so it read
that checkout's active feature and made the disposable greenfield path appear
to have reached an unrelated state.

Commit `abe764e8` binds only returned actions without an explicit `--root` to
the Driver's canonical root through `CLAUDE_PROJECT_DIR`.  Actions that already
carry `--root` retain their returned argv and ordinary environment inheritance.
The unit regression proves both sides of that boundary.

The measurement also now consumes each declared input only through its own
published `applyAction`: one replacement for the bundled design-answer JSON,
the plan approver, and the verify command.  It never reconstructs an older
intake or plan command from prose.  It executes the returned executable and
argv in the disposable project, so a root-less project action cannot read the
Pipeline checkout by accident.

## Executed evidence

All commands below ran against the candidate containing `abe764e8`.

- `node plugins/pipeline-core/scripts/onboarding-init.test.mjs`: **23/23**.
  This includes the root-less returned-action binding regression.
- `node plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`:
  **5/5**, one explicitly superseded legacy test skipped.  Claude, Codex, and
  Antigravity each start in an empty folder and follow only returned actions
  through a real first implementation file and local verification.
- `node plugins/pipeline-core/scripts/pipeline-state-inspect.test.mjs`:
  **19/19**.  It covers the structured plan, verify, implementation, and
  push-init handovers, including genuine `collect-input` stops where a human
  decision is required.
- `node plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs`:
  **9/9**.  Its full disposable path reports `signed-push-recorded`, commits
  the onboarding output, preserves a Driver-completed plan approval, sets the
  real verify contract, and records `approve-push` successfully.

The TOFU measurement ends deliberately at `approve-push`.  It does not claim
to have run `git push` or pinned a trust anchor through the separate push-hook
interception path; that boundary is outside this item's Driver-handover scope.
Its disposable approval fixture is test evidence only, not a production route
for an agent to create a human signature.  The production inspect contract
continues to surface the detached signature as a human-only stop.

## Acceptance interpretation

The original `scratch/smoke-blind-push.mjs` was an untracked, hand-maintained
probe.  The tracked `measure-tofu-push-e2e.test.mjs` now provides the stronger
and durable replacement: it starts from an empty project, follows only
structured Driver actions, checks the terminal result, and runs in the normal
test suite.  The three-runner Driver E2E supplies the corresponding permanent
cross-runner proof for the shared onboarding-to-implementation prefix.

This closes the bounded first-feature/push happy path.  Broad emitter auditing
and other non-happy-path protocol surfaces remain independently tracked in
Nova B rather than being implied by this closure.
