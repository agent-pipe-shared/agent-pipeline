---
schema: pipeline.backlog-item.v1
id: pipeline.hgo-audit-ledger-segment-checkpoint
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PO decision D47 (2026-10-19): PF-51, found by the live item dispatch on build 677f8ec"
sprint: none
done_when: manual
---

# The human-guard-override audit ledger grows without a rotation route

## Description

`lib/human-guard-override.mjs` appends every override event to `audit.jsonl`, a ledger whose
entries are MAC-chained from genesis. Each append rewrites the whole file, and every
consumption check (`verifiedAuditEntries`, for example the governance consumption check)
reads and re-verifies the whole chain.

Before D47 a ledger over 1 MiB blocked every governed item dispatch. D47 gives the two
append-only journals their own 64 MiB bound in the authority inventory and the registry. It
also rotates the observational `command-offers.jsonl`. The audit ledger is not rotated: it
still grows, and every append and every check costs time linear in its size. At the bound the
refusal names this item, because no repair route exists yet.

## Open

- A segment checkpoint: retire the current segment with its authenticated head, archive it,
  and start a new segment whose first entry binds the retired head. Every reader that searches
  history (consumption, replay) must then search the retired segments too, or the facts it
  needs must be carried into the new segment.
- Measure the growth rate in a consumer repository. This repository reached 1.1 MB with
  about 1,600 entries.

## Acceptance

- A ledger at its bound is rotated by a typed route, and nothing that a consumption or
  replay check needs is lost.
- The refusal at the bound names that route.
