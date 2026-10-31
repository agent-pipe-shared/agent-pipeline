---
schema: pipeline.backlog-item.v1
id: pipeline.automate-critic-course-and-gate-registrations
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-31
priority: P1
release: 0.7.1
sprint: alfred
source: "PO decision D223 (2026-10-31) after the Glossover Critic-course loops: every refusal names the next command, but a human or agent still has to run it at every round"
done_when: manual
---

# Automate the Critic-course and gate registrations a consumer repeats at every round

## Problem

The system tells the consumer repo what to register next, but does not do it. A consumer therefore loops: a round
finishes, the next step is only printed (`session-critic-finalizer.mjs` prints "register the lineage of this round NOW,
before the next correction commit"), a correction commit follows, and the only way back is the takeover recovery
(`inspect-course-takeover`, `supersede-course-takeover`, rerun of round 1). The same pattern repeats for the delta
request inputs, the per-record Critic addendum at feature close, and the derived files (inventory, Reader inputs,
backlog ledger) that a change leaves stale.

## Decision (D223)

Automate what is deterministic, keep judgments human, never commit or stage on the agent's behalf.

## Slices

Each slice is accepted by a chain run with the real commands over several rounds up to feature close, with findings and
without. A unit test of one function does not satisfy the acceptance.

1. **Lineage and guard.** The Critic finalizer writes the review lineage (schema v2) when a round finishes. A guard
   refuses a correction commit while the last round's lineage is missing, with the exact repair. The takeover recovery
   is then only reachable for history created before this change.
2. **Addendum in the close coordinator.** `close-coordinator` writes the byte-bound `pipeline.critic-disposition-addendum.v1`
   per uncovered record when exactly one passed, consumed receipt or one registered course covers it. Any ambiguity keeps
   today's refusal and its command.
3. **Preflight derivation.** `critic-dispatch-preflight.mjs` derives the correction-input bindings
   (`critic-correction-input-bindings.mjs derive`) and the registration commit itself instead of requiring both as
   arguments.
4. **Derived files in one step.** One command refreshes the inventory rebaseline, the Reader-input sync and the backlog
   ledger and shows the result as a diff; it repairs, it does not replace the checks that read them.

Delta request: only a path skeleton (changed paths, empty invariant map) is prepared. `changedBehaviorClaims`,
`coordinatorImpactConfirmed`, `trustBoundaryChanged` and `impactAmbiguous` stay a Coordinator judgment.

## Out of scope

The PO's residual acceptance (`approve-residual-acceptance`), stamping, installation, push approval and handover
rotation are decisions or gates and stay human steps. gitleaks fingerprints for new findings stay a review decision.
