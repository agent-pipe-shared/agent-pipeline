---
schema: pipeline.backlog-item.v1
id: pipeline.design-addendum-for-a-single-value
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: "PO tile of 2026-11-10 on a one-value design change during implementation, placing an addendum after 0.7.0"
sprint: alfred
done_when: manual
---

# A design addendum for a single changed value

## Description

Changing one design value during implementation requires a reopen today: the signature is void, and the design is submitted, signed and materialized again. In a greenfield run on native Windows one value cost a new signature and three separate stops. The PO's direction is that this must not turn into repeated reopens. Candidate 28 repairs the three stops, and the reopen stays the route for 0.7.0.

The PO decided on 2026-11-10 that an addendum follows after 0.7.0.

## Scope

- The PO names the change, and it is recorded in its own file outside the signed design files, so the signature stays valid.
- Implementation, Critic, Close and the audit bundle read the signed design together with its addenda.
- The design has to settle which changes qualify. A change of goal, scope or the structure of the acceptance criteria stays a reopen.

## Done when

A one-value change reaches implementation without a new signature, a change that does not qualify is refused with the reopen route, and the PO accepts the behaviour.
