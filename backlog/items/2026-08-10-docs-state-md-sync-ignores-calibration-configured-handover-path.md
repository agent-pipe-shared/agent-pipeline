---
schema: pipeline.backlog-item.v1
id: pipeline.docs-state-md-sync-ignores-calibration-configured-handover-path
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Critic review (claude-opus-5, max, functional-equivalent-read-only lane) of GF-090 (commits 1b9ca12e/049ab1a8), 2026-08-10. Finding F2, verdict FAIL (alongside major finding F1, fixed as GF-091). Full report: scratch/critic-843d081a/critic-notes.md."
due: 2026-08-24
---

# `syncStateMdNextAction` hardcodes `docs/state.md`, ignoring a project's own `calibration.handover` path

## What happened

GF-090 (commits `1b9ca12e`, `049ab1a8`) built a live-sync mechanism that
regenerates `docs/state.md`'s "## Next action" section after every
phase/approval-changing `pipeline-state.mjs` command. `syncStateMdNextAction`
(`plugins/pipeline-core/lib/onboarding-continuity.mjs`) hardcodes the path
`docs/state.md`, but `onboarding-continuity.mjs:568` shows the handover path
is itself a configurable calibration field
(`calibration.handover === undefined ? "docs/state.md" : <configured path>`).
This was a disclosed, deliberate scope limit in GF-090's own code comment —
but per the Critic's finding, a documented risk without an owner and expiry
date is a finding, not a mitigation (QG-06), and no backlog item tracked it
until now.

## Why it matters

Any project that sets a non-default `calibration.handover` path gets NONE of
GF-090's live-sync fix — the exact stale-text defect that fix exists to
close (a handover doc directly contradicting live machine state) persists
there, unfixed and previously untracked.

## Direction

Either (a) make `syncStateMdNextAction` read the same `calibration.handover`
resolution logic already used elsewhere in `onboarding-continuity.mjs`
(~line 568) instead of hardcoding `docs/state.md`, so the sync applies to
whatever path a project actually configured, or (b) if some projects
legitimately have no single canonical handover file the mechanism could
target, document that as a hard boundary condition rather than an
open-ended gap. Add regression coverage proving the sync reaches a
calibration-configured alternate path if option (a) is chosen.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
