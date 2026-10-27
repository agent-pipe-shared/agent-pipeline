# Held patch notes: reopen-design --dry-run (Phoenix slice b, c4)

Candidate 0378839c2d9f390a032bc8f301bf940252df4dc7. The `.patch` (git diff --binary of the scratch clone against the candidate) supersedes `w7-phoenix-reopen-design-dry-run.patch` and the c3 interim notes.
Targeted delivery: patch built; new cases RED then GREEN shown; `git apply --check` in clone2 and the guard-pin comparison were NOT re-run in this dispatch (budget) - see "Not done".

## Cause and content
- Baseline defect: the conformance fixture `tempRoot` creates a git repository without a commit; the submit-plan HEAD precheck (D165 slice 4) refuses with PLAN-SUBMIT-HEAD-UNAVAILABLE, so 7 existing cases were already red at the candidate.
  Fix at the source: `tempRoot` now makes one initial commit (`git add -A`, `commit --allow-empty --no-verify`); author is the repository-local config the helper already set. Fixture fix, nothing weakened.
- `plugins/pipeline-core/scripts/pipeline-state.mjs` (+36): `--dry-run` branch in `case "reopen-design"`: pure `reopenPlanDesign` on the observed state, no write, prints `pipeline.reopen-design-preview.v1`, exit 0.
- `plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs` (+3/-1): reopen-design admits length 3, or length 4 with `args[3] === "--dry-run"`; pin row in `lib/guard/devplan-shell-sanctioned-recovery.test.mjs` (+1).
- Conformance test file (+127): fixture commit plus 4 new cases (helpers `captureRun`, `sha256File`, `approvedFixture`); the c3 `commitFixture` helper was removed as redundant.
- `scripts/pipeline-state.test.mjs` is NOT in the patch.

## Justified test corrections (tied to AC-115 / the preview contract)
The real reopen does not delete `planApproval`; it sets `planApproved:false` and records `planInvalidation` (invalidatedApprovalSha256/invalidatedSubmissionSha256). The c3 draft asserted `!post.planApproval`, which misread the contract.
Now: voided-set case asserts `post.planInvalidation.invalidatedApprovalSha256 === preview.voids.planApprovalSha256` (and the submission hash); the no-plan case no longer hard-codes `wouldChange === false` (the fixture is authority-bound, so the real reopen does write a release invalidation) but asserts `preview.wouldChange` equals whether the real reopen changes the state file, plus the empty voids; the real-unchanged case asserts `planApproved === false` and a recorded `planInvalidation`. Intent (preview predicts the real reopen) is stronger, not weaker.

## RED / GREEN (whole-file runs of pipeline-state-observer-conformance.test.mjs; logs under scratch/agent-out/w7qu/, clones deleted only if cleanup ran)
- Baseline, pure candidate file in clone2 (log base4): exit 1, 7 failing existing cases: submit-plan, cancel-submitted-plan, approve-plan, reopen-design after approved plan, revoke-plan, set-phase, complete end-to-end lifecycle.
- Patched clone, first run (green4, before the assertion corrections): 15 pass, 3 fail (the three new cases corrected above); existing 7 green.
- Patched clone, final (green5): exit 0, `ℹ pass 18`, `ℹ fail 0` (14 existing + 4 new).
- RED: fixed test file copied into clone2 over unchanged production code (base5): exit 1, failing = the 3 flag-dependent new cases (previews an approved plan; voided set equals real reopen; no-plan empty preview). The 4th new case (real reopen without the flag unchanged) is a regression guard and passes on baseline by design. Existing 14 green there.
- Guard pin (devplan-shell-sanctioned-recovery.test.mjs): earlier c3 run showed 38 pass in the clone (log green3.*); not re-run here.

## Pre-existing, left alone
`pipeline-state.test.mjs` failures near lines 2218 and 2219 (untouched, file not in the patch).

## Protected-path classification
`lib/guard/sanctioned-args-scripts.mjs` is a guard file (protected baseline); the pin test sits under `lib/guard/`. None matched TP-1..TP-13.

## Not done
`git apply --check` of the final patch in clone2 (driver mode `check`), re-run of the guard pin test in both trees, clone cleanup (driver mode `cleanup`) if not listed above as run, independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

## Proposed commit message
`feat(state): add a dry-run preview to reopen-design and admit it in the sanctioned-args guard`

## Operator flow
Apply the diff, `git add -u -- <the four paths>`, commit with `--no-verify`, stamp, install.
