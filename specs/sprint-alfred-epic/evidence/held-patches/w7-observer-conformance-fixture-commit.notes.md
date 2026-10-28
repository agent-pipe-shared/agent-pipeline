# Held patch: observer conformance fixture gets an initial commit

Model output; test-only. Dispatch W7-OBSERVER-CONFORMANCE-FIXTURE-COMMIT-C1-20261027, candidate e540a4f1c98cc095b6daf6eff0bcc70a6ea3709e.
Patch: `w7-observer-conformance-fixture-commit.patch` (1222 bytes, 1 file, +9 lines, 0 deleted).

## Cause (re-verified in the clone, matching the recon note)
`tempRoot()` in `plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs` runs `git init` and sets identity but never commits.
`submit-plan` now requires a resolvable HEAD and refuses `PLAN-SUBMIT-HEAD-UNAVAILABLE` (plus `fatal: ambiguous argument 'HEAD'`).
The injected `gitHead` dep is not what the verb consults for this refusal.

## Change (only `tempRoot`, after the calibration write, before `return root`)
- one justification comment line;
- `git add -A` in the fixture root (assert exit 0);
- `git -c user.name=PO -c user.email=po@test.invalid -c commit.gpgsign=false -c core.hooksPath=/dev/null commit -q --no-verify -m "fixture: initial commit"` (assert exit 0).
No assertion changed, skipped or deleted (QG-04). No second defect appeared.

## RED / GREEN
The existing 7 cases are the red cases; the fix is a fixture repair, so no new case was added (the whole-file cases are the criterion examiners).
- RED, clone at candidate (`node <file>`, exit 1): 14 tests, 7 fail: submit-plan verb; cancel-submitted-plan; approve-plan verb; reopen-design after approved plan; revoke-plan after approved plan; set-phase verb; complete end-to-end lifecycle.
- GREEN, patched clone (exit 0): `tests 14, pass 14, fail 0, cancelled 0, skipped 0`.
- clone2 baseline (unchanged, exit 1): identical 7 failing names.
- clone2 after `git apply` of the patch (exit 0): `tests 14, pass 14, fail 0`.
- Baseline vs patched failing-name sets: baseline = the 7 above (identical in clone and clone2), patched = empty. No pre-existing failure remains.
- Apply check: `git apply --check` in clone2 at the candidate, exit 0.
- `pipeline-state-phoenix-reopen-design.test.mjs` does not exist at the candidate (find returned nothing); not run.
Logs (untracked, scratch, deleted with the clones' directory is not required): `scratch/agent-out/w7oc/{red,green,base2,patched2}.log`.

## Protected-path classification
The test file matches none of TP-1..TP-13; edits in the clone were not refused.

## NOT done
Full Verify, batch Critic review and PO acceptance (parent-owned). Other baseline-red files from the recon are untouched.

## Proposed commit message
`test(pipeline-core): give the observer conformance fixture repository a commit`

## Operator flow
Apply the diff (`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-observer-conformance-fixture-commit.patch`), `git add -u -- plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs`, commit with `--no-verify` per the held-patch flow, then stamp and install.
