# w232: the pre-launch publish waits for a sibling launch's registry lock within the admission deadline (E4)

Elephant-built small item. Delta on w229 (both change `lib/native-goldfish-host-state.mjs`); order: w225 to w228, w229, then w232. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Found

2026-11-05, in this repository on Linux: two Goldfish launches in one reply were both refused, each with `SDC-LOCK-HELD: version 2 native host binding failed before launch. Reason: registry-lock-held`, at the guard phase `registry-migrate`, after waiting 1501 ms for the other's lock. Neither launch got through; started one after the other, both were admitted. This reproduces E4 of the Windows report (the second of two launches refused). The queue writers already loop around a held lock (`retryWhileSessionAuthorityLockHeld`), but `publishNativeAuthorityState`, the pre-launch publish, was not wrapped, so only the 1.5 s bound of a single acquisition applied.

## What it changes

- `prepareNativeGoldfishHostState` calls the publish through the new exported `retryPublishWhileLockHeld`. A held lock, or the state-push owner a sibling holds, is retried with the existing backoff of `retryWhileSessionAuthorityLockHeld` only while the boundary callback has not run, so nothing has been written. The migration and the registry initialisation before the boundary are idempotent and simply run again.
- The budget is what remains of the admission deadline, capped at 60 s; the deadline checkpoints still refuse `GUARD-DISPATCH-SLOW` past it. Without a deadline it is the 10 s default of the queue writers.
- `publishNativeAuthorityState` marks `entered` as the first statement inside its boundary callback.

## Checks

- New case NGHS65 in `native-goldfish-host-state.test.mjs`: a lock held for two attempts is waited out; with 100 ms of deadline left the held lock is refused, typed, after a bounded wait; a lock refusal after the callback entered is rethrown at once; any other fault is not retried. Case id added to the case-completion policy.
- Suites on the slice clone, one at a time: native-goldfish-host-state 76/76, guard-dispatch 83/83, native-goldfish-host-finalizer 48/48, kernel closure 11 passed, check-verify-case-completion 32/32.

## Not changed / not proven

- No second real launch pair was run on the changed code; the case drives the retry function with a fake clock.
- On Windows a lock cycle takes much longer (130 to 180 PowerShell starts), so the second launch waits for the whole cycle of the first. That wait is inside the deadline, but it is not measured.
- No full Verify run, no independent Critic review.
