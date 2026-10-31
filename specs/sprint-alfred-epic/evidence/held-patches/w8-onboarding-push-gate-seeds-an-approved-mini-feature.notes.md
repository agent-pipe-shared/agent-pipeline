# w8-onboarding-push-gate-seeds-an-approved-mini-feature (held patch, not applied)

Cause of two red cases in `lib/project-onboarding-v3.test.mjs` ("the seeded push gate ..." and SECGATE-1): since D220 a push of the seeded onboarding repository is reviewed strictly, and the
fixtures pushed a tree whose publication review was no longer waived. The waiver (`requiresPublicationReview`, REVIEW-LOW-RIGOR) holds for an approved mini plan whose State is tracked in the
pushed tree; the fixtures had no plan at all.

PO decision (2026-10-31, D214-C): seed an approved mini feature instead of making the fixtures Critic-bound. This deviates from the "Critic-bound" wording of D220 on purpose and only in the test
fixtures; the production push review stays strict.

Change: helper `seedApprovedMiniFeature(path)` writes `specs/seeded-feature/{prd,spec}.md` and a tracked `project/pipeline-state.json` (active feature, plan submission with profile mini, plan approval
with the PO gate authority) and is called after `commit("push threat model")` in both cases. Only `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` changes.

Evidence (clean clone): the onboarding suite runs 240 cases, 0 shards failed. Applies after the round-2 rebaseline commit. Whether every Verify step is green is only established by a Full Verify.
