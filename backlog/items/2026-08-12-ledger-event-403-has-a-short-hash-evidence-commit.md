---
schema: pipeline.backlog-item.v1
id: pipeline.ledger-event-403-has-a-short-hash-evidence-commit
type: defect
owner: pipeline
status: open
created: 2026-08-12
source: "Surfaced by the first genuinely clean (exact-binding) full verify.mjs run of the session, 2026-08-12, while triaging its check-backlog-state.mjs failure."
---

# `backlog/transitions.ndjson` event 403 recorded a short-hash `evidence.commit`, and the ledger is append-only

## What happened

`NVA-BL-71`'s dispatch closed
`backlog/items/2026-08-09-codex-read-only-steps-escalate-individually-instead-of-once.md`
and self-corrected its own `closure_commit` from a placeholder to the real
value, but wrote the SHORT form (`181b7730`) rather than a full 40-character
lowercase OID. `reconcile-backlog-ledger.mjs --activate` then recorded that
short value verbatim into `backlog/transitions.ndjson` event 403's
`evidence.commit` field.

`check-backlog-state.mjs` requires `evidence.commit` to be a full lowercase
Git commit OID (correctly — short hashes are not stable identifiers across
history rewrites or repacks). The ledger is append-only and hash-chained
(`entryHash`/`previousHash`), so event 403 cannot simply be edited in place
without breaking every subsequent event's chain.

## Current state, deliberately not "fixed" further

The item file's own `closure_commit` is set to the full OID
(`181b7730c9d6a7ca87a5df108a5b4da3447aa0e6`, verified via `git rev-parse`)
rather than reverted to match the ledger's short form, because the
alternative (matching the ledger) reproduces a WORSE cascading failure: the
item's own parse validation rejects a short `closure_commit`, which drops
the item out of `itemById` entirely, which then makes three otherwise-valid
ledger events (265, 402, 403) all report the unrelated-sounding "id does not
name a current backlog item". The full-hash version leaves exactly two
findings instead of five: `ledger event 403: evidence.commit must be a full
lowercase Git commit OID`, and the item/ledger cross-check `closure_commit
must equal its final ledger evidence.commit`.

## Direction, not a design

`check-backlog-state.mjs`'s own code (`plugins/pipeline-core/lib/backlog-state.mjs`)
already has an `isV2EvidenceAmendment`/`reachability-amendment` mechanism for
correcting historical ledger evidence without breaking the hash chain —
whether that mechanism (or an equivalent) can be used to append a correcting
V2 amendment event for event 403's `evidence.commit`, upgrading it from the
short form to the full OID, is the direction to investigate. If no such
mechanism currently reaches self-closures (`closure_repository: self`,
distinct from the `project:`-scoped amendment path the code appears to
support today), building the narrow extension is the alternative.

Separately worth doing regardless: `reconcile-backlog-ledger.mjs` should
normalize any `closure_commit` it reads to the full OID via `git rev-parse`
before writing a ledger entry, so this class cannot recur from a future
short-hash closure.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
