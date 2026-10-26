# D165 S8 - pipeline-state suite fixture (PARTIAL patch, suite still red)

Status: the patch `d165-s8-state-suite-fixture.patch` is a verified PARTIAL fixture. It moves the suite strictly further (from the fixture's own abort at the first call, line 2192 region, to the assertion at pipeline-state.test.mjs:2218 in the "phase-calibration neutral-only" case) but the suite is NOT green. Do not apply it as a completed fix; a design decision is needed first (see the continuation card). Test-only: the patch touches only plugins/pipeline-core/scripts/pipeline-state.test.mjs.

## Cause
`prepareCalibrationArchitectureFixture` applied a `deferred` adoption over a copy of this repository's `architecture/` tree. Since D162 S3 `lib/architecture-entry-readiness.mjs` (line 334) answers a deferred adoption with `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`; approved-scoped over the copied tree fails fitness (`ARCHITECTURE-FITNESS-NOT-READY`).

## Fixture lines changed (in the patch)
1. `prepareCalibrationArchitectureFixture(root, calibrationBytes = null)` now calls the sanctioned test-only `materializeArchitectureDesignFixture({ rootDir, planPath: "specs/unit/prd_unit.md", sourcePath: "src/change.mjs", decisionRef: "TEST-K156", by: "Synthetic fixture PO" })` (lib/architecture-design-test-fixture.mjs: measured map, fitness model, baseline, `docs/adr/`, real approved-scoped chat adoption; the other suites' ready fixture) instead of copying `architecture/`, AGENTS.md and applying a deferred adoption. The `readiness ready` assertion stays.
2. When `calibrationBytes` is given, project/pipeline.json is written BEFORE the materialization, because the adopted profile binds project/pipeline.json: a calibration committed after the adoption is `profile-drift` (fitness `profile-drift`, module identity, `profileSha256 differs from the accepted authority snapshot`) and set-phase then aborts with ARCHITECTURE-FITNESS-NOT-READY (measured at 2204 before this step).
3. The phase-calibration loop passes the baseline bytes as `calibrationBytes` for layouts with a neutral calibration.
4. Import `applyAdoptionDecision` replaced by `materializeArchitectureDesignFixture`.

## Preimage SHA-256 of pipeline-state.test.mjs
- At HEAD f8184482f: 802e354b0052b8b6b1e35b54b13d2a838f7eb8fe9e73b2af92af062cace0685e
- After S1-S4: 7c683ca3e36879f508a8b4ca6f1bf7a23f525ddb715f70f91a21af47d088e68c
- After this partial patch: bbeb85a7c47ff503965b77fdcb7b0ebaa6b956d7dc24af711d06a07474d7a051

## Suite result
- Before (HEAD+S1-S4): abort ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED inside the fixture at the first call.
- After the partial patch: exit 1 at pipeline-state.test.mjs:2218, `neutral-only must not invent an effective decision for the unowned planned path` (assert.deepEqual(decisionSummary.areas, [])). The earlier 2204 set-phase success assertion now passes. The suite has no counts (sequential script).

## Reading of the remaining failure (not fixed)
The case asserts that the planned path `src/change.mjs` is UNOWNED (areas `[]`, unresolvedPaths `["src/change.mjs"]`). Under an enforced approved-scoped adoption with a measured map, the fixture's module owns `src/**` (the materializer is hardcoded to module `application`, ownedPaths `src/**`), so the path resolves to area `application` and unresolvedPaths is empty. An unowned planned path under an enforced adoption is itself a fitness finding (module-identity-ownership), so the old assertion cannot hold with a ready enforced fixture. This looks like a changed intended behaviour (the case's premise belongs to the deferred era), not stale fixture input alone; I did not weaken the assertion. Needs a decision: either the case's expectation changes to the owned-path result (areas `[application]`, unresolvedPaths `[]`) as a deliberate spec-bound update, or the case gets a map that leaves the planned path outside any module while fitness stays non-blocking (not possible with the shared materializer without a production-side helper change, out of scope here). Later sequential cases (legacy-only, matching-dual, the final refused case and everything after line 2218) were not reached.

## push-init.test.mjs measurement (earlier run, stacked clone; not fixed)
32 tests, 23 pass, 9 fail, all `drivePushInit:` cases, common visible cause: critic-bound-verify check fails CBV-ROOT in fixture roots (cases: chains all three steps; signature preparation; WSL EPERM reconciliation; layer 1b skipped; signature-required without driver-executable action; dirty working tree; stale verify evidence; machine-plane anchor; explicit candidate distinct from record-ref). Not re-measured in this run.

## Apply check
Fresh clone of HEAD with S1-S4 applied first: `git apply --check` exit 0.

## Proposed commit message (once complete)
`test(state): align the calibration architecture fixture with the adoption migration rule`

## Operator flow (once complete)
Apply after S1-S4 in the same install run: apply-diff, `git add -u`, `--no-verify` commit, stamp, install. The change is test-only.

## CONTINUATION CARD
done: fixture reaches ready via materializeArchitectureDesignFixture; calibration-before-adoption ordering found (profile drift); 2204 passes; apply-check ok; partial patch written.
remaining: decide the neutral-only/legacy-only/matching-dual expectation at :2218 (owned vs unowned planned path under enforced adoption); then run the rest of the suite for further failures; re-write the patch; push-init CBV-ROOT slice separate.
next step: with the decision, change :2216-2219 expectations (areas/unresolvedPaths) as an explicit spec-bound update, re-run through scratch/agent-out/w8c/driver.mjs (setup, apply the partial patch to the clone, state), continue sequentially.
