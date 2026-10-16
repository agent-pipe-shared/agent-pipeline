---
schema: pipeline.backlog-item.v1
id: pipeline.model-role-bootstrap-ignores-version-bumps-within-a-family
type: defect
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision #22, 2026-10-16: the model-role bootstrap should detect a newly available model of a known family and actively propose it; a version bump within a known family is apparently ignored."
sprint: none
done_when: manual
---

# Model-role bootstrap ignores version bumps within a known model family

## Description

The model-role bootstrap is meant to notice a newly available model of a family
it already knows and to propose it for the matching role. Observed: the mechanic
tier stayed documented on Haiku while the bootstrap never proposed the newer
Haiku version. A version bump inside a known family is apparently not treated as
a new candidate at all, so the role keeps the older model without any prompt to
the PO.

## Proposal

Make the bootstrap compare available models against the role assignments at the
family level plus version, and surface any strictly newer version of an assigned
family as an explicit proposal for the PO to accept or decline. First reproduce
the miss with the mechanic-tier Haiku case, then fix the detection.

## Acceptance

- When a newer version of a model family already assigned to a role becomes available, the model-role bootstrap shall propose that version for the role.
- If the bootstrap proposes a newer version, then it shall not change the role assignment until the PO accepts the proposal.
- When no newer version of an assigned family is available, the bootstrap shall emit no proposal for that role.
- The mechanic-tier Haiku case that was observed shall be covered by a regression test that fails on the current behavior.

## Open questions for the PO

- None recorded; the exact version-ordering rule per family is left to the implementation spec.

Source: PO decision #22, 2026-10-16
