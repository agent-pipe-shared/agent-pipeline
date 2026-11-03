# w118 — routine-repair heal defers the retirement of settled pending states while a member is armed (candidate 19)

Binding: AC-127 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- `lib/routine-repair.mjs`, heal branch of `execute()`: after the `session-authority-repair inspect` the file already runs, if any producer reports `inFlight > 0` (inspect's own predicate: bound members that are armed or running), `retireSettledPending` is NOT called. Nothing is moved.
  The result carries `settledPending = { deferred: { count, reason } }`: `count` is the number of settled pending states, orphaned authority records and stop-failure records a heal with nothing armed would retire; `reason` names the cause and tells the caller to run heal again when nothing is armed.
- A deferral is "not clear" for the automatic move-aside (`autoMoveAsideAdmitted`), so a registry that still does not read is not moved aside while a dispatch runs; `autoMoveAside.attempted` is false with the reason.
- The read-only computation of `readSettledPendingPreview` was extracted into `previewSettledPending(commonDir, inspect)` (same behaviour), so the deferral counts with the same rule as the briefing preview and the `DBG-SETTLED-PENDING-HEAL` warning. The `heal` descriptor text names the deferral.
- With no member armed the behaviour is exactly as before. The `settled-pending-aside` kind is unchanged (it is an explicit request). No new verb, record schema, digest or exit code; `session-authority-repair` and the CLI wrapper are not touched.

## Why

2026-11-02: a heal that retired settled pending states while a sibling dispatch was in flight drifted the registry namespace (`native-goldfish:namespace-drift`) and blocked the next dispatch; the only protection was the operating rule "heal only when no Goldfish runs". The rule is now in the tool.

## Checks

- Test-first: two new cases in `routine-repair.test.mjs` were RED against the original (41 pass, the 2 new cases failed), then GREEN: (1) member armed -> pending state, sibling and stop-failure record stay, `deferred.count` 2, a later heal with nothing armed retires them; (2) armed + registry still refusing -> no move-aside.
- `routine-repair.test.mjs`: 43 of 43 pass. `check-consumer-safe-paths.test.mjs`: 9 of 9 pass.

## QG-04 restatements (two existing cases, intent kept, none weakened or deleted)

The fixture `driftedLive` reports the native producer with `inFlight: 1`. Two "interim" cases used it as "nothing can be running" and expect the automatic move-aside; with in-flight now deferring, that contradicts the goal. They use `driftedIdle` (the same fixture with `inFlight: 0`), which is the state their titles describe:
- "interim: a heal that ends SAR-HEAL-INCOMPLETE with nothing open or kept moves the registry aside itself ..."
- "interim: when the move-aside itself fails, or the registry still refuses after it, heal reports that and stays refused" (both halves).
Every other `driftedLive` case is unchanged and passes.

## Not changed / not proven

- `session-authority-repair inspect` does not name the deferred retirement (optional item, skipped).
- `session-authority-repair.test.mjs` was not run (the script is untouched). The full Verify run was not made; the new test file needs no registration (cases were added to the existing registered examiner).
