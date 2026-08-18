---
schema: pipeline.backlog-item.v1
id: pipeline.explicit-final-acceptance-gate
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-6 (priority P1)"
---

# Separate implementation-complete from PO-accepted in the final status

## Description

The result was reported as done even though browser verification and an
independent Critic review were missing. The completion status needs to
distinguish these states rather than collapsing them into a single
"done".

## Triggering situation

From the greenfield happy-path test report for pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52,
docs/pipeline-greenfield-happy-path-handover.md, Section 9 item P1-6.

## Affected artifact

completion/acceptance status model, final report format.

## Proposal

The completion status should separate: implementation complete;
automated verify passed; independent review passed/deferred;
manual/browser-based checks passed/pending; PO acceptance open/confirmed.
A push may still happen on explicit request even with documented pending
items, but must not be described as fully accepted.

Acceptance test: when a browser is missing, the status honestly reads
"browser verification pending" and the PO receives a clear local startup
instruction before the push ceremony.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
