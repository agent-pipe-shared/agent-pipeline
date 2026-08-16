---
schema: pipeline.backlog-item.v1
id: pipeline.nothing-connects-an-acceptance-criterion-to-a-check-that-runs
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
source: "PO, 2026-08-16: 'Wichtiger ist aber, dass die pipeline auch im user projekt dafür sorgt das die richtigen tests entstehen und sie anwendet.' Raised while discussing why a hosted project's verify gate can be satisfied without checking anything."
---

# Nothing connects an acceptance criterion to a check that actually runs

## The PO's point, and one correction to its premise

The observation: the Pipeline enforces *that* a gate runs, never that the gate
*checks anything*. A project configured with a verify command of `true` passes
forever, and nothing notices.

One part of the premise needs correcting, measured rather than assumed: **the
seeded default is not empty, and it does not pass.** Since `674b1c0c`,
onboarding seeds a verify placeholder that FAILS and names
`project/pipeline.json` as the value to replace — deliberately, because a
placeholder that passes is indistinguishable from a satisfied contract. The gap
is therefore not the seeded default. It is that "replace this value" does not
help anyone author the real thing, and nothing checks what they replace it with.

## The chain, and which link is enforced

    acceptance criterion → a named check → registered in the project's verify → actually executed

Only the last link is enforced today. The first three are convention.

## This repository proved the break first-hand

Two suites were written and never registered. Three verify runs reported green
while neither suite ran. Only a Critic caught it.
`docs/pending-verify-registrations.md` exists as the standing parking lot for
exactly that failure, and
`2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md` is already
filed against one instance. That the Pipeline's own repository — which has a
Critic in the loop — needed a Critic to catch it is the argument for closing
the chain rather than relying on review.

## Direction, not a design

Not designed here. The shape worth exploring: acceptance criteria carry check
identifiers; the plan gate refuses a criterion with no named check; verify
registration is derived from those identifiers rather than hand-maintained; and
a named-but-unregistered check is a hard failure rather than an invisible file.

The consumer-project half matters more than the Pipeline's own. This repository
has an independent Critic catching unregistered work; a hosted project has the
seeded placeholder and nothing else.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
