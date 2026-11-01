---
schema: pipeline.backlog-item.v1
id: pipeline.feature-close-audit-has-no-policy-pack-for-a-consumer
type: defect
owner: pipeline
status: open
done_when: manual
release: 0.7.1
created: 2026-11-01
sprint: alfred
source: "Toolbox close question (2026-11-01): a consumer feature with slices recorded only by their `Dispatch: <slice> (goldfish)` commit can close only on the audit route, and that route needs organization policy packs the consumer does not have."
---

# The feature-close audit route needs policy packs a consumer cannot obtain

## What happened

A rigor >= 1 feature of a consumer cannot be closed with the coordinator unless it takes the candidate-bound audit route
(`close-coordinator plan-transition --phase feature-close-prepared --audit-request <path> --critic-verify-lifecycle <id>`): the planner refuses
`CLOSE-QUALIFICATION-REQUIRED` for rigor >= 1 without it, and `CLOSE-AUTHORSHIP-COMMIT-ONLY` for every slice recorded only by its Goldfish commit
(a background Goldfish writes no dispatch record). The audit request carries `packs`, and `planFeatureCloseAudit` blocks with `FCA-POLICY-REQUIRED`
when it is empty ("do not invent a policy to complete closure"). The consumer has no organization policy, and no document, command or default tells
it where a valid pack comes from.

## Cause (read from the code)

`lib/feature-close-audit-preflight.mjs` requires one to 32 packs; `lib/organization-policy.mjs` (`resolveEffectiveOrganizationPolicy`) validates each against a
closed shape and the core version window (`OPP-CORE-VERSION`). There is no shipped core pack and no resolution step for a project without an
organization. The only minimal pack in the repository is a test fixture (`lib/feature-close-audit-test-fixture.mjs`).

## Open points to read before the fix

- The registration step for the Critic-bound Verify evidence and the commit order after `feature-close-prepared` (the package candidate must equal HEAD,
  so manifest and evidence stay uncommitted until the plan) are not written down for a consumer.

## PO tile (decision pending)

- A (recommended): ship a minimal core pack (a floor that adds no document class beyond the human decision ledger floors) and let the audit request name it by
  default, so a consumer without an organization closes on the audit route without inventing a policy.
- B: the PO supplies a pack per consumer through the existing policy workflow; the pipeline documents the route and the minimal shape.
- C: no change; a consumer with commit-only slices cannot close.
