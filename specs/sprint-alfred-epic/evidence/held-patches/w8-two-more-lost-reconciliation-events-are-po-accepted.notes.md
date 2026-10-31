# w8-two-more-lost-reconciliation-events-are-po-accepted (held patch, not applied)

Cause of the red backlog-state check: ledger events 2356 (`pipeline.codex-bootstrap-in-the-typed-next-action`, `open` to `in_progress`) and 2358
(`pipeline.second-writer-check-skips-a-worktree-isolation-that-may-not-be-granted`, null to `open`) are item-file reconciliation events whose `evidence.commit`
(`26753c18…`) is no longer a reachable local Git commit. They sit above `LEDGER_DRIFT_CUTOFF_SEQUENCE` (1000), so the finding classifies as INTEGRITY and blocks.

Decision: D222 (PO, 2026-10-31) accepts exactly these two by exact identity. Restoring the commit was the declined alternative.

Change: `PO_ACCEPTED_LOST_RECONCILIATION_EVENTS` in `plugins/pipeline-core/lib/backlog-state.mjs` gains the two full identities (sequence, id, from, to, at, actor, reason,
previousHash, entryHash, evidence commit/kind/reference), copied from the ledger lines, and the comment names D222. The matcher is unchanged, so every lookalike event and
every other sequence stays INTEGRITY; the ledger itself is not edited.

Evidence (clean clone): the backlog state check now prints both events as `DRIFT … (PO accepted …)` and no longer as a failure; `backlog-state.test.mjs` 64/64 including
BS38 (the accepted batch is immutable, every lookalike remains INTEGRITY). The remaining `has no transition-ledger entry` lines are written by the apply script's
`reconcile-backlog-ledger --activate` step, not by this patch. Applies to the repository HEAD.
