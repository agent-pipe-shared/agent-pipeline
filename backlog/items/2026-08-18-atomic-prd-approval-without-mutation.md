---
schema: pipeline.backlog-item.v1
id: pipeline.atomic-prd-approval-without-mutation
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-2 (priority P0)"
---

# Atomic PRD approval without PRD mutation

## Description

The gate requires a marker to be written into a PRD that is already bound
and therefore no longer editable. This creates a contradiction: the
approval mechanism demands a write to an artifact whose immutability the
binding step itself is supposed to guarantee. There is currently no
separate, atomic way to record PO acknowledgement without touching the
bound PRD.

## Triggering situation

Observed during a greenfield happy-path test of pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52;
documented as Section 9, item P0-2 of the full report at
docs/pipeline-greenfield-happy-path-handover.md in that test repo.

## Affected artifact

PO-Gate, pipeline-state.mjs, Promotion-History, guard-apply-patch.mjs.

## Proposal

Store the PO acknowledgement separately in the pipeline state instead of
writing a marker into the PRD. approve-plan should accept the confirmed
PRD/spec digest and the human attribution, and atomically perform
acknowledgement, plan approval, history update, and phase transition in
one step, so that no comment ever needs to be written back into the PRD
afterward.

Acceptance test: after exactly one chat approval, a bound greenfield
feature transitions into implementation without any HGO, reopen-design,
rebind, or signature step, and continuity is immediately valid.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
