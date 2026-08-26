---
schema: pipeline.backlog-item.v1
id: pipeline.tp-guard-rules-lifted-on-the-merging-machine-must-be-restored
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "Critic round 1 over the Phoenix merge (areas CR1-GUARDS and CR1-VERIFY, independently), 2026-08-27"
---

# Protected-test-path guard rules TP-3/4/5/6/7 are lifted on the merging machine and must be restored

## Description

To resolve the `origin/sprint_phoenix` merge, five protected-test-path rules
were temporarily lifted so that conflicted TP-protected files could be edited:

- **TP-3** `harness/scripts/verify.mjs`
- **TP-4** `plugins/pipeline-core/hooks/hooks.json`
- **TP-5** `guard-push*.test.mjs` / `harness/scripts/pipeline-state.test.mjs`
- **TP-6** `plugins/pipeline-core/hooks/guard-gate-strength.test.mjs`
- **TP-7** `plugins/pipeline-core/hooks/guard-testpath-override.test.mjs`

The lift is **machine-local**: it patches
`<live plugin root>/lib/protected-test-paths.mjs`, outside the repository, so
it cannot be observed from a clone and does not appear in any diff. TP-1, TP-2
and TP-8..TP-12 were deliberately left armed.

The lift itself is recorded in
`specs/sprint-nova-epic/evidence/tp-lift-audit.ndjson` (tracked). The restore
obligation, however, was recorded only in `scratch/PHOENIX-MERGE-OPEN-POINTS.md`
— an untracked file in the repository's explicitly disposable scratch
directory. Two independent Critic reviews flagged that placement, and they are
right: a security obligation whose only tracker is disposable disappears
silently when that file does, and the lift then becomes permanent with nobody
aware of it. This item exists to give the obligation a durable, tracked home.

## What has to happen

1. `node scratch/tp-lift.mjs restore` on the merging machine.
2. Reload the plugin/session so the restored module is the one enforcing.
3. Confirm `node scratch/tp-lift.mjs status` reports `armed`.
4. Confirm the restore wrote its audit entry to
   `specs/sprint-nova-epic/evidence/tp-lift-audit.ndjson` — the restore path
   appends one, and its absence means the restore did not run through the
   tool.
5. Delete the scratch tooling (`scratch/tp-lift.mjs` and the other
   merge-support scripts). The audit log is tracked and stays.

## Why it is not done yet

The merge is not finished: an independent-review cycle is still open, and a
Critic finding could require another edit to a TP-protected file. Restoring
before that would mean lifting again. The restore is therefore the LAST step
of the merge, not an omission.

## Due

**Before the merge candidate is pushed or accepted.** A push while these rules
are lifted is the specific outcome this item exists to prevent — the guard
family that protects the verify gate and the hook wiring would be down on the
machine performing it.

## Triage

- **Decision:** open, owned by the session that finishes the Phoenix merge.
  Not deferrable past that merge's completion.
