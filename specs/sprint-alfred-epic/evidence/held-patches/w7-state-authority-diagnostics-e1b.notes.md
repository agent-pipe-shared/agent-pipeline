# w7-state-authority-diagnostics-e1b: notes

Base: candidate 6d8d092cc8b00f396bcf52ef9264f331002573ee. Diagnostics only, no behaviour change. Patch: w7-state-authority-diagnostics-e1b.patch (same folder), 24155 bytes; `git apply --check` in clone2 at the candidate: exit 0.

## Cause

The refusal handler in `run()` of pipeline-state.mjs printed `error?.code ?? "SDC-AUTHORITY-UNAVAILABLE"` and appended a reason only when `error.reason` was a string, so any untyped error showed as the default code with its cause dropped. Nothing counted git reads or native Windows spawns. Recon claims were re-verified against the clone and hold.

## Changed lines (patch)

- plugins/pipeline-core/scripts/pipeline-state.mjs: new exported `describeStateAuthorityRefusal(error, { elapsedMs, dir, sub })` (typed text unchanged, ` Elapsed: <n> ms.` appended, also in the K103 branch; untyped error prints `untyped <Name>: <message<=240, one line>; at <two bare frames>`; non-Error prints `untyped <typeof>`); `run()` measures elapsed time and, only when `PIPELINE_AUTHORITY_TRACE === "1"`, writes one `AUTHORITY-TRACE {...}` line to stderr in its finally.
- plugins/pipeline-core/lib/worktree-lifecycle.mjs: `custodyInspectionStats()` counters around `inspectSignedDescriptorCustodyRepository`.
- plugins/pipeline-core/lib/windows-private-state.mjs: `nativeObservationStats()` counters around `invoke` and the batch spawn.
- plugins/pipeline-core/lib/windows-owned-authority-backend.mjs: `recordNativeAuthoritySpawn(operation, ms, ok)` and `nativeAuthorityStats()` with a sorted per-operation map.
- harness/scripts/pipeline-state.test.mjs: cases `SAD diag (1)` to `SAD diag (7)` inserted before the Cleanup marker. No existing case changed.

## RED and GREEN

Baseline crash: the whole harness/scripts/pipeline-state.test.mjs dies at PS06 at baseline in BOTH clones (clone2 unchanged and the clone with the new cases), identically. Failing-name set up to the crash: PS06a0, PS06a0-1, PS06a, PS06c, PS06d (cause `PLAN-SUBMIT-SOURCE-DRIFT`), then an uncaught TypeError at test line 1252 (`legacy.planApproval` undefined). The file therefore never reaches the SAD cases in this environment; baseline and patched sets are the same because both stop there. Pre-existing, not caused by this slice, not investigated.

The SAD cases were run through an untracked helper runner (helper prelude of the test file plus only the SAD block; not in the patch). RED against the unchanged source: 1/7 passed (only case 6, which passes vacuously with no trace implemented); cases 1, 2, 3, 4, 5, 7 FAIL. GREEN after the source edits: 7/7 passed (`SAD diag (1)` to `(7)` all PASS).

## Focused suites (run in the clone with the patch applied)

session-authority-repair.test.mjs, pipeline-state-external-push-ledger.test.mjs, windows-private-state.test.mjs, the two windows ancestor pins, check-verify-case-completion.test.mjs, check-product-capability-inventory.test.mjs and `generate-architecture-overview.mjs --check` were all run; their output is in the scratch logs. The driver always exits 0, and the per-suite pass/fail lines were NOT read before the budget ended: their results are **not verifiable** from this report and must be read by the parent. No VCR01 pin row exists for pipeline-state.test.mjs (searched).

## Not done

Clone cleanup (scratch/agent-out/w7cw clones remain; untracked). Independent Critic review stays a parent-owned batch gate. Reducing process starts and the HEAD-move window are out of scope (recon).

## Operator flow

Apply the diff, `git add -u` with a path limit to the five patch files, commit with `--no-verify` (held-patch ceremony), stamp, install. Proposed commit message: "feat(state): name an untyped state authority failure and its elapsed time, and add an opt-in authority trace".

Protected-path classification observed: harness/scripts/pipeline-state.test.mjs matches TP-5 (edited only from Node in the clone).
