---
schema: pipeline.backlog-item.v1
id: pipeline.self-healing-local-cleanup-recovery
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-5 (priority P1)"
---

# Auto-execute reversible, local, fully-typed cleanup recoveries without PO prompt

## Description

The PO had to select a recommended attended-host-recovery for local,
private cleanup metadata. Recoveries that are reversible, local, and
fully typed should be executable autonomously within the consent already
granted to the pipeline; only data loss, external effects, or genuine
policy choices should remain a human decision.

## Triggering situation

From the greenfield happy-path test report for pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52,
docs/pipeline-greenfield-happy-path-handover.md, Section 9 item P1-5.

## Affected artifact

session-cleanup-recovery.mjs, cleanup recovery planner.

## Proposal

Reversible, local, and fully-typed cleanup recoveries should be executed
autonomously under the already-granted pipeline consent; only data loss,
external effects, or genuine policy choices remain human decisions.

Acceptance test: an orphaned cleanup descriptor is repaired automatically,
and the PO sees at most a completion note, not a selection question.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
