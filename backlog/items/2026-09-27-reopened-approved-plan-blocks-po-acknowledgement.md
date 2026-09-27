---
schema: pipeline.backlog-item.v1
id: pipeline.reopened-approved-plan-blocks-po-acknowledgement
type: defect
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "Alfred 0.7 plan refresh after reopen-design, 2026-09-27; live project/pipeline-state.json and po-authority-acknowledge-plan readback."
---

# Reopened approved plan cannot use the PO acknowledgement route

After an approved Epic was reopened for a PRD/Spec amendment,
`reopen-design` recorded an invalidation and set Design/Draft but retained the
old `planSubmission` and `planApproval` as audit history. The sanctioned
`po-authority-acknowledge-plan` then returned `PO-ACK-STATE` because it rejects
every state containing `planSubmission`. The current PRD has no acknowledgement
marker for its amended Spec. The ordinary cancellation only accepts a current
unapproved submission; mixed-state cancellation requires a successor
submission distinct from the invalidated one. Neither applies here.

## Required behavior

- Admit the existing attended PO acknowledgement ceremony for an exact
  reopened Design/Draft state whose retained submission and approval are
  both bound to the recorded invalidation. Preserve their audit evidence.
- Refuse an uninvalidated, awaiting, implementing, or contradictory state.
  Do not infer the PO acknowledgement from chat or let the agent write it.
- After exact PO acknowledgement, permit a fresh submission, presentation,
  signed approval, and implementation transition without resetting or
  discarding the feature.
- Keep the profile repair and signature checks intact. A failed or stale
  ceremony must make no partial PRD or state write.

## Acceptance

A regression fixture starts with a genuinely approved Epic, reopens it,
amends PRD/Spec, and runs the exact acknowledgement plan and apply path.
It reaches fresh submission and signed approval with old evidence retained.
Negative fixtures cover invalidation mismatch, stale plan/preimage, and
unapproved current submission. A live Alfred readback confirms the new path.

## Triage

- **Decision:** pending
- **Assignment:** Alfred 0.7 release blocker
- **Date:** 2026-09-27
