# ADR-0068: merging two parallel sprints' backlog ledgers — one active chain, archived siblings, and status-neutral amendments bound by entry hash

> Agent-Pipeline · Sprint Nova · as of 2026-08-27

**Status:** accepted (2026-08-27, PO instruction during the `sprint_phoenix` merge close-out:
two sprints running in parallel and merging later is a NORMAL mode of work, and the Pipeline
must support it — a general capability, not a local patch for the amendments this merge hit).

**Closes** `backlog/items/2026-08-27-the-pipeline-cannot-merge-two-parallel-sprint-ledgers.md`
and, through it, `backlog/items/2026-08-27-po-decision-bs26-unsatisfiable-under-the-phoenix-ledger-split.md`.

**Governs:** plugins/pipeline-core/lib/backlog-state.mjs, plugins/pipeline-core/scripts/check-backlog-state.mjs, plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs

## Context

`backlog/transitions.ndjson` is a hash-chained ledger: every event carries `sequence`,
`previousHash` and `entryHash`, so the chain admits exactly one continuation. Two sprints
working the same backlog in parallel each produce a valid continuation of the same prefix.
At merge time both are internally consistent and they cannot both be the chain. There is no
union operation, and no defined answer for what happens to the losing side.

The `sprint_phoenix` merge turned that gap into a wall, measured rather than argued:

- The two chains share a prefix through sequence 144 and diverge after it.
- Appending one side's entries to the other re-sequences them and — because the LAST event
  for an item defines that item's status — silently makes the appended side authoritative for
  every item it touches. A data merge performing a state change.
- Keeping them separate (what the merge did: Nova active, Phoenix preserved verbatim in
  `backlog/transitions-phoenix-history.ndjson`) preserves the bytes but leaves the second
  chain validated by nothing.
- Phoenix's 38 `pre-public-core-reachability-amendment` events could not be migrated at all.
  Appending them took `check-backlog-state.mjs` from 13 findings to 73 — sixty new, none
  resolved.

### The specific defect behind those sixty findings

A reachability amendment repairs the *evidence* of a historical event: it proves the event's
`evidence.commit` content is still reachable, without rewriting the event and without changing
any item's status. It is by construction status-neutral. But the ledger schema forces every
event to carry `from`/`to`, and two places in `backlog-state.mjs` disagree about what those
fields mean for an amendment:

| Where | What it demands of an amendment's `from`/`to` |
|---|---|
| `validateTransitionLedger` chain validation (`backlog-state.mjs:860`, `:877`) | must equal the item's **current** prior status |
| supersession recognition (`backlog-state.mjs:821-822`) | must equal the **historically pinned** `status` in `PRE_PUBLIC_CORE_REACHABILITY_TARGETS` |
| `planPrePublicCoreReachabilityRepair` (`backlog-state.mjs:1497`, `:1523-1524`) | refuses unless the item still *sits* at the pinned status, and writes that pinned status |

While an item has not moved since the amendment was written, both readings coincide and
nothing surfaces the contradiction. As soon as a second line advances that item, they are
mutually unsatisfiable and the amendment becomes unappendable. Measured on this merge: of the
38 pinned targets, 18 still match and **20 have moved on** — every one of them a legitimate
forward step Nova performed (`in_progress → closed`, `open → deferred`). Meanwhile all 38
target events are still byte-identical in the active chain (38/38 bound by `entryHash`), which
is precisely what makes migrating them legitimate: the history being repaired is untouched;
only the item's present status has advanced.

The same shape appears a second time, independently: ledger event 644's
`item-hash-rescope-amendment` pins the pre-Triage bytes of a backlog item
(`itemSha256: 5031e5be…`). The merged item file now hashes to `4c74f9ea…`, so the pin no longer
binds and `check-backlog-state.mjs` reports a FAIL. An amendment pinning a *content* hash breaks
under a merge for exactly the reason an amendment pinning a *status* does.

## Decision

### D1 — One active chain; every other chain is archived, and validated

Exactly one chain is `backlog/transitions.ndjson`. Any other chain merged into the repository is
archived as `backlog/transitions-<origin>-history.ndjson`, byte-identical, retaining its original
hashes. Which side stays active is a PO decision per merge, not a rule this ADR fixes.

