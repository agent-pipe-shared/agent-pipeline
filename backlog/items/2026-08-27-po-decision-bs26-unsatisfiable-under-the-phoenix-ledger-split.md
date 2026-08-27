---
schema: pipeline.backlog-item.v1
id: pipeline.po-decision-bs26-unsatisfiable-under-the-phoenix-ledger-split
type: requirement
owner: pipeline
status: open
created: 2026-08-27
source: "Phoenix merge, dispatch VFX3-BACKLOG plus direct verification, 2026-08-26"
---

# PO decision: assertion BS26 cannot pass under the ledger split this merge made

## Why the backlog suites are red

`backlog-state-tests` and `backlog-state-check` are the only two red suites in
an otherwise green verify run (468/470). One assertion, **BS26**, is
structurally unsatisfiable given how the Phoenix merge divided the ledger, and
it cannot be fixed without either reversing that division or silencing the
assertion. Neither is an implementation call.

## The mechanics, verified directly

- Phoenix's ledger carries 38 `pre-public-core-reachability-amendment` events
  (its sequences 182–219). They are structural repairs to ledger integrity,
  not feature/status history.
- Per the PO's rule for this merge, `backlog/transitions.ndjson` kept **Nova's**
  chain; Phoenix's entries went to `backlog/transitions-phoenix-history.ndjson`.
  All 38 are preserved there verbatim with their original hashes. **Nothing is
  lost** — an early dispatch report claiming "the merge dropped them" was
  wrong; both files were counted (38 in history, 0 in the active chain).
- BS26 loads the REAL repository ledger and indexes it by Phoenix's sequence
  numbers (`canonical.events[sequence - 1]`). In Nova's chain those positions
  hold entirely different events. The amendments are therefore not merely
  absent — they are **not applicable**: they repair events that, at those
  coordinates, are not the events they were written for.
- `planPrePublicCoreReachabilityRepair` also refuses to re-run: it requires
  "exactly its authorized 38 currently failing events", and in this tree those
  events are not failing.

## The decision — three options, all of which change something the PO decided

- **(a) Accept and mark BS26 not-applicable in this repository**, with a dated
  reason. Silences a real assertion, so it needs explicit approval.
- **(b) Adopt Phoenix's ledger chain as the active one** instead of Nova's.
  Reverses the merge's governing decision; large blast radius.
- **(c) Migrate the 38 amendments into Nova's chain** with remapped sequence
  numbers and recomputed hashes. The most work, and it means authoring
  amendment events for coordinates they were not written against — exactly the
  kind of plausible-looking-but-wrong ledger content that nothing downstream
  would catch.

## UPDATE 2026-08-27 — the PO chose (c), it was attempted, and it does not work

The PO decided to migrate the 38 amendments. A dispatch executed it, measured
the result, reverted cleanly and stopped. What it found changes the options.

**The dispatcher's pre-check was right but incomplete.** All 38 amendment
targets ARE present in Nova's active chain at the same sequence with the same
id and the same `supersedesEntryHash` — verified twice, zero mismatches. The
amendments target sequences 1–41, inside the prefix both chains share, so
their target bindings need no adjustment.

**The missed invariant: the amendments carry hardcoded `from`/`to` statuses.**
A sample amendment asserts `"from":"in_progress","to":"in_progress"`. For many
of the 38 items, Nova has since moved the status on — through work Phoenix
never saw. Appending the amendment then asserts a transition that contradicts
the item's current state.

**Measured, not inferred** — a controlled before/after run of
`check-backlog-state.mjs` against the exact same ledger bytes:

| | findings |
|---|---|
| before the migration | 13 |
| after appending all 38 | 73 |
| net | **+60 new, 0 resolved** |

BS26 does go green (55/55). It goes green at the cost of sixty new
violations — the local pass masks the regression the checker exposes in full.

The dispatch correctly refused to adjust `from`/`to` to make it fit: its brief
was a byte-identical append, and rewriting those fields would author
amendments Phoenix never wrote. It reverted `transitions.ndjson`, `STATUS.md`
and `index.json` to their exact HEAD bytes and stopped.

## The options as they now stand

- **(a) Migrate only the safe subset** — amendments whose target item has not
  changed status since. Honest, but BS26 likely stays red: it expects all 38.
- **(b) Mark BS26 not-applicable** with a dated reason. Now better supported
  than when first proposed: the amendments do not merely sit at the wrong
  coordinates, they contradict the current item states.
- **(c) Migrate with adjusted `from`/`to`** — authors amendment events Phoenix
  never wrote. Not recommended.
- **(d) Change `validateTransitionLedger`** so such amendments classify as
  DRIFT rather than FAIL. A larger intervention affecting every future ledger
  check.

## Original recommendation, for what it is worth

**(a).** The amendments repaired a specific historical defect on the Phoenix
line. That defect does not exist on Nova's chain, so the repair has nothing to
do there. But (a) switches off an assertion, and by the rule this whole merge
followed, that is the PO's call.

## Also red, and NOT part of this decision

The checker's remaining findings are **pre-existing, verified not assumed**:
the truncated commit OID at ledger event 403 (`181b7730`) is present in Nova's
ledger at `c181817f^1`, i.e. before the merge. A first guess that Phoenix had
introduced the strict OID check was wrong — that check exists on both branches.

## Triage

- **Decision:** open, owned by the PO. Was queued as PO-2 during the Phoenix
  merge. BS26 was left red; nothing silenced, nothing faked.
