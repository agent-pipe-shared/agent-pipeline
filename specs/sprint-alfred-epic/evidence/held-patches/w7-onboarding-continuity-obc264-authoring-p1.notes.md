# P1: OBC264 expected a bindable unauthored scaffold for the feature and epic profiles

State: HELD PATCH, test only, independent of every other held patch (one hunk in `onboarding-continuity.test.mjs`, case `OBC264`). Nothing applied, reviewed or accepted. Written and measured by the Elephant.

## Cause
Commit `5e939278b` (the same commit that made `submit-plan` compare physical bytes, see the PS06a0 finding in the verify document) added `stagingDesignNeedsAuthoring` to `buildCoordinatorSourcedPromotionPlan` in `plugins/pipeline-core/lib/onboarding-continuity.mjs`: a generated scaffold PRD and Spec cannot be bound before the design is authored (`BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`). The case `OBC264 planOnboardingBootstrapBind: mechanical markers stay mandatory while feature and epic defer acknowledgement` was not updated: for the profiles `feature` and `epic` it still planned the bind on the unmodified scaffold and so failed on the baseline (323 of 324 tests). It is not an environment effect and not a production defect; the refusal is the intended gate.

The backlog entry `pipeline.host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear` names a different red case, "K1D session-cleanup-binding"; that case is not red on the baseline (the only red case of this file is OBC264), so that part of the entry is stale.

## Change
For `feature` and `epic` the case now (1) pins the refusal on the unmodified scaffold, (2) authors the Spec and PRD with the same content and the same mechanical marker writer the positive bind fixtures use (`planOnboardingIntakeSpecMarker` / `applyOnboardingIntakeSpecMarker`), (3) keeps the original assertions (plan builds, `planApproved` false, no acknowledgement required for these profiles), and (4) removes the Spec marker from the authored PRD and expects `KICKOFF-PROMOTION-PRD-SPEC-MARKER-MISSING`, so the case still proves that the mechanical markers stay mandatory. The `mini` branch is unchanged. No assertion was weakened; one refusal pin and one marker-present assertion were added.

## Evidence (fresh clone of HEAD, `verify-held-patch.mjs`)
- Apply check: exit 0.
- `onboarding-continuity.test.mjs`: baseline exit 1 (323 of 324, OBC264 red with `BOOTSTRAP-BIND-DESIGN-AUTHORING-REQUIRED`); patched 324 tests, 324 pass, 0 fail.
- `check-verify-case-completion.test.mjs`: 32 of 32 before and after (no pin number moved).

## NOT done
No Full Verify, no Critic review, no native run.

## Proposed commit message
test(onboarding): author the design before binding in the feature and epic marker case (OBC264)

## Operator flow
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-onboarding-continuity-obc264-authoring-p1.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-obc264.txt`.
