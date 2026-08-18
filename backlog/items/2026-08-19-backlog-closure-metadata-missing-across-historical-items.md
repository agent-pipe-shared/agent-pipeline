---
schema: pipeline.backlog-item.v1
id: pipeline.backlog-closure-metadata-missing-across-historical-items
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Found by PHX-WP-BACKLOG-OBSGOV-MISC-TRIAGE while diagnosing backlog-state-check and backlog-ledger-reconciliation-tests failures from a full clean-candidate Verify run, 2026-08-18/19."
---

# Dozens of closed backlog items lack required closure metadata, dating back to 2026-07-27

## Description

`validateBacklogItem()` (`plugins/pipeline-core/lib/backlog-state.mjs`)
requires `closed_at`/`closure_repository`/`closure_commit`/`closure_evidence`
on every item with `status: closed`. Dozens of items across the entire
backlog history — verified directly in
`backlog/items/2026-07-27-recovery-preview-ack-unstable-getter-poisons-replay-ledger.md`'s
frontmatter, and almost certainly others — lack all four fields, causing
`backlog-state-check` (exit 2) and `backlog-ledger-reconciliation-tests`
(exit 1) to fail in a full Verify run. This long predates this session's own
backlog work.

## Affected artifact

`plugins/pipeline-core/lib/backlog-state.mjs` (`validateBacklogItem`'s
requirement), and every closed `backlog/items/*.md` file missing the four
fields — the exact set needs its own inventory pass (not enumerated here).

## Proposal

Not designed here — this needs a real inventory (which closed items are
missing which fields) before a remediation approach can even be scoped.
Fabricating `closure_commit`/`closure_evidence` values would be dishonest
and is explicitly out of bounds; genuine historical research (finding the
real commit/evidence for each item, where it exists) or a deliberate,
disclosed backfill policy for items too old to reconstruct are the two
realistic directions — a PO call on which (or a mix) is needed before
dispatching real work here.

## Triage — 2026-08-19

- **Decision:** accept-open, NOT dispatch-ready — needs an inventory pass and
  a PO decision on remediation approach (historical research vs. disclosed
  backfill policy vs. relaxing the validator's requirement for pre-2026-08
  items) before any implementation work is scoped.
- **Rationale:** Large, historical, cannot be safely bounded without first
  knowing the actual scope (how many items, how far back, whether real
  closure evidence is even recoverable for the oldest ones).
- **Assignment (if accepted):** Unassigned — needs Elephant-led inventory
  pass first, then a PO decision on remediation approach.
- **Date:** 2026-08-19
