# Nova B0 native-goal readback remediation plan

## Purpose

Prevent a persisted `active` Codex native-continuation record from surviving a
resume or Compact merely because its older readback was structurally valid.
The current App-Server observation proved that the active goal identity can
change independently of the persisted record; this plan closes that false-
success path without permitting Pipeline to replace a user-controlled goal.

## Scope and acceptance

1. `activate`, `resume`, and `compact-reentry` for an already active
   continuation invoke the adapter's normal set/readback path with the same
   generation and bounded subject/objective.
2. A matching readback refreshes the recorded observation only; it does not
   create a successor generation or a duplicate native goal.
3. A missing, malformed, blocked, or different active goal becomes the typed
   contract disposition (`blocked` or `unavailable` as the adapter returns).
   An active user-controlled goal is never overwritten.
4. The resulting non-active continuation records its terminal revision and
   contains no raw goal text, thread ID, host path, credential, or transcript.

## Verification

- Run `node plugins/pipeline-core/lib/continuity-state.test.mjs`.
- Run `node plugins/pipeline-core/lib/runner-native-continuation.test.mjs`.
- Run `node plugins/pipeline-core/scripts/codex-goal-host.test.mjs`.
- Run the configured full Verify/Security chain and independent Critic review.

## Compatibility and rollback

The change retains existing continuation schema, generation semantics, adapter
identity checks, and all terminal states. It adds a mandatory fresh readback
only on existing-active activation/resume/Compact events. Rollback is a normal
revert of this remediation commit; no state migration, external service,
provider operation, credential, publication, or user-goal mutation is needed.
