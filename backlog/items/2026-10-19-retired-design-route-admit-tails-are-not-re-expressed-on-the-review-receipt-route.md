---
schema: pipeline.backlog-item.v1
id: pipeline.retired-design-route-admit-tails-are-not-re-expressed-on-the-review-receipt-route
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decision E15 (2026-10-19): the admit-side tails that ceremony C4 leaves dormant in pipeline-state.test.mjs"
sprint: none
done_when: manual
---

# Retired design-route admit tails are not re-expressed on the review-receipt route

## Description

ADR-0085 retired `present-plan --design-workflow-package`, so seven cases in
`plugins/pipeline-core/scripts/pipeline-state.test.mjs` now assert the
`DWP-PRESENT-RETIRED` refusal (ceremony C4). Their admit-side tails are kept
verbatim, but they sit behind `RETIRED_ROUTE_TAIL_LIVE = false` and no longer
run. Three behaviours lose their examiner in that suite:

- final approval of a Feature design package;
- chat attribution on that approval;
- a profile change invalidating an approved or implementing Feature.

`design-approval-route.e2e.test.mjs` covers the live approval happy path only.

## Acceptance

- Each of the three behaviours has a running examiner on the
  `present-plan --review-receipt` route, with the same claim as the dormant
  tail.
- The dormant tails are removed only after their replacement is green, with a
  QG-04 justification.

## Triage

Medium (D6/D10): not blocking for 0.7.0, because the live happy path is
covered and the old assertions are preserved.
