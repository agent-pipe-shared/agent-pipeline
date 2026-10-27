# D177 held patch (PARTIAL): admission cost vs settled history

Status: targeted delivery BLOCKED (budget). Items (1) and (2) implemented; items (3) and (4) NOT done; tests (a), (b), (d), (e) NOT written; no RED run, no baseline-vs-patched sweep of neighbouring suites.

## Cause
Within one admission, `readNativeIntegratedSlices` / `readSettledItemSliceIds` are recomputed several times (native-goldfish-host-state.mjs: dependency check, settled set, readNativeReservedItemScopes, nativeConcurrentPlan, agy-session-dispatch line 118), each doing one git-reading proof per integrated row.

## Changed lines (plugins/pipeline-core/lib/native-goldfish-host-state.mjs)
- New exported `memoPerAdmission(boundary,key,compute)`: WeakMap keyed by the boundary object; key = governed queue sha256 + candidate commit + shape. No boundary object means no memo. Never module-global.
- `readNativeIntegratedSlices` now memoises, returns copies; new params `skipCancelled` and `only`. Per-row proof is skipped for rows outside `only` and for cancelled slices when `skipCancelled`; `releasedPendingHashes` stays complete in every shape.
- `readSettledItemSliceIds` uses `skipCancelled:true` (settled unions cancelled slices anyway, so the settled set is identical) and a memoised `readOrchestratorCommitIntegratedSlices`.
- Dependency check in the publish path proves only `item.dependsOn` (`only`), and the collision-check `settled` set now comes from `readSettledItemSliceIds` (same definition as before: native + commit evidence + cancelled).
- Deliberate deviation from "skip cancelled inside readNativeIntegratedSlices": the unfiltered function still proves cancelled rows, because a cancelled-and-integrated dependency counts as satisfied; skipping would change that result. The skip is only used where the cancelled set is unioned afterwards.

## Test (test file)
- Added `D177-memo-per-admission` (memo once per key and boundary, no leak across boundaries, no memo without a boundary). The file ran exit 0 in the clone after the change (the file is not node:test format, so no count lines). Not run RED first (written after the code under budget pressure; deviation from test-first).
- No closed case-count pin was checked for either test file.

## NOT done
- (3) dirty-baseline check first in guard-dispatch.mjs: the predicate lives in captureHostCommitBaseline (agy-host-commit-admission.mjs lines 55-95), not read.
- (4) heartbeat / GUARD-DISPATCH-SLOW: finding for the parent: the hook body is synchronous (spawnSync, sync fs), so a 10 s setInterval heartbeat cannot fire during a blocking phase; it needs phase-boundary checks or a worker/child. Also the registry lock is taken inside prepareNativeGoldfishHostState (withSessionAuthorityBoundary), not in the hook, so a typed slow refusal at 100 s needs a deadline passed into that function. Design decision needed.
- Tests (a) differential, (b) call count with N=40, (d), (e); guard-dispatch-budget.test.mjs untouched.
- Neighbouring suites (regression, fanout, guard-dispatch, guard-dispatch-fanout) not run; no baseline vs patched failing-name sets. No wall-clock measurement.
- Out of scope as briefed: Layer-1 release on SIGTERM, abandoned-lock housekeeping, queue archiving (D178), hooks.json budget.

## Proposed commit message
perf(dispatch): admission cost no longer grows with settled history; typed slow-hook refusal (D177)
(only valid once items 3 and 4 land; for this partial patch use a narrower subject)

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit, commit with --no-verify, stamp, install. Custody paths: an independent Critic review stays a parent-owned batch gate.
