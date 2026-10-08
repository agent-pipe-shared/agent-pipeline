---
schema: pipeline.backlog-item.v1
id: pipeline.catalogue-admit-prescribed-lifecycle-verbs
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Catalogue-admit prescribed lifecycle verbs

## Description

Admin-step inventory row C12 (hand-run lifecycle verbs refused to the agent: `present-plan`,
`design-course-session --run-v2`, continuity writes, run via `!`; per design course, PO terminal) is classified
automatable: catalogue-admit every verb the course prescribes. Source: `docs/admin-steps-inventory.md` row C12,
candidate 4; toil log:27, :29, :30 (T21, T23, T24).

## Triggering situation

Toil rows T21/T23/T24 (toil log:27, :29, :30): the design course prescribes verbs that the agent is then refused,
so the PO runs them by hand.

## Affected artifact

The command catalogue / guard admission in `plugins/pipeline-core` and the design-course lifecycle verbs.

## Proposal

Every verb the course prescribes runs for the agent in the state where it is prescribed.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08
