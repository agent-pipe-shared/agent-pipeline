# D177 held patch (increment): typed slow-admission refusal at phase checkpoints

Status: increment over the candidate that already contains the C1 memo (commit `bdc9f832f`, stamped `e562ae955`). Targeted delivery: new cases RED on the unchanged logic, GREEN on the patched clone, neighbouring suites identical to the baseline. Not applied, not installed, no Full Verify, no independent Critic, no native run, no PO acceptance.

## What the patch contains (3 files, +99 -7 lines)
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs`: exported `createAdmissionCheckpoint(deadline)`; the optional `admissionDeadline {startMs, budgetMs, now, write}` is threaded `prepareNativeGoldfishHostStateOnce` -> `publishNativeAuthorityState`; `checkpoint(phase)` is called at `integrated-slice-read`, `collision-check`, `mint`, `baseline-capture` and `reserve`. Each call writes ONE line `guard-dispatch: phase <name> at <s>s` to stderr and, when the elapsed time already exceeds `budgetMs`, throws an Error with `code` and `reason` `GUARD-DISPATCH-SLOW` naming the phase and the seconds. `readNativeIntegratedSlices` and `settledItemSlices` are now exported (the differential case needs them).
- `plugins/pipeline-core/hooks/guard-dispatch.mjs`: `HOOK_ENTRY_MS = Date.now()` at module load and `admissionDeadline: { startMs: HOOK_ENTRY_MS, budgetMs: 100000 }` passed into `prepareNativeGoldfishHostState`.
- `plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`: the memo case is renamed `D177-a-memo-per-admission` (case ids must be strictly ascending, TCC-CASE-ORDER), plus `D177-differential-settled`, `D177-slow-phase-releases-lock` and the helpers `d177Item` / `d177Setup`.

Without the argument nothing changes: no stderr line, no throw.

## Evidence
- RED on the unchanged logic (candidate `e562ae955`, new test file copied into a pristine clone): `D177-differential-settled` red ("the unfiltered reader is reachable for the differential": the export does not exist), `D177-slow-phase-releases-lock` red (no deadline support). `D177-a-memo-per-admission` is green there because the memo already exists in the candidate.
- GREEN on the patched clone: `native-goldfish-host-state.test.mjs` 42 tests, 42 pass, 0 fail, all three D177 cases among them.
- Neighbouring suites, baseline versus patched2 failing-name sets: IDENTICAL. `guard-dispatch.test.mjs` 22 red both sides, `guard-dispatch-fanout.test.mjs` 7 red both sides (red before any D177 change), `native-goldfish-host-state`, `-regression` and `-fanout` 0 red. The baseline logs were taken before the C1 memo, so the comparison covers C1 and this increment together.
- Apply check: `git apply --check` passes against a pristine clone of the candidate and against the live repository tree.

## What the cases prove and what they do not
- The differential case compares the filtered/memoised integrated and settled results with the unfiltered computation over a fixture with integrated, cancelled, released and open rows (settled set, completeness of `releasedPendingHashes`, the `only` filter), and counts repository reads through a Proxy to show that a memo hit reads nothing. It proves result equality for that fixture, not for every possible queue.
- The slow-phase case drives the checkpoint with a stubbed clock past the budget between two phases: it expects `GUARD-DISPATCH-SLOW` naming the phase, one line per phase, and the registry lock free afterwards. The lock is released by the existing `finally` of `withSessionAuthorityBoundary`; this is the evidence, no change to the lock implementation.
- The fault is an Error with a `code` property because no repository fault helper carries a custom code; `prepareNativeGoldfishHostStateOnce` already returns `error.code` and `error.reason`.

## NOT measured, NOT done
- No wall-clock reduction and no git-call count were measured. The 51 s baseline capture and the per-row git proof for non-cancelled rows are untouched.
- The deadline is a phase checkpoint, not a timer: a single phase that outlasts the remaining budget is still killed by the host at the hook limit, and only the next checkpoint turns an over-budget admission into `GUARD-DISPATCH-SLOW`.
- Item 3 (dirty baseline before the lock) is out: the predicate excludes `concurrent.foreignPaths`, which exist only inside the registry boundary, so a pre-lock check is either a second predicate or a regression for concurrent dispatches (NGHS17).
- The N=40 call-count case is out: no spawn seam exists.
- `hooks.json` budget (120 s to 300 s, signed human override) and D178 housekeeping (abandoned locks, queue JSON, dispatch history, Layer-1 release on SIGTERM) are not part of this patch.

## Proposed commit message
perf(dispatch): typed slow-admission refusal at phase checkpoints (D177)

Trailers: `AI-Assisted: true`, `Dispatch: W6-D177-ADMISSION-SPEED-C4-20261027 (goldfish)`.

## Operator flow
`node scripts/apply-diff.mjs specs/sprint-alfred-epic/evidence/held-patches/d177-admission-speed-settled-history.patch`, path-limited `git add -u` over the three files, `git commit --no-verify -F <message>`, stamp, install. These are custody paths: an independent Critic review stays a parent-owned batch gate; Full Verify, Critic, native runs and PO acceptance are pending.
