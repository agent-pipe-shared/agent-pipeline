---
schema: pipeline.backlog-item.v1
id: pipeline.design-phase-prd-and-spec-are-frozen-by-their-own-continuity-binding
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: alfred
source: "Measured live 2026-08-28 in the Alfred clone, applying the PO's own PRD-gate decisions to the PRD and Spec the gate is about."
---

# A design-phase PRD and Spec are frozen by their own continuity binding, and the release route the refusal names is a no-op in exactly that state

## What was measured

The PO answered the PRD's open decisions at the design gate. Applying those
answers to `specs/sprint-alfred-epic/spec.md` was refused:

```
BLOCKED (guard-lifecycle-ready, plugin pipeline-core):
GUARD-LIFECYCLE-AUTHORITY-BOUND: this file is the currently bound authority
document (the promoted PRD, its Spec, or its design input) and must not be
edited directly while it is bound.
```

The refusal names its own remedy: *"run `reopen-design --by <name>` to release
the binding, make the edit, then rebind with `submit-plan` and
`approve-plan`."* Run in this state, that command answers:

```
Design is already open; zero-write replay accepted.
```

It changes nothing, and the next edit attempt is refused identically.

## The mechanism, line by line

- The guard's write-time check (`hooks/guard-lifecycle-ready.mjs`,
  `boundAuthorityDocumentPath`) matches the write target against
  `continuity.authority.prd.path` / `.spec.path` **by path**, and releases —
  fails open — only when `state.planInvalidation` is a non-null object.
- `planInvalidation` has exactly one writer: `reopenPlanDesign`
  (`lib/plan-spec-state-v2.mjs`). It reaches that write only on the branch
  that requires a valid `state.planSubmission`.
- A design phase that has never submitted a plan has no `planSubmission`, so
  `reopenPlanDesign` takes its replay branch (`phase === "design" &&
  planApproved !== true`) and returns zero-write.
- Continuity, however, must already exist and must already bind PRD and Spec
  before the first `submit-plan` — `submitPlanTransition` refuses with
  `PLAN-SUBMIT-CONTINUITY-INVALID` otherwise (a separate item filed
  2026-08-27 covers that `set-feature` leaves no continuity behind).

So the window between "continuity exists" and "a plan has been submitted" is
a state in which the design documents are frozen to every agent-side Edit or
Write, with no agent-executable release. That window is precisely where a PO
gate lives: the gate's purpose is to elicit answers that change the
documents.

## Why this is not merely inconvenient

The guard is right to exist — it closes the entrance to the non-liftable
`continuity-observation-unavailable` readiness class rather than detecting
the fall afterwards. The defect is the missing release, not the refusal. Two
consequences:

1. **The refusal text is wrong for this state.** It names a route that is a
   documented no-op here, so a session that trusts it loses a cycle before
   discovering the route did nothing. Nothing in the message distinguishes
   "reopen releases the binding" from "reopen is inert because there is no
   submission to invalidate".
2. **The only way through is to submit a plan the PO has not yet approved**,
   reopen it (now effective, because a submission exists), edit, and submit
   again. That works — `approveSubmittedPlan` explicitly tolerates a retained
   invalidation as "the sanctioned reopen -> submit -> approve recovery
   path" — but it means the first submission exists only to unlock editing,
   which is not what a submission means.

## The workaround used on 2026-08-28

`po-authority-acknowledge-*` (PO, attended) -> `submit-plan` ->
`reopen-design` (now writes `planInvalidation`) -> apply the PO's decisions
-> `submit-plan` -> `approve-plan`. Documented here so the next session does
not re-derive it under time pressure.

## Proposal (not designed here)

Either admit a zero-submission release — `reopen-design` in a never-submitted
design phase writes a truthful invalidation-equivalent marker that the guard
honours, without manufacturing a submission digest that does not exist — or
make the binding itself conditional: continuity created for a design phase
binds PRD/Spec paths for *observation* but does not arm the write refusal
until the first submission. Whichever direction, the refusal message must
name the route that actually applies to the state it fired in. Fits Track A
(A4 design-authority sealing / A5 lifecycle evidence closure) and is
adjacent to the writer/observer conformance suite A5(ii) already plans: this
is the same class — a sanctioned verb whose output state one consumer does
not accept.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
