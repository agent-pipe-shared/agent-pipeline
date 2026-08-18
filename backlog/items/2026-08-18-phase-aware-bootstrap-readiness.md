---
schema: pipeline.backlog-item.v1
id: pipeline.phase-aware-bootstrap-readiness
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-1 (priority P1)"
---

# Phase-aware bootstrap readiness check for pre-implementation verify

## Description

The greenfield design requires verify availability even though verify is
only permitted to be configured in the implementation phase. This creates
a false requirement during earlier phases, where no verify contract can
legitimately exist yet.

## Triggering situation

From a greenfield happy-path test report (pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52),
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Section 9, item P1-1.

## Affected artifact

bootstrap readiness check, pipeline-start-preflight.mjs.

## Proposal

Before the implementation phase, bootstrap should accept an explicit
status of verify-pending-initial-scaffold. This state is honest but
non-blocking. At the atomic phase transition into implementation, real
calibration becomes mandatory.

Acceptance test: an empty project reaches design-ready status without a
fake verify and without a guard denial; before the first implementation
commit, a real verify contract must exist.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
