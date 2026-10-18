---
schema: pipeline.backlog-item.v1
id: pipeline.model-role-dispatch-select-has-no-route-for-the-consumer-implementation-duties
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-25 side finding)"
sprint: none
done_when: manual
---

# model-role-dispatch-select has no route for the consumer implementation duties

## Description

In a consumer project with profile epic, `model-role-dispatch-select.mjs` returns
`MODEL-ROLE-SELECT-ROUTE-UNAVAILABLE` for both `--task-route profile.epic.implementation`
and `--task-route duty.goldfish`. The session used the V3 fallback. The implementation
reference tells the Elephant to run this command before every model-bearing dispatch, so the
documented happy path always lands on the fallback.

## Triggering situation

The first Goldfish dispatch after `set-phase implementation` in a consumer project.

## Proposal

Establish which route names the registered source declares for a consumer, and either
register the implementation routes or correct the route names in the reference.

## Acceptance

- In a consumer epic project, the documented task route for a Goldfish dispatch returns
  `ready` or `legacy-v3` with an explicit reason, not `ROUTE-UNAVAILABLE`.
