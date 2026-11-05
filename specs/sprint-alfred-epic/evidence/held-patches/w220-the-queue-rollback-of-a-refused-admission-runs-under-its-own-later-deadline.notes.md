# w220: the queue rollback of a refused admission runs under its own later deadline

## Cause (read from the 19d measurement, hypothesis checked against the counts)

Native Windows consumer, 19d, dispatches A and B (2026-11-05): the guard-dispatch hook was ended by the host at 330 s in both runs and `GUARD-DISPATCH-SLOW` never appeared although the admission deadline (295 s after hook start) is real-clock and works in isolation (probe: an expired deadline stops a native observation with 0 spawns).

`prepareNativeGoldfishHostState` set the deadline, ran the preparation, and cleared it in a `finally`; only then did it call `rollbackGovernedItemQueue` for the queue rows the refused admission wrote. That rollback enters `withSessionAuthorityBoundary` (registry lock, whole registry, domain-owner reads), a full cycle of 85 to 100 native starts with no deadline. Dispatch B's third cycle shows 46 `read-source` starts instead of the 23 of the other cycles; the second 23 are consistent with the rollback cycle starting at about 295 s, and the host ended the hook inside it. The refusal text was never printed, so the dispatch ran unguarded.

## Change

`lib/native-goldfish-host-state.mjs`: `admissionDeadlineWindows({startMs, budgetMs})` gives a preparation window (the budget less a 50 s reserve; no reserve for a budget of 100 s or less) and a rollback window (the whole budget). The preparation runs under the first, the rollback of every queue row under the second (`restoreWrittenQueueRows`), cleared afterwards. A row whose rollback returns `GUARD-DISPATCH-SLOW` stays, counted as retained, and the refusal reason says so and names the routine heal or a cancel of the slice (w213 made the cancel path name its repair). Injected-clock callers keep their checkpoint semantics (no real-clock windows are set). `dependencies.rollbackGovernedItemQueueFn` is a test seam.

## Test

`native-goldfish-host-state.test.mjs`, case `D177-rollback-runs-under-its-own-later-deadline`: the two windows, the deadline active during each rollback call (newest row first) and cleared afterwards, a slow rollback counted while the next row is still tried, no window and no rows, and an expired window stops an observation.

## Not covered

Not measured on Windows. With w215 and w218 the rollback cycle should be warm and short; this change only makes sure that a slow one can no longer run past the host limit. The three registry cycles of the admission itself are untouched (a design change).
