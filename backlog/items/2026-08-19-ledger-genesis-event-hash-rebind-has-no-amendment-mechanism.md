---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-genesis-event-hash-rebind-has-no-amendment-mechanism
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "05c851b75f7ff4c1fa10c390aa20524fda4a31b8"
closure_evidence: "backlog/items/2026-08-19-ledger-genesis-event-hash-rebind-has-no-amendment-mechanism.md"
source: "Found by PHX-WP-LEDGER-EVENT41-HASH-FIX while resolving the last remaining backlog-state-check failure, 2026-08-19."
---

# The backlog transition ledger has no supported way to rebind a genesis event's stale itemSha256

## Description

`node plugins/pipeline-core/scripts/check-backlog-state.mjs` fails with
"ledger event 41: itemSha256 does not bind the current item bytes". Event 41
(`backlog/transitions.ndjson`) is the genesis `missing-initial-ledger-repair`
event for `pipeline.managed-onboarding-success-contract`
(`backlog/items/2026-07-25-managed-onboarding-success-contract.md`), recording
`evidence.itemSha256 = 26bbad90...b5939`. A later, entirely legitimate content
edit (commit `1a685d26`, appending a Triage section and setting
`status: deferred`) changed the file's real hash to `ac410807...af84a8`. The
item's `status` transition itself is already correctly reconciled separately
(ledger event 275, `open→deferred`) — only the ORIGINAL genesis event's
`itemSha256` binding is now stale, and nothing rebinds it.

Three mechanisms were investigated and ruled out (see
dispatch-record-PHX-WP-LEDGER-EVENT41-HASH-FIX.json for full detail):
`planManagedOnboardingLedgerRepair` only creates a one-time genesis event and
does not silence a later check on that same event;
`validateBacklogEvidenceAmendment`/`EVIDENCE_AMENDMENT_SCHEMA` targets
arbitrary events by sequence/hash but `check-backlog-state.mjs`'s own
`itemSha256` check does not consult any amendment overlay; and
`reconcile-backlog-ledger.mjs` only ever appends new `item-file-reconciliation`
transitions, never touches an existing event's `evidence.itemSha256`.

## Affected artifact

`backlog/transitions.ndjson` (event 41, and the append-only
`entryHash`/`previousHash` hash chain that makes any raw edit to it unsafe —
event 41's `entryHash` is itself computed over `evidence.itemSha256`, so
changing that value would invalidate every subsequent event's `previousHash`
binding, all the way through the current 275+ event chain);
`plugins/pipeline-core/lib/backlog-state.mjs` (the `itemSha256` check, and the
existing but insufficient `validateBacklogEvidenceAmendment` amendment
vocabulary).

## Proposal

Not designed here — two directions, neither built:

1. A new, explicitly-scoped amendment kind (mirroring the existing
   reachability-amendment pattern already used elsewhere in this ledger)
   that lets a LATER event supersede a genesis event's stale
   `itemSha256` binding without rewriting the earlier event's own bytes —
   the hash chain stays intact, but `check-backlog-state.mjs`'s validation
   would need to consult the amendment when checking the genesis event.
2. A documented, one-time, explicitly-authorized chain-reissue ceremony for
   this exact class of drift (rare — a genesis-repair event's own recorded
   hash going stale from a later, legitimate edit) — heavier, but requires
   no new amendment vocabulary.

## Triage — 2026-08-19

- **Decision:** accept-open, NOT dispatch-ready — needs a design decision
  between the two directions (or another the PO prefers) before implementation.
- **Rationale:** A hash-chained, append-only ledger's own integrity guarantee
  is exactly what makes this narrow — a mechanic-tier or even an
  implementor-tier dispatch correctly refused to hand-edit the chain rather
  than risk silently breaking its own tamper-evidence property.
- **Assignment (if accepted):** design-tier dispatch once a direction is
  chosen.
- **Date:** 2026-08-19

### PO Decision — 2026-08-19

- **Decision:** Direction 1 — a new, explicitly-scoped amendment kind that
  lets a later event supersede a genesis event's stale `itemSha256` binding,
  mirroring the existing reachability-amendment pattern; the hash chain
  itself is never rewritten.
- **Rationale:** PO's direct choice between the item's two named directions.
- **Assignment:** Dispatch-ready — design-tier Goldfish designs the amendment
  schema/vocabulary, wires `check-backlog-state.mjs`'s `itemSha256` check to
  consult it, applies it to repair event 41, and closes this item on landing.
- **Date:** 2026-08-19

### Triage — closed 2026-08-19

- **Decision:** closed — resolved.
- **Rationale:** Direction 1 built as decided. `plugins/pipeline-core/lib/backlog-state.mjs`
  adds a new `item-hash-amendment` evidence kind mirroring the existing
  reachability-amendment pattern: a frozen per-sequence target registry
  (`ITEM_HASH_AMENDMENT_TARGETS`, pinned by entryHash) authorizes exactly
  event 41 and no other target; `resolveItemHashAmendmentOverlay` resolves a
  valid amendment's corrected hash for the checker to compare current item
  bytes against, and `check-backlog-state.mjs`'s `itemSha256` check now
  consults it. The genesis event's own bytes and the hash chain remain
  untouched — one new, correctly hash-chained `item-hash-amendment` event
  (sequence 459) supersedes the stale binding (commit
  `05c851b75f7ff4c1fa10c390aa20524fda4a31b8`; mechanism commit `ce1707cc`).
  `node plugins/pipeline-core/scripts/check-backlog-state.mjs` prints
  "Backlog state, transition ledger, closure evidence, and generated
  projections are valid." Two unrelated, pre-existing findings from a
  different, already-landed dispatch (a short-SHA `closure_commit` on
  `backlog/items/2026-08-19-publication-authority-lacks-execution-time-
  criticalproof-reverification.md`, and the ledger event that referenced it)
  briefly blocked a fully clean run mid-session; they were out of this
  item's scope and were not touched here, and were independently resolved
  by a separate fix (commit `6134ade9`).
- **Date:** 2026-08-19
