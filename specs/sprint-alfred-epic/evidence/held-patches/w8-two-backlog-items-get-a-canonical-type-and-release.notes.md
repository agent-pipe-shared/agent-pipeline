# w8-two-backlog-items-get-a-canonical-type-and-release (held patch, not applied)

Two items failed the backlog state checker's field rules: `candidate11-follow-ups` carried the type `improvement` (not in the canonical taxonomy; now
`workflow-improvement`), and `a-recurring-housekeeping-job-collects-growing-runtime-state` carried `release: 0.7.x` (not a version; now `0.7.1`, the follow-up release the sibling item uses).

**This patch is only half of the backlog repair.** After it is committed the apply script must run
`node plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs --activate` in the real repository and commit `backlog/transitions.ndjson` and `backlog/index.json`: the 30 missing
ledger transitions cite the commit that holds the item files, so they cannot be shipped as a patch from a clone (a clone commit would be an unreachable evidence commit above the drift cutoff).
Rehearsal in a clone: plan and activation record 30 transitions for 30 items; afterwards `check-backlog-state` reports only the two events 2356 and 2358 (evidence commit `26753c18…`,
absent from this repository) as FAIL; the accepted historical batch and event 403 stay DRIFT as before.

**PO decision needed** for those two events: accept them as lost reconciliation events (extend `PO_ACCEPTED_LOST_RECONCILIATION_EVENTS`, an exact-identity list that today holds the eight events of the 2026-09-15 disposition) or restore the lost commit.
