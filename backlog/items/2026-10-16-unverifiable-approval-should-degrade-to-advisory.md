---
schema: pipeline.backlog-item.v1
id: pipeline.unverifiable-approval-should-degrade-to-advisory
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #24 ('PO decision BI'), 2026-10-16: an approved feature whose approval can no longer be re-verified degrades to advisory instead of locking all execution; backlog item after 0.7.0."
sprint: none
done_when: manual
---

# An approval that can no longer be re-verified should degrade to advisory

## Description

When an approved feature's approval can no longer be re-verified (for example
the proof material is unreadable or its trust anchor is unavailable), the
current behavior can lock all execution. The PO decided on 2026-10-16 that such
a feature degrades to advisory instead: the approval stops being enforcing, but
work is not blocked wholesale.

## Proposal

Distinguish "approval re-verification failed" from "approval absent or refused".
For the first case, mark the feature's approval state as advisory, keep it
visible in readiness output, and leave execution unblocked. The second case
keeps its current enforcing behavior.

## Acceptance

- When an approved feature's approval cannot be re-verified, the pipeline shall treat that approval as advisory and shall not block execution because of it.
- While an approval is advisory, the readiness output shall state that the approval is unverifiable and name the feature.
- If an approval is absent or explicitly refused, then the pipeline shall keep enforcing its current gate.
- When the approval becomes verifiable again, the pipeline shall restore its enforcing state without a new approval.

## Open questions for the PO

- Which causes of non-verifiability count as "can no longer be re-verified" (the decision gives no list) is for the implementation spec to propose and the PO to confirm.

Source: PO decision #24, 2026-10-16
