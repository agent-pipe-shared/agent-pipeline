---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-does-not-name-the-criterion-renderings-the-delivery-course-admits
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-23 diagnosis)"
sprint: none
done_when: manual
---

# The design course does not name the criterion renderings the delivery course admits

## Description

A consumer spec written through the design course and then signed stated its acceptance
criteria as EARS bullet items with compound ids (`- **AC-E1-01-09:** WHEN …`). The delivery
course admitted only plain `AC-<n>` ids in a closed set of renderings. The first item
dispatch after `set-phase implementation` was therefore refused with
`SQ-DELIVERY-COURSE-ABSENT`, and no human override exists for that code. The design course
never told the author which renderings the delivery course reads.

The delivery side is being widened in the same block (bullet items, compound ids). This item
covers the other side: a design package must be checked against the admitted renderings
before it is signed.

## Triggering situation

The first Goldfish dispatch of a consumer's first item after plan approval.

## Proposal

The spec template and the design course name the admitted criterion renderings and the id
grammar. The readiness check refuses a spec whose acceptance section contains no criterion
the delivery course can locate, before the PO signs.

## Acceptance

- The spec template shows an admitted rendering for acceptance criteria.
- A readiness check on a spec with no locatable criterion fails with a typed finding that
  names the admitted renderings.
