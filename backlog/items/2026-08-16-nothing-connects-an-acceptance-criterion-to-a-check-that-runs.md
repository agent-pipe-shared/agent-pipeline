---
schema: pipeline.backlog-item.v1
id: pipeline.nothing-connects-an-acceptance-criterion-to-a-check-that-runs
type: workflow-improvement
owner: pipeline
status: closed
closed_at: "2026-08-19"
closure_repository: self
closure_commit: 1b6e6a606ffcd6f32c3993b73be1110d3eb299af
closure_evidence: backlog/items/2026-08-16-nothing-connects-an-acceptance-criterion-to-a-check-that-runs.md
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

- **Decision:** accepted — deferred to a dedicated design round, not this AFK block.
- **Rationale:** self-scoped as "Direction, not a design"; the proposed shape (acceptance criteria carry check identifiers, verify registration derived from them, unregistered-but-named checks hard-fail) changes the plan gate and the Spec/PRD authoring contract — Design-phase work per MP-22 (interview/spec/readiness), not an execution-phase patch. The item itself says the consumer-project half matters more than the Pipeline's own, which argues for Spec-level design (how a hosted project's PRD/Spec template carries check identifiers) before any code changes, exactly as the compaction-point survey already flagged ("needs Spec/ADR work first").
- **Assignment (if accepted):** a future dedicated design session (Spec/ADR authorship on the check-identifier chain), likely paired with `docs/pending-verify-registrations.md`'s existing parking-lot mechanism and `2026-08-07-unregistered-suite-is-red-and-invisible-to-verify.md`. Not folded into the 0.5.5 candidate.
- **Date:** 2026-08-16

### Update, 2026-08-18 — named to a specific still-open Sprint, per the release bar

The existing Triage decision ("a future dedicated design session") did not
name a specific still-open planning window, which the 0.6.0 release bar
requires for an item to stay open without being resolved now. Naming it: this
item's scope (a plan-gate/Spec-authoring-contract change connecting acceptance
criteria to check identifiers) matches **Sprint Alfred**'s confirmed scope —
"Agent-first architecture, mechanical governance, measurable rigor, and
control integrity" (`docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17
amendment) — not Nightwing (product experience/onboarding) or Batman
(optional capabilities/adapters). No implementation attempted here; the
existing rationale (Design-phase work per MP-22, not an execution-phase
patch) stands unchanged.
- **Assignment (if accepted):** next available Alfred slot — Spec/ADR
  authorship on the check-identifier chain, as already scoped above.
- **Date:** 2026-08-18

### Closure, 2026-08-19

PO decision: close, final. PO's message: "das passiert automatisch vor dem
schließen von issues als finale prüfung und kann zu" (message was cut off
mid-sentence in the source turn — recorded verbatim rather than guessed at;
worth asking the PO if there was more to say here). For the record,
accurately: this item's own Triage describes accepted-but-deferred
Spec/ADR-weight design work (Sprint Alfred scope, 2026-08-18), not an
existing automatic pre-close check — closing per the PO's clear decision
regardless.
