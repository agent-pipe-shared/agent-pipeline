# w8-fixtures-bind-an-approved-scoped-design-package (held patch, not applied)

Cause of red Verify steps found by the green-Verify pass: lifecycle fixtures were written before three gates existed, so six suites were red on the unpatched HEAD.

1. **D162 migration gate.** `test-design-bootstrap-verify-fixture.mjs` and `pipeline-state-calibration-recovery.test.mjs` built a legacy
   `deferred` architecture adoption, which readiness answers with `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`. Both now call
   `materializeArchitectureDesignFixture` (a real approved-scoped design package over the feature's own surface).
2. **Class 9 profile drift.** The governed profile is the byte content of `project/pipeline.json`. A configured verify command therefore moves it away from the approved
   adoption, and the next entry into implementation is blocked (`profile-drift`). The cases that re-enter after a configured write (A3 replay, KCR003, KCR009 after the interrupted
   write) bind the decision again, through the same fixture function, before the re-entry. The refusals those cases pin keep their own reasons.
   Open question for the product, not changed here: after `configure-verify` writes the calibration, any later planning-fitness evaluation reports `profile-drift` until the decision is bound again.
3. **Submission sources.** `submit-plan` binds the physical plan and spec bytes at a real Git candidate. `pipeline-state-approve-announce.test.mjs` and
   `plan-authority-staging-guard.test.mjs` now author and commit real plan and spec files; the staging case also injects the architecture readiness reader as ready (continuity is its subject).
4. **New inspect key.** `pipeline-state-inspect-continuity-drift.test.mjs` lists `publicHandoverDuty` among the unchanged inspect keys.

Evidence (clean clone of HEAD with the patch): design-bootstrap pin 7/7, calibration-recovery 11/11, approve-announce, staging guard 11/11, continuity-drift green.
Applies to the repository HEAD (`git apply --check`).
