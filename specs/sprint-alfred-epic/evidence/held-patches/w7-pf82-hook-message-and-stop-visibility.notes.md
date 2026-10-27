# Held patch: PF-82 Slices A and C, hook message and stop visibility

Slice W7-PF82-HOOK-MESSAGE-AND-STOP-VISIBILITY-C1-20261027. Candidate fe1d74284d8c5e4c5012249f53a6c1421f2c4259. Patch: `w7-pf82-hook-message-and-stop-visibility.patch` (git diff --binary against the candidate, 2 files, +100/-6).

Proposed commit message: `fix(hooks): say why a background launch has no pending host-commit state and show a failed stop`

## Cause (re-verified against the clone)
- `hooks/native-goldfish-host.mjs` told every async launch "no final return reached this hook" although the real condition is "no pending host-commit state exists at PostToolUse time" (finalizer 238-261 returns NGHF-PENDING-UNAVAILABLE exactly when `readNativeGoldfishPending` fails). It also advised `dispatch-record-write.mjs` for a v4 authored-commit Claude record the writer refuses.
- A failed SubagentStop completion only wrote stderr (hook lines 69-71) and a `stop-failure-*.json` file (finalizer 151-169) that only the briefing builder reads.

## Changes (only `hooks/native-goldfish-host.mjs` and the test file)
- NGHF-PENDING-UNAVAILABLE async text: "... no pending host-commit state existed at PostToolUse time, so nothing can complete it at its stop"; stored preparation code still appended when present.
- Advice for async and no-pending: Elephant commit with the `Dispatch: <dispatchId> (goldfish)` trailer, stated as not host-observed evidence; names the writer only to say it refuses a v4 authored-commit Claude record without host observation.
- New exports `readNativeGoldfishStopFailure({commonDir})` (newest valid stop-failure diagnostic) and `nativeGoldfishHookMessage(result, {stopFailure})` (appends, or alone shows, the failure code and dispatch). The hook entry reads the diagnostic on a Claude PostToolUse Agent/Task call, the only channel the Elephant reads. No finalizer change was needed, so Slice C is delivered. The stop path message already carries the result code (pinned in NGHC06).
- Tests: NGHC03-NGHC06 added to `native-goldfish-host-commit-execution.test.mjs` (import of the hook module added). No existing case changed.

## RED and GREEN
- RED (unchanged hook, clone): `node plugins/pipeline-core/lib/native-goldfish-host-commit-execution.test.mjs` exit 7, NGHC03 assertion failure (runner stops at the first failing case, so NGHC04-06 were not individually run RED; they exercise functions or text that did not exist).
- GREEN (clone): exit 0, 6 tests, pass 6, fail 0 (NGHC01-06).
- Also GREEN in the clone: `native-goldfish-host-finalizer.test.mjs` (15/15), `native-goldfish-host-finalizer-regression.test.mjs` (3/3), `agy-host-commit-admission.test.mjs` (8/8); these pin the old message keywords (background, Dispatch trailer, dispatch-record-write.mjs, "no pending host-commit state was prepared"), which the new text keeps.
- Baseline (clone2, unchanged): the target file has the 2 cases NGHC01-02, no failures expected; the baseline run of the other three suites was still running at close and its logs are in `scratch/agent-out/w7dd/base.*.log` (not compared). Failing-name sets: patched none; baseline for the target file none (log read at close).
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## NOT done
- Slice B (orchestrator-attested record kind) and Slice D, both need PO decisions or measurement.
- The Agy `AGY-HOST-COMMIT-PIPELINE-PATH-UNIGNORED` message still recommends the writer; `agy-host-commit-admission.test.mjs` line 124 pins it, so it was left as is.
- The hook scans for the newest diagnostic across all dispatches (the file holds no session id), so an old failure can be shown again until a later success removes it.

## Operator flow
Apply the diff (`git apply`), `git add -u -- plugins/pipeline-core/hooks/native-goldfish-host.mjs plugins/pipeline-core/lib/native-goldfish-host-commit-execution.test.mjs`, commit with `--no-verify`, stamp, install. Protected paths: neither file matches TP-1..TP-13 in `templates/prompts/agent-obligations.md` section 2 (the hook is plugin source; classification by pattern only, no write was attempted in the repository). An independent Critic review stays a parent-owned batch gate.
