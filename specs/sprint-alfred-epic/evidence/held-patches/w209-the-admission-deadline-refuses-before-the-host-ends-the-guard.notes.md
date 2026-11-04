# w209: the admission refuses before the host ends the guard (Direction 0 of the Windows latency plan)

Evidence: the second Windows run of candidate 19c (2026-11-04). The `guard-dispatch` hook has a 330 s timeout. The host ends a timed-out PreToolUse hook and lets the tool call run, so a hook that is cut off is not a block. The admission read the session-authority registry (one PowerShell start per file on Windows) for the whole timeout, was ended while it held the registry lock and before it wrote the pending host-commit state, and the dispatch started with no admission result, no pending state, no warning and a dead lock. The phase checkpoints (`createAdmissionCheckpoint`) did not help: none of them lies before the long registry reads.

## Change

- `plugins/pipeline-core/lib/admission-deadline.mjs` (new): one process-wide deadline (start plus budget minus a 5 s margin). `assertAdmissionDeadline()` throws a typed `GUARD-DISPATCH-SLOW` error with a reason and a repair (`session-authority-repair.mjs inspect`) once it has passed, and does nothing while none is set.
- `native-goldfish-host-state.mjs`: the preparation sets the deadline around the publish when it gets a real-clock `admissionDeadline` (a deadline with an injected `now` keeps the existing phase checkpoints only) and clears it in a `finally`.
- `session-authority-registry.mjs`: the check runs at the start of `readRef` and in each iteration of the `registryClosure` walk. It is deliberately not on the cleanup path, so the `finally` of the boundary still releases the lock.
- `windows-owned-authority-backend.mjs`: the check runs before each read-only native observation.
- Platform-neutral on purpose: the loops are the same on every platform, only the cost per step differs.

## Tests

- `native-goldfish-host-state.test.mjs` D177: a stale real-clock deadline refuses with `GUARD-DISPATCH-SLOW` (the phase checkpoint or the read loop names the budget), the deadline is cleared, the registry lock is free afterwards, and a fresh budget admits. A direct registry read under a stale deadline reports the typed code and the read-loop reason. The module is unit-tested on its own (nothing set means no check; the margin is kept free; invalid input clears).

## Result in the work clone

native-goldfish-host-state suite: green for the deadline case. The two other failures in the first full run (NGHS49, NGHS59) pass when run alone; they were run in parallel with other suites. Neighbouring guard suites (human-guard-override, lifecycle-ready, codex pretool guard, po-only discard boundary, current-session artifact export): 625 of 630, with one failure, `Q9 (D55)` (`domain-ancestor-unsafe`), which fails identically on the base without this change (a test-directory property of the work clone, not of the change).

## Not covered here

- This does not make the admission faster; it makes a too-slow admission refuse instead of being ended silently. The speed-ups are Directions 1, 2a and 3 of the latency plan and wait for a trace of a normal dispatch.
- Some registry reads catch errors and report them as a value (`inspectSessionAuthorityRegistryRead` returns `refused` with the code). Callers that turn a caught error into another code would hide `GUARD-DISPATCH-SLOW`; the phase checkpoint still catches the overrun there. To be checked on the next Windows run.
- Independent Critic review of the guard and authority-path change is open (the PO moved the Critic reviews to after the greenfield proof).
