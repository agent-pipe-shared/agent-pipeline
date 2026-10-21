---
schema: pipeline.backlog-item.v1
id: pipeline.the-architecture-adoption-gate-is-unconditional-for-projects-without-design-approval
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision D81 (2026-10-21, K3 a): the adoption gate becomes conditional in 0.7.x"
sprint: none
done_when: manual
---

# The architecture adoption gate is unconditional for projects without design approval

## Description

`inspectEffectiveArchitectureDecisions` (`lib/architecture-effective-decisions.mjs`,
since d02409a8a) lets a byte-valid accepted ADR become effective only when the
retained approved aggregate-design authority lists it. The gate does not ask
whether the project requires design approval at all:

- no readable aggregate-design authority returns `status: "blocked"` with
  `aggregate-design-authority-unverified` and an empty decision list, even when
  the project has no design-approval flow;
- an accepted ADR the authority does not list stays `advisory`
  (`decision-adoption-unverified`) and is not effective.

`SKILL.md` describes the requirement as "where design approval is required". The
bootstrap preflight only observes the result (it is not a hard gate there), but
every other consumer of the projection sees a project without a design-approval
flow as unresolved forever.

PO decision D81 (K3 a): make the gate conditional on design approval being
required, in 0.7.x. Until then the unconditional behaviour stays; the advisory
treatment of an unadopted ADR (K3 b) is intended and does not change.

## Acceptance

- A project whose calibration does not require design approval is not reported
  as unresolved because no aggregate-design authority exists.
- A project that requires design approval keeps the current gate, including
  `decision-adoption-unverified` for an unlisted accepted ADR.
- A RED pin for the no-design-approval case exists before the change (QG-04/QG-07).
- The `SKILL.md` wording and `architecture/map/pipeline-core.md` match the
  implemented condition.
