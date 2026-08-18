---
schema: pipeline.backlog-item.v1
id: pipeline.per-phase-progress-message-budget
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P2-1 (priority P2)"
---

# Limit session progress messages to one start and one completion per phase

## Description

Internal pipeline movements were surfaced to the user as many separate
progress messages. This adds unnecessary noise to the human-facing turn
stream, obscuring the signal of what actually needs the PO's attention.
Routine internal readbacks were not being distinguished from messages
that genuinely required visibility.

## Triggering situation

From a greenfield happy-path test report, pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52,
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Cites Section 9, item P2-1 ("Status- und Turn-Budget").

## Affected artifact

session progress messaging conventions.

## Proposal

Limit progress messaging to at most one short start message and one short
completion message per phase. Additional messages are only sent when a
human decision is needed, a real blockage occurs, or a step's runtime
exceeds 60 seconds; routine readbacks stay internal.

Acceptance test: no additional PO turn is generated between intake and
PRD approval, and none between approval and the result.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
