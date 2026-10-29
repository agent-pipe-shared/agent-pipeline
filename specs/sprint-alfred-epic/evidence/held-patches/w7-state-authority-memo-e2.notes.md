# w7-state-authority-memo-e2 (interim state, budget checkpoint)

Stacked on scratch/agent-out/compose/bundle.patch (e1b + e1c). Candidate 65072a6f99dda6a797b5cef25d312a0b419a8deb.

## Cause
`invoke()` in windows-owned-authority-backend.mjs starts one PowerShell per operation; read-only observations of the same unchanged object repeat many times per state command.

## Change (patch w7-state-authority-memo-e2.patch, 15243 bytes, `git apply --check` exit 0 in clone2 at the stacked baseline)
- plugins/pipeline-core/lib/windows-owned-authority-backend.mjs: process-local memo for inspect, ancestor, ancestor-above-root, read, read-source, inspect-source-image; key = operation, path, directory, boundaryRoot, maxBytes plus lstat bigint identity (dev, ino, mode, nlink, size, mtimeNs, ctimeNs, birthtimeNs); fresh lstat on every lookup; stored only if identity after the native call equals identity before; publish/create-directory/remove clear the memo before and after; refusals never stored; 512 entries, oldest dropped; PIPELINE_AUTHORITY_NO_MEMO=1 disables; a hit does not call recordNativeAuthoritySpawn. Stats gain authorityMemoHits, authorityMemoMisses, authorityMemoSize. Exported seam setWindowsOwnedAuthorityBackendTestSeam({platform, spawn}) and resetWindowsOwnedAuthorityBackendMemo() (import-only, defaults real). `invoke` split into memo wrapper plus `invokeNative` (old body, unchanged refusals).
- plugins/pipeline-core/scripts/session-authority-repair.test.mjs: imports, fixture `memoFixture`, cases SAS09..SAS17.

## RED
Whole file red against the unchanged backend: SyntaxError, the module does not export `resetWindowsOwnedAuthorityBackendMemo` (log w7da/logs/red.log, exit 1). Crude whole-file red (missing exports), not per-case.

## GREEN / baseline comparison (updated; patch now 16653 bytes, apply-check exit 0 in clone2)
- Repair test file, clone (patched): exit 0, tests 38, pass 38, fail 0 (SAS09-SAS17 included).
- Repair test file, clone2 (stacked baseline): exit 0, tests 29, pass 29, fail 0. Failing-name sets: both empty, identical.
- harness/scripts/check-verify-case-completion.test.mjs: first run RED only on VCR01 (repair suite pin actual 276, expected 251); pin changed 251 -> 276 (only that number, in the patch); re-run exit 0, pass 32, fail 0.

## Not done
- Trace line: `nativeObservations` in scripts/pipeline-state.mjs (outside the allowed patch files) does not yet carry the memo keys; stats object does. Needs pipeline-state.mjs in scope.
- Other listed suites: not run by the Goldfish (budget); run by the Elephant on a fresh clone with e1b, e1c and e2 applied in order: session-authority-repair 38/38, external push ledger 1/1, windows-private-state 24 tests with 20 pass and 4 skipped on Linux, the two ancestor pins (8 and 13 tests, skipped on Linux, 0 fail), windows-native-type-cache 13 tests with 4 pass and the rest skipped on Linux, check-verify-case-completion 32/32, check-product-capability-inventory 30/30, architecture overview current. The memo is exercised only through a fake spawn; no native Windows run.
- Driver cleanup (clones left in scratch/agent-out/w7da).

## Residual risk
A change that does not move the identity tuple within one command run (same-size rewrite within one timestamp tick, explicitly set timestamps) is not seen. No Windows run was possible; native behavior is exercised only with a fake spawn.

## Commit and flow
Proposed message: "perf(state): answer repeated read-only native authority observations from a process-local memo". Operator flow: apply-diff, git add -u with path limit, --no-verify commit, stamp, install. Protected paths: none of the touched files match TP-1..TP-13. Independent Critic review stays a parent-owned batch gate.
