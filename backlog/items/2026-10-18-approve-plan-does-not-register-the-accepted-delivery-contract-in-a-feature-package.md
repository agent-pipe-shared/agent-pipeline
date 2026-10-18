---
schema: pipeline.backlog-item.v1
id: pipeline.approve-plan-does-not-register-the-accepted-delivery-contract-in-a-feature-package
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (PF-25)"
sprint: none
done_when: manual
---

# approve-plan does not register the accepted delivery contract in a feature package

## Description

`approve-plan` writes the accepted delivery contract envelope and names
`specs/<feature>/lifecycle.json` as its manifest, but it never creates that manifest. The
course writer resolves the envelope only through a validated manifest, so the first item
dispatch of every consumer with plan approval v9 is refused with `CAC-REGISTRATION-INVALID`.
This repository's own manifests were registered by hand, and the test fixtures write one by
hand, so no test saw it.

The 0.7.0 candidate ships a separate registration command
(`scripts/register-feature-package.mjs`) as the repair route (PO decision D14). This item
covers the durable step: `approve-plan` calls the same registration function, so no
consumer needs the extra command.

## Triggering situation

The first item-governed Goldfish dispatch after `set-phase implementation` in a consumer
project.

## Proposal

Call the registration function from `approve-plan` in `scripts/pipeline-state.mjs`. That
file is protected baseline, so the change goes through a signed quality package.
`guard-dispatch` should also print the repair route for a `CAC-*` course refusal instead of
the generic admission text (protected hook).

## Acceptance

- A real-chain test from `submit-plan` to the first item host commit passes without the
  separate registration command.
- A `CAC-*` course refusal in guard-dispatch names its repair command.
