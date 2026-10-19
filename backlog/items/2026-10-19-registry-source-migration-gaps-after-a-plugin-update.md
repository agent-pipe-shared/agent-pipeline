---
schema: pipeline.backlog-item.v1
id: pipeline.registry-source-migration-gaps-after-a-plugin-update
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PO decisions D46/D48 (2026-10-19): PF-50, PF-52; Critic review of 823dbb754/677f8ec93 (partial, minor F1-F4)"
sprint: none
done_when: manual
---

# Gaps left after the session-authority migration for plugin updates

## Description

D48 migrates a session-authority catalogue that another plugin version wrote. The migration
runs at the first registry boundary entry: a governed item dispatch, an integration
readiness read, or a guard denial record. When the producer structure is unchanged, the
records are rebound. Otherwise, or on any fault, the registry starts fresh. The following
gaps remain.

- **Several runner installations.** Claude, Codex and Antigravity each install their own
  plugin copy. Two copies of different versions on one repository each see the other's
  catalogue as stale and migrate it in turn. This is better than the permanent refusal before
  D48, but an operation in flight under one version can fail its CAS when the other version
  migrates.
- **Readers outside the boundary.** `readSessionAuthoritySnapshot` and the direct catalogue
  readers in `codex-host-process-journal.mjs` and `onboarding-continuity.mjs` (the AFK
  physical check) read the catalogue without entering a boundary. Until a boundary entry has
  migrated a stale catalogue, they still refuse it.
- **No migration at preflight.** A preflight or `claude --resume` does not migrate. The first
  dispatch, readiness read or denial does.
- **PF-50 reach (Critic F1).** The Claude hook identity anchor is skipped by cleanup recovery
  and `session-cleanup start` only. Six `listActiveSessionDescriptors` sites in
  `onboarding-continuity.mjs` (about lines 2277, 3081, 3132, 3161, 3186 and 3707) pass no
  exclusion. Whether any of them lies on a resume path is not traced.
- **Unpinned boundaries (Critic F2-F4).**
  - No case covers a `claude-` descriptor with a live owner, with a cleanup manifest, or
    with another schema.
  - Nothing covers `applySessionCleanupRecovery` or `session-cleanup start` with an anchor
    present.
  - Nothing asserts the held-dependency refusal at publish, or the AGY reason and repair
    passthrough.
- **CLI session-cleanup binding.** Since d02409a8a, `bindOnboardingSessionCleanup` needs a
  session-power-controlled invocation, so `session-cleanup start` from a terminal is refused.
  39 session-cleanup-binding and 6 session-cleanup-recovery cases are red for this reason. D48
  only corrects the refusal text.

## Acceptance

- Every gap above is closed or recorded as a decision.
- A pin covers the sequence: session running → plugin update → resume → item dispatch.
