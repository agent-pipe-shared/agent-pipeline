---
schema: pipeline.backlog-item.v1
id: pipeline.no-design-to-implementation-handover-exists
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Greenfield onboarding handover from a parallel Claude session, 2026-08-08, finding 6 of 12. Located in code by that session."
---

# The lifecycle stops leading exactly where it should hand over

## Description

After kickoff promotion the State reads `phase: design`, `queueHead: review-work`
— and V4 inspection at `ready` returns `nextAction: null`. There is nothing to do
next, according to the thing whose job is to say what is next.

`set-phase --phase implementation` exists and works. No returned action ever
proposes it. So the transition from a designed feature to an implemented one is
knowledge an operator must already have; the lifecycle that guided every step up
to promotion simply stops at the handover.

## Why this is not merely a missing convenience

The design→implementation boundary is where the Pipeline's own model places its
most consequential handover: the point at which an approved plan becomes work,
and — per the operating model — the point at which dispatch to a Goldfish begins
rather than the orchestrator continuing to type. A lifecycle that goes quiet
exactly there does not just omit a hint; it removes the moment where the model's
own rules would have been consulted.

Observed consequence in the same session: the orchestrator implemented the
feature itself, with no dispatch, and nothing in the lifecycle marked that as a
transition at all
(`2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`, third
instance). The two findings are separate defects with one shared surface.

## Triggering situation

Greenfield onboarding of a `feature`-profile project with the Claude runner,
2026-08-07/08, against the local `0.5.3+claude.20260807221336.14e7b97` build.

**Not independently reproduced in this repository.** The State shape above comes
from that session's readback and should be re-observed before designing.

## Affected artifact

The V4 inspection / `nextAction` computation in
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` and the phase model it
reads, against `plugins/pipeline-core/scripts/pipeline-state.mjs`'s `set-phase`.

## Proposal

Not designed here. What has to be decided:

1. **What legitimately unblocks the transition?** An approved plan is the
   obvious precondition — which is currently unreachable
   (`2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md`). These two
   items should be designed together: a handover proposed before approval would
   be worse than none.
2. **Is the action a proposal or a gate?** Proposing `set-phase` keeps the
   operator in control; refusing implementation work while the phase is still
   `design` would make the boundary real. The second is stronger and needs a PO
   call, because it changes what a session may do without asking.
3. **`nextAction: null` at `ready` deserves scrutiny of its own.** Whatever the
   answer above, a lifecycle that reports readiness and no next step is
   indistinguishable from a lifecycle that has finished. If null is ever
   legitimate there, it should say why.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Question 1 (what legitimately unblocks the transition) is
  now unblocked by the separate 2026-08-11 PO decision on
  `2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md` (the plan
  gate's own contradiction is resolved there — content-coherence between
  PRD and Spec, not a path-equality check). Question 2 (proposal vs. gate)
  leans toward "proposal, not a hard refusal" given the same 2026-08-11
  enforcement-mechanism decision on
  `2026-08-07-mp22-orchestrator-self-implementation-has-no-enforcement.md`
  (decline new blocking mechanisms, attack the cause instead) — but this
  was not asked or answered directly and stays a lean, not a confirmed
  decision. Question 3 (`nextAction: null` at `ready` deserving scrutiny)
  not addressed.
- **Rationale:** Cross-referencing two separate PO decisions from the same
  2026-08-11 batch rather than a direct answer to this item's own three
  questions — this item was not itself one of the 8 presented clusters,
  its Q1 dependency and Q2's directional lean are inferred consequences of
  the other two.
- **Assignment (if accepted):** Unassigned. Once the plan-gate fix
  (`2026-08-07-a-promoted-feature-can-never-pass-the-plan-gate.md`) lands,
  revisit whether `set-phase --phase implementation` should be proposed by
  the V4 inspection's `nextAction`, per Q2's lean above — needs an explicit
  PO confirmation before building, not just an inference from an adjacent
  decision.
- **Date:** 2026-08-11