An archived chain is not write-once-and-forget: `check-backlog-state.mjs` validates the internal
integrity of every `backlog/transitions-*-history.ndjson` it finds — sequence continuity,
`previousHash`/`entryHash` chaining, event shape. It deliberately does NOT validate them against
current item state: an archived chain describes a past that current items are no longer required
to agree with. A preserved chain nothing checks is data nobody can trust later.

### D2 — An amendment is status-neutral and binds its target by entry hash

This is the core of the ADR and the part that generalizes.

An amendment (`pre-public-core-reachability-amendment`, `reachability-amendment`,
`item-hash-amendment`, `item-hash-rescope-amendment`) asserts something about an *earlier event*.
It asserts nothing about the item's status. Therefore:

1. It MUST satisfy `from === to` — the existing chain rule (`:877`) already says this; it becomes
   the single rule rather than one of two competing ones.
2. Those values MUST equal the item's **current** status at that point in the chain. This keeps
   `validateTransitionLedger`'s chain check (`:860`) satisfiable no matter how far the item has
   advanced.
3. Its target binding is `supersedesEntryHash` resolved **by hash lookup**, not by indexing
   `events[supersedesSequence - 1]`. The entry hash is immutable and position-independent;
   the sequence number is neither, and any merge that re-sequences breaks a positional binding
   by construction.
4. The `status` frozen in the amendment registries stays as documentation of what the historical
   event recorded. It is **no longer a precondition on the item's present state.**

Point 4 removes no protection. The cryptographic binding to the exact historical event is
`supersedesEntryHash` (plus `target.id === event.id` and the reference/`referenceSha256` checks);
the status comparison guarded nothing that those do not already guard, and its only observable
effect was to forbid legitimate progress on the other line.

### D3 — Migrating an amendment re-issues it; that is not authoring false history

An amendment carried from an archived chain into the active one is re-issued: new `sequence`,
new `previousHash`, new `entryHash` (unavoidable — any append changes all three), and `from`/`to`
set to the item's current status per D2.

This was previously refused as "authoring amendment events Phoenix never wrote", and under the
old reading that was right, because `from`/`to` were being read as a historical claim. Under D2
they are not a claim at all — they are how a status-neutral event spells "changes nothing". The
historical assertion lives entirely in `supersedesEntryHash` and `referenceSha256`, and migration
carries both across unchanged. The original events remain byte-identical in the archived chain.

### D4 — A content pin can be re-bound by a further amendment

When a merge legitimately changes an item's bytes, the `itemSha256` pin recorded by an earlier
repair no longer binds. The defined resolution is to append a further
`item-hash-rescope-amendment` re-binding the pin to the current content — not to weaken or
suppress the check. Consecutive rescope amendments against the same `amendsSequence` are
permitted and the LAST one governs; the pin's purpose (proving the repair event belongs to this
item) survives, while a merge stops being able to strand it permanently.

### D5 — Status convergence is a rule, not an artifact of append order

Where both lines moved the same item, the merged status is decided explicitly. The active chain's
terminal status governs; the archived chain records what the other line believed. No status is
ever established by which chain happened to be appended second — which is what D2 makes
structurally impossible for amendments, and what D1 makes explicit for ordinary events by
refusing to interleave chains at all.

## Consequences

- The 38 Phoenix reachability amendments become migratable under one defined semantics — all of
  them, not the 18 that happened not to have moved. BS26 and `backlog-state-check` resolve.
- Amendment target resolution stops depending on physical position anywhere in the module.
  Assertions that index the real ledger by sequence number (`backlog-state.test.mjs` BS25/BS26)
  are rewritten against `entryHash`, which is what they always meant.
- A future parallel-sprint merge has a defined procedure rather than a judgment call per event.
- Accepted cost: a migrated amendment's `entryHash` differs from the one the other line issued.
  Cross-chain identity of an amendment is therefore established by `supersedesEntryHash` +
  `referenceSha256`, never by `entryHash`. Anything that pinned a migrated amendment's own entry
  hash across the merge boundary would need re-pinning; nothing does today.
- Not addressed here: merging two chains' *ordinary* status events into one interleaved sequence.
  D1 deliberately forbids it. If a future merge needs it, it is a separate decision with a
  materially larger blast radius.

## Follow-up

- ADR numbering itself collided in this merge (0061–0066 each exist twice, once per line).
  Same class of problem — parallel allocation of a shared sequential namespace — but a separate
  concern from the ledger, tracked separately.
