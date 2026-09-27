---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield-handover-claims-absent-supersession-marker
type: defect
owner: pipeline
status: open
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

