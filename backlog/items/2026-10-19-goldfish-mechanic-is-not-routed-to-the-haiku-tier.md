---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-mechanic-is-not-routed-to-the-haiku-tier
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "Elephant decision E7 (2026-10-19, under PO decision D26): point (e) MECH-HAIKU of opus-critic-only-batched-for-architecture-and-security leaves 0.7.0"
sprint: none
done_when: manual
---

# Goldfish mechanic is not routed to the Haiku tier

## Description

The `opus-critic-only-batched-for-architecture-and-security` triage proposed moving the
`goldfish-mechanic` agent to the Haiku tier at effort medium (MECH-HAIKU). That is a
model-routing change, not a fix. A frontmatter-only change turns the routing projection
check red. Elephant decision E7 moved the point out of 0.7.0.

## Proposal

Change the routing authority and the runner mappings together: `routing-authority.json`,
`runner-mappings.json` (which has no `haiku` alias yet), `check-routing-projections.mjs` and
its fixtures (RP04, p3b runner conformance, runner-profile migration v2/v3, project
onboarding v3, the runner-contracts schema tests). Check the MP-03 weakest-tier wording in
`policies/model-policy.md`.

## Acceptance

- `goldfish-mechanic` resolves to the Haiku tier at effort medium on every runner that
  supports it, with a typed fallback where the runner has no such tier.
- The routing projection check and every listed fixture family are green with a counted
  result.
