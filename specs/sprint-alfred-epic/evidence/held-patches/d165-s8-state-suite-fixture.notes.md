# D165 S8 - pipeline-state suite fixture (BLOCKED, no patch produced)

Status: blocked at the second fixture failure; no `.patch` was written (a partial fixture edit would leave the suite red).

## Cause
`prepareCalibrationArchitectureFixture` (pipeline-state.test.mjs, line 47 region; call at line 2192 on top of S1-S4) applies a `deferred` adoption. Since D162 S3, `lib/architecture-entry-readiness.mjs` (line 334) answers a deferred adoption with `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`. `architecture-adoption.mjs` also retires new `deferred` creation on its CLI (line 552).

## Attempted fix (drift-class, in the scratch clone only)
1. `decision: "deferred"` -> `"approved-scoped"` (the fixture line 51-52; rationale text adjusted). Result: the abort moves to `ARCHITECTURE-FITNESS-NOT-READY`. Reason: the fixture copies this repository's whole `architecture/` tree into a tiny fixture repo; under an enforced (non-deferred) adoption, fitness is blocking and finds `src/change.mjs` outside any module plus 157 missing contracts of this repo's modules.
2. Probe (scratch/agent-out/w8/probe.mjs, same steps as the fixture): replacing the `cpSync(architecture)` with the sanctioned `applyArchitectureMeasure(root)` (scripts/architecture-measure.mjs, D162 S1; measures the fixture repo itself: modules specs, src, root) clears fitness. Result: the next block is `ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED`, area `src`, `ARCH-CONTINUITY-SOURCE-UNRESOLVED` (lib/architecture-decision-continuity.mjs line 18-27: `local` or `inherited` decision source is blocked/absent in the fixture repo).

## Reading (stop reason)
Under an enforced adoption the fixture now needs a resolvable architecture decision source (local and/or inherited continuity) for area `src`, which a bare fixture repo does not have. That is a changed intended behaviour (enforced entry propagates decision applicability; deferral used to keep it observable only, readiness.mjs lines 406-417), not stale input alone. I did not hand-write decision or map files. Not determined: which sanctioned producer (local decision source, inherited/org policy source, or a waiver) satisfies `composeArchitectureDecisionContinuity` for a fixture; that needs a read of the decision-source loaders feeding `inspectPlanningDecisionApplicability`.

## Suite result
- Before (at HEAD+S1-S4): abort `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED` at fixture line 59, call at 2192.
- After my attempted edit: abort `ARCHITECTURE-FITNESS-NOT-READY` (same line 59). Tests run/passed counts: the suite is a sequential script without counts; no case after 2192 ran.
- Preimage SHA-256 of pipeline-state.test.mjs after S1-S4 applied: 7c683ca3e36879f508a8b4ca6f1bf7a23f525ddb715f70f91a21af47d088e68c (HEAD preimage not separately measured).

## push-init.test.mjs measurement (stacked clone, exit 1; 32 tests, 23 pass, 9 fail; not fixed)
Failing cases (all `drivePushInit:`):
1. chains all three steps (reconciliation, gate-satisfiability, push-prepare) in one call, reaches signature-required
2. signature preparation keeps the existing signature-required output
3. reconciliation accepts WSL EPERM only after status zero, while non-zero and status-less results stop fail-closed (push-init.test.mjs:540; outcome precondition-unmet, check critic-bound-verify `CBV-ROOT` "candidate qualification unavailable")
4. layer 1b is skipped, not failed, when the project has no harness/scripts/check-doc-reconciliation.mjs (:591, same CBV-ROOT)
5. the signature-required outcome never carries a driver-executable action, for the real authorize-critical command (:656)
6. dirty working tree stops at push-prepare's own check, named, even though gate-satisfiability does not check it (:691)
7. stale verify evidence is reported by the cheap preflight while push-prepare still collects its independent checks (extra blocker critic-bound-verify CBV-ROOT)
8. an onboarding-set machine-plane anchor resolves the key directory without disclosing it in the signature instructions
9. real repo -- an explicit candidate distinct from the record-ref lets layer 1b actually pass (NVA-B-PUSHINIT-1 regression)
Common visible cause: the new `critic-bound-verify` check fails with CBV-ROOT in the fixture roots (raw output in the scratch clone, deleted; reproduce with the driver).

## Proposed commit message (once complete)
`test(state): align the calibration architecture fixture with the adoption migration rule`

## Operator flow (once a patch exists)
Apply after S1-S4 in the same install run: apply-diff, `git add -u`, `--no-verify` commit, stamp, install. The change is test-only (pipeline-state.test.mjs).

## CONTINUATION CARD
done: cause identified; two fixture failures measured; sanctioned measure route clears fitness; push-init list captured.
remaining: satisfy decision continuity for area `src` in the fixture via a sanctioned source; run suite to the end; write patch; apply-check in fresh clone.
next step: read the loaders behind `inspectPlanningDecisionApplicability` (architecture-entry-readiness.mjs ~line 404) to find the sanctioned local decision source; then edit the fixture to call `applyArchitectureMeasure(root)` instead of copying `architecture/`, with `approved-scoped`.
