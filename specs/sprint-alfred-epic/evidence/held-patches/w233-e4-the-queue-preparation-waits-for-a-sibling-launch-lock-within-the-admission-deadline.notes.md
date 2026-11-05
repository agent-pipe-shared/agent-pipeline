# w233: the governed queue preparation waits for a sibling launch's registry lock within the admission deadline (E4)

Elephant-built small item. Applies directly on the applied 19g chain. Criterion binding: AC-108 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## Found

2026-11-05, Windows measurement of candidate 19g: the second of two Goldfish launches in one reply was still refused with `SDC-LOCK-HELD: Reason: registry-lock-held`. It was refused after 13.1 s (8 failed native lock creates), during the first launch's dispatch-checks window, before its `prepare-start`. The refusal came from the governed queue preparation (`prepareGovernedItemQueue`, called from `guard-dispatch.mjs` before the native host-state preparation). That call retried a held lock only for the 10 s default of `retryWhileSessionAuthorityLockHeld`, although the admission deadline had minutes left. w232 had wrapped only the later pre-launch publish.

## What it changes

- `prepareGovernedItemQueue` takes an optional `admissionDeadline` (and a test-only `publishRetry`) and retries through `retryPublishWhileLockHeld`. With a deadline the wait is what remains of it, capped at 60 s; without one it is the 10 s default as before. Only a lock met before the boundary callback ran is retried, so nothing has been written.
- `guard-dispatch.mjs` hands the queue preparation the same admission deadline as the host-state preparation. The one literal is now the named constant `ADMISSION_BUDGET_MS = 300000`, read by both sites.
- The queue preparation inside `prepareNativeGoldfishHostState` receives the deadline it already has.

## Checks

- NGHS66 (new): another process holds the registry boundary for 12 s. A preparation with minutes left on the deadline waits it out (at least 10 s) and writes its row. With 0.5 s left it is refused `SDC-LOCK-HELD` and writes no row.
- NGHS67 (new): both admission routes hand their deadline to the queue preparation, and the preparation retries through `retryPublishWhileLockHeld`.
- GD73 restated: it still pins one admission budget literal of 300000 ms in the guard, now as the named constant, and requires both deadline sites to read it.
- Suites on the slice clone, one at a time: native-goldfish-host-state 78/78 (NGHS60 to NGHS67 rerun 8/8 after the GD73 restatement), guard-dispatch 83/83, check-verify-case-completion 32/32.

## Not changed / not proven

- No real launch pair on Windows ran on this code. The second launch now waits for the first launch's queue lock, which on Windows can take tens of seconds; that wait is inside the deadline but not measured.
- If the first launch holds the lock for more than 60 s at a time, the second launch is still refused, now with the same typed code after the longer wait.
- No full Verify run, no independent Critic review.
