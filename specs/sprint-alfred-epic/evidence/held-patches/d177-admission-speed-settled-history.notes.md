# D177 held patch (PARTIAL, C2 interim): admission cost vs settled history

Status: targeted delivery BLOCKED (budget, second continuation). The committed .patch is still the C1 state (items 1 and 2, one memo case). The C2 work lives only in the untracked scratch work clone and was NOT turned into a patch because its new cases have never run.

## Cause
Within one admission, `readNativeIntegratedSlices` / `readSettledItemSliceIds` are recomputed several times, each doing one git-reading proof per integrated row. See the C1 description in the patch: `memoPerAdmission` (WeakMap on the boundary) plus `skipCancelled` / `only`.

## C2 state (work clone, uncommitted, never run)
- Test file: three D177 cases plus two helpers (`d177Item`, `d177Setup`) added: `D177-memo-per-admission` (C1, green), `D177-differential-settled` (integrated LEFT, open RIGHT, a cancelled view; compares settled set against the unfiltered computation, releasedPendingHashes completeness, `only`, and a Proxy count of `primaryRoot` reads showing a memo hit does no repository read), `D177-slow-phase-releases-lock` (stubbed clock via `admissionDeadline {startMs,budgetMs,now,write}`; expects `GUARD-DISPATCH-SLOW`, phase lines, lock free afterwards).
- Production still missing for the new cases: export `readNativeIntegratedSlices` and `settledItemSlices`; the `admissionDeadline` argument (checkpoint(phase) in `publishNativeAuthorityState` before integrated-slice-read, collision-check, mint, baseline-capture, reserve; one stderr line `guard-dispatch: phase <name> at <s>s`; typed error with `code: 'GUARD-DISPATCH-SLOW'`); `guard-dispatch.mjs` passing `{startMs, budgetMs:100000}`. The RED run (driver `redrun`) was not executed. No five-suite patched2 sweep.
- Call-count case with N=40 was NOT written: no spawn seam exists in the module (git runs through spawnSync inside helpers); the Proxy read count is the substitute for the memo-hit property only, not a bound on git invocations.

## Finding for the parent: item (3) as designed changes behaviour
The dirty-tracked-path predicate in `captureHostCommitBaseline` (agy-host-commit-admission.mjs line 87) excludes `concurrent.foreignPaths`, which come from the concurrent native authority minted INSIDE the registry boundary. Run before the boundary with `concurrent=null`, the same predicate refuses any tracked dirty path, including paths owned by another in-flight dispatch that today's admission accepts (test NGHS17 relies on this). So a pre-lock check is either a second, weaker predicate (forbidden) or a regression for concurrent dispatches. Needs a design decision (for example: pre-lock refuse only head mismatch, conflicts and staged paths, or only when no other native pending exists).

## NOT measured
No wall-clock reduction measured. The 51 s baseline-capture cost and the per-row git proof for non-cancelled rows are untouched. Out of scope: D178 items and the hooks.json budget. The heartbeat in the decided design is a phase-boundary line, not a timer.

## Proposed commit message
perf(dispatch): admission cost no longer grows with settled history; typed slow-hook refusal (D177) (valid only once the deadline and its cases land)

## Operator flow
Apply the diff (`git apply`), `git add -u` with a path limit, commit with --no-verify, stamp, install. Custody paths: an independent Critic review stays a parent-owned batch gate.
