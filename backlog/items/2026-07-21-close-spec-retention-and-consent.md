---
schema: "pipeline.backlog-item.v1"
id: "pipeline.close-spec-retention-and-consent"
type: "workflow-improvement"
owner: "pipeline"
status: "open"
created: "2026-07-21"
source: "2026-07-21 full-close retro: Spec-retention authority drift and durable advisor-export consent readback"
---

# Bind retention and consent readback before delivery

## Description

The final close found that an approved authority correction can leave a retained
archive digest stale until the close-pre gate runs. The same block also needed a
durable, public-safe readback that advisor-export consent is approved without
exposing export material.

## Triggering situation

The 2026-07-21 close-pre checks found a byte mismatch between the active Sentinel
PRD and its retained archive. The setup quickfix then added an explicit approved
and disabled status readback for repository-scoped advisor export consent.

## Affected artifact

The close-block retention extension, setup consent status, and delivery checklist.

## Proposal

Make authority/archive digest reconciliation and consent-status readback explicit
in the pre-delivery checklist, with machine-readable evidence and no raw
question, answer, credential, or environment data.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
