---
schema: pipeline.backlog-item.v1
id: pipeline.po-human-approval-rethrow-has-no-consumer-pin
type: defect
owner: pipeline
status: open
created: 2026-10-17
source: "Critic C6g1 DIFF 1, candidate C-B (specs/sprint-alfred-epic/implementation/claude-2026-10-12/critic/C6g1-diff-result.md); PO decision 2026-10-17 (backlog)."
sprint: alfred
done_when: manual
---

# The rethrow in po-human-approval.mjs has no consumer-level pin

## Description

`plugins/pipeline-core/scripts/po-human-approval.mjs` rethrows a failure (near
lines 427-432) that its consumers (near lines 2542 and 2576) rely on. No test
pins that behavior at consumer level: reverting the rethrow to `return null`
leaves every current test green, so the change could silently regress.

## Proposal

Add a pin that drives a consumer path and fails when the rethrow becomes a
silent `null`.

## Acceptance

- A pin is RED with the rethrow replaced by `return null` and GREEN on the
  current code.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** PO 2026-10-17: backlog.
- **Rationale:** Test-coverage gap, no observed defect.
- **Assignment (if accepted):**
- **Date:** 2026-10-17
