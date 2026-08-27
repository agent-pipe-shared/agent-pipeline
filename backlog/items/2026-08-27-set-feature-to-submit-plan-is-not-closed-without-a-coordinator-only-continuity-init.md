---
schema: pipeline.backlog-item.v1
id: pipeline.set-feature-to-submit-plan-is-not-closed-without-a-coordinator-only-continuity-init
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: alfred
source: "Second measured occurrence, 2026-08-27, in the Alfred clone (submit-plan refused with PLAN-SUBMIT-CONTINUITY-INVALID after a clean set-feature). First occurrence documented in specs/sprint-phoenix-epic/RECOVERY.md (2026-07, 'second integration gap')."
---

# The sanctioned `set-feature` → `submit-plan` path is not closed: it silently requires a coordinator-only `continuity-init` in between

## What was measured

On a clean, `ready` design-phase state produced by the sanctioned epic
switch (`discard-feature` then `set-feature`, PO-released), the state's own
`nextAction` says "Review the PRD and specification, then submit the plan"
— but `submit-plan` refuses with `PLAN-SUBMIT-CONTINUITY-INVALID`, because
`set-feature` creates the active feature without any `continuity` object
and `submitPlanTransition` (`plugins/pipeline-core/lib/plan-spec-state-v2.mjs:524-527`)
hard-requires a valid one. The route out is `continuity-init` — documented
as a **coordinator-only** transition (`pipeline-state.mjs` doc block) with a
closed `pipeline.continuity.v0` request envelope, a lock token, and
`--expected-revision absent` — which no user-facing `nextAction`, error
text, or document names.

This is the **second** measured occurrence: Phoenix hit it on 2026-07-26
(`specs/sprint-phoenix-epic/RECOVERY.md:206-231` — "the legacy `set-feature`
writer creates the new active feature, while the normal two-step workflow
still requires a separate `continuity-init` request"), resolved then under
narrow PO authority. The gap survived unchanged into 0.6.0.

## The defect, precisely

A sanctioned lifecycle verb terminates in a state whose own advertised next
step is refused, and the bridging verb is (a) undocumented at the refusal
site, (b) labelled coordinator-only, and (c) requires hand-building a
closed continuity object whose validation rules live in
`lib/continuity-state.mjs` internals. Same closed-under-its-own-verbs
failure family as
`2026-08-27-discard-feature-writes-a-state-the-cleanup-observer-rejects-and-strands-the-session.md`,
different consumer (submit-plan instead of the readiness observers).

## Affected artifacts

- `plugins/pipeline-core/scripts/pipeline-state.mjs` (`set-feature` writes
  no continuity; `continuity-init` is the undocumented prerequisite)
- `plugins/pipeline-core/lib/plan-spec-state-v2.mjs` (`submitPlanTransition`
  requires valid continuity; typed code names the symptom, not the route)

## Proposal (not designed here)

Candidates, first is the direct fix: (1) `set-feature` writes the
revision-0 design-shape continuity itself (featureId, authority bound to
the plan path's current bytes or explicitly deferred, `nextAction:
"review"`, clean queue) — the shape is fully determined by its inputs;
(2) alternatively `submit-plan`'s refusal returns a typed
`retryAction` that emits a ready-to-use `continuity-init` request for the
current state; (3) the A5(ii) writer/observer conformance suite
(sprint-alfred spec §4.5) gains a consumer leg: every sanctioned verb's
output state must also be accepted by the next verb its own `nextAction`
advertises.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
