---
schema: pipeline.backlog-item.v1
id: pipeline.transactional-readbacks-not-status-cascades
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-8 (priority P1)"
---

# Transactional readbacks instead of status cascades

## Description

Many writes each triggered separate status, continuity, and handover
queries. This produced redundant, cascading inspection calls instead of a
single consolidated result.

## Triggering situation

Greenfield happy-path test report, pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52; see
docs/pipeline-greenfield-happy-path-handover.md in that test repo,
Section 9, item P1-8.

## Affected artifact

coordinator command readback shape, pipeline-state.mjs.

## Proposal

Coordinator commands should return, after an atomic mutation, one bound
overall readback covering state, continuity, handover, candidate, and
next action. Additional individual inspections should only be necessary
in case of drift.

Acceptance test: the normal plan-approval transition requires at most one
mutating action and one overall readback.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
