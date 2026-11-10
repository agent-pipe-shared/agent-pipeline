---
schema: pipeline.backlog-item.v1
id: pipeline.personal-routing-override
type: improvement
owner: pipeline
status: open
created: 2026-11-10
source: PO tile of 2026-11-10 on project-owned routing (ADR-0089)
sprint: after-0.7.0
done_when: manual
---

# Personal routing override on top of the project's routing

## Description

Routing stays in the tracked `pipeline.user.yaml` for 0.7.0, so every member of a team gets the same routes. The PO decided on 2026-11-10 that a personal override can follow after 0.7.0.

## Scope

- A local, untracked override, read from the machine plane, for the routes a single person wants to change.
- The dispatch readback names which routes came from the override.
- A plan approval records the routing it was approved under, so an override must not silently invalidate or bypass that record. The design has to settle how the two interact.

## Done when

The PO accepts the override behaviour and the interaction with an approved plan is pinned by a test.
