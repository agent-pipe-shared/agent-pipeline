# D196 R1: the started-owner reader no longer hangs the briefing build (Elephant small item, 2026-10-30)

Held patch `w7-d196-started-owner-reader-reads-pending-files.patch`, built by the Elephant in a scratch clone at c4f955995 (candidate 6 applied). Nothing applied.

## Defect found live

After candidate 6 was applied, every `dispatch-briefing.mjs build` in this repository ran for more than five minutes at full CPU and
held the session-authority registry lock while doing so. The cause is the D196 default reader `defaultStartedOwners`: it called
`inspectNativeGoldfishItemDelivery`, which verifies every historical producer member and searches the native inventory once per pending
state. Measured on this repository: more than 120 s for the inspection alone (aborted by the timeout). A repository with a short
history, such as a fresh greenfield project, is fast, but the reader grows with every dispatch.

## Behaviour now

`defaultStartedOwners(root, queueRows)` (exported for its test) reads the pending files of
`<git-common-dir>/agent-pipeline/run/native-goldfish-host-commit` directly. A started owner is a `pending-<runner>-<64 hex>.json`
without an `authority-terminal-<sha256 of its bytes>.json`, carrying `delivery.itemId` and `binding.dispatchId`, whose slice the
governed queue still holds as `ready`, and for which no commit carries `Dispatch: <id> (goldfish)` (one `git log` call). Without the
queue and trailer filters the direct read named 239 owners on this repository, almost all of them long-delivered slices whose host
never committed. The full integration read (`observeGovernedItemIntegrationReadiness`) would have been the exact criterion, but it took
35 s here. The warning stays a warning; any fault yields no owner.

## Evidence

- Reader alone on this repository: 489 ms, 0 owners (before: more than 120 s).
- Full `build` with the patched generator against this repository: finishes, no DBG-CHECKPOINTED-OWNER flood.
- dispatch-briefing suite in the clone: 114/114, including the new default-reader case (unsettled ready slice named; settled,
  unreadable, delivery-less, cancelled, unqueued and trailer-committed ones not; no queue row means no owner).
- Revert proof: with the producer reverted, the new case fails; restored byte-equal. Apply-check on the plain candidate exit 0.

## Not verified

A slice committed by a host without the Dispatch trailer would still be counted (the warning would name it; it never refuses).
Codex and Antigravity live runs, Windows, Full Verify, Critic, PO acceptance.
