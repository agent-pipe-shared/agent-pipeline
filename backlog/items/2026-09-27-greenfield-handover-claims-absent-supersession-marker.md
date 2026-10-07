---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-handover-claims-absent-supersession-marker
type: defect
owner: pipeline
status: closed
closed_at: 2026-10-07
closure_repository: self
closure_commit: 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d
closure_evidence: specs/sprint-alfred-epic/plans/backlog-triage-2026-10-07.md
created: 2026-09-27
source: "Codex/WSL greenfield review B9; current consumer docs/state.md claims SUPERSEDED.md, tracked tree has none, and onboarding-continuity.mjs emits the sentence unconditionally."
sprint: none
done_when: manual
---

# A fresh-intake handover claims a supersession marker that does not exist

## Description

The generated `docs/state.md` says a provisional kickoff PRD/Spec directory
contains `SUPERSEDED.md`. The 2026-09-27 consumer project has no such tracked
marker because this route began directly with a fresh intake package.
`onboarding-continuity.mjs` emits the statement unconditionally. This is a
misleading handover even though machine state still names the active feature.

## Triggering situation

The Codex/WSL greenfield Feature project after plan submission.

## Affected artifact

`onboarding-continuity.mjs` handover projection and fresh-intake versus
kickoff-promotion fixtures.

## Proposal

Derive handover wording from the actually observed kickoff anchor and marker.
On a direct intake, describe only the promoted package and current next
action. On a true kickoff promotion, retain the marker claim only after its
physical readback.

## Acceptance

- Direct-intake fixture emits no provisional-kickoff or `SUPERSEDED.md` claim.
- Kickoff-promotion fixture emits it only when the marker exists and names
  the active successor.
- Both handovers agree with the machine `activeFeature` and next action.

## Triage

- **Decision:** closed — fixed in source
- **Rationale:** fixed at 26fef9e7d: lib/onboarding-continuity.mjs handover content no longer names SUPERSEDED.md for direct intake; test: onboarding-continuity.test.mjs assertion 'direct intake has no provisional kickoff package to supersede'.
- **Assignment (if accepted):** n/a
- **Date:** 2026-10-07

## Preparation evidence (2026-09-28)

Read-only reconciliation found that the earlier prepared direct-intake fix
still inferred physical marker publication from the kickoff-promotion kind.
The canonical annotation writer intentionally tolerates absent directories,
preexisting unrelated markers and failure after durable State publication.
Replay is zero-write. Reading a fresh marker while reconstructing the handover
would also change a digest-bound transaction target after publication.

The revised `scratch/onboarding-handover-truth.patch` therefore retains the
proved predecessor fact for kickoff promotion and removes the physical marker
assertion from transaction-generated handovers. Direct intake has no predecessor
assertion. A future positive marker statement requires separately bound readback.
Existing crash, removed-directory, unrelated-marker and direct-intake fixtures
now assert truthful handover text. Eight targeted source fixture cases pass
using the exact aggregate-proposed continuity module/test bytes in an isolated
module load, including unchanged promotion and direct-bind replay. No canonical
file was rewritten; this is preparation evidence, not integrated acceptance.
