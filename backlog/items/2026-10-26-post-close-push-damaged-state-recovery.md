---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.g33.post-close-push-continuity
type: bug
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "Greenfield Burg/AGY report §2 P1 (burg-agy.G33), intake 2026-10-25"
done_when: manual
---

# Already damaged closed/discarded States after a post-close push approval have no safe recovery

Related existing criterion: RV-7 (every refusal path has an explicit
recovery/handoff disposition), recovery level 1 of Spec §20.1 (intrinsic
known-shape repair, ADR-0082).

## Evidence

[Intake](../../specs/sprint-alfred-epic/plans/greenfield-burg-intake-2026-10-25.md)
and [prevention evidence](../../specs/sprint-alfred-epic/evidence/local-candidate-2026-10-25-followups/post-close-prevention/README.md).
Before commit `9ed1a2800`, `pipeline-state.mjs approve-push` (chat challenge and
final approval) wrote `updatedAt: approvedAt` on an inactive State. The
continuity predicates `validClosedTransitionState` and
`validDiscardedTransitionState` (`lib/onboarding-continuity.mjs`) demand that
`updatedAt` equal the last `closedAt` / `discardedAt`, so such a State is
classified damaged and `planOnboardingContinuityRepair` has no matching branch:
every later lifecycle step refuses with no named recovery. `9ed1a2800` prevents
new damage; States written before it stay stuck. The broad continuity suite
also reported 307/308 with one RED case (reported as OBC264,
`BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`) that has not been attributed.

## Acceptance

A State whose only defect is a push-approval-shaped `updatedAt` drift on an
otherwise fully valid closed or discarded boundary is diagnosed with a typed
code and repaired through the existing bounded continuity repair route (plan
binding diagnosis, immutable preimage and exact postimage; lock/CAS; complete
readback). The drift is accepted as repairable only when the State itself
proves it came from a push approval or challenge (for example the drifted
`updatedAt` equals the recorded approval or challenge timestamp); any other
drift, a malformed entry, or an active feature stays refused. The strict
transition validators stay unchanged. Other post-close audit writers that set
`updatedAt` on an inactive State are listed and either fixed the same way or
named. The broad continuity RED case is reproduced at the candidate and either
fixed or attributed with evidence.

Preserve meaningful negative controls and original evidence. Scheduled batch
Critic, final Verify/Security and PO acceptance remain separate.
