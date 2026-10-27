# W7 held patch: end-to-end brownfield entry regression (test-only)

Slice W7-BROWNFIELD-E2E-REGRESSION-C1-20261027, candidate 400c6213db04d4abf1c93335b59d68a9a2e7d086. Item pipeline.brownfield-architecture-gate-never-passes (AC-127 binding only). PO decision 2026-10-27: delivered WITHOUT the D4 precheck (held d165-s4 patch stays a separate follow-up).

## Cause
Remainder 2 of the recon: no end-to-end brownfield reproduction existed. D1 (class 10 unavailable is report-only) and S3 (class 9 scope union) were fixed but never pinned together through readiness plus the guard verdict.

## Changed lines
Only plugins/pipeline-core/lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs: section (f) appended (about 55 lines: one import of withClass9RequiredScope/CLASS9_REQUIRED_SCOPE, helpers e2eFitness/e2eReadiness/e2eGuard, two new cases). No production edit.

## New cases
1. approved-scoped adoption with class 9 scope union, real map present, class 10 unavailable: readiness `ready`, map current, class 10 report-only, guard `architectureFitnessAuthorityVerdict` returns null.
2. class 9 inputs missing from scope, class 9 finding: readiness blocked ARCHITECTURE-FITNESS-NOT-READY, guard exit 2 GUARD-ARCHITECTURE-FITNESS-NON-GREEN.
Case (b) docs/adr missing is OMITTED: its outcome depends on whether the D179 held patch is applied.

## RED / GREEN
Test-only against already-fixed production code: no RED was possible; both new cases are GREEN on first run (no real finding). Patched whole file: tests 16, pass 16, fail 0 (exit 0). Baseline (clone2, unchanged): tests 14, pass 14, fail 0. Failing-name sets: both empty, identical. Apply check at candidate in clone2: exit 0.

## Not done / limitations (deviations, stated honestly)
- No temp-directory brownfield fixture: the real repository root supplies the map and docs/adr; adoption disposition, fitness outcomes, checkpoint debt and decisions are injected via the deps seams (existing pattern of this file). Not a signed-adoption end-to-end run and not a real `measure` run.
- Case (c) pins that a class 9 finding is not downgraded; it does not run the real class 9 evaluator against a scope lacking the inputs (class 9 scope union is only applied in the prepare step, `withClass9RequiredScope`).
- D4 precheck, case (b), native-host qualification: not done. Do not assert stage 75.

## Proposed commit message
test(guard): pin the end-to-end brownfield entry path with class 10 unavailable and class 9 scope present

## Operator flow
Apply the diff (git apply), `git add -u` limited to the test path, commit with --no-verify, stamp, install.

## Protected-path classification
The test file matches none of TP-1..TP-13; ordinarily editable, edited only in the scratch clone. The patch and notes are under specs/ (draft-exempt).

## Review
An independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
