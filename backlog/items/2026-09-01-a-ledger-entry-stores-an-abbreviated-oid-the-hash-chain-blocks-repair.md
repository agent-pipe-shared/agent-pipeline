---
schema: pipeline.backlog-item.v1
id: pipeline.a-ledger-entry-stores-an-abbreviated-oid-the-hash-chain-blocks-repair
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Measured 2026-09-01 while running check-backlog-state.mjs before a ledger commit: two of its 22 DRIFT lines are one surviving violation of a rule backlog/README.md already documents as a class."
---

# One ledger entry stores an abbreviated OID, and the hash chain blocks repairing it in place

## This reports a surviving instance, not a new class

`backlog/README.md` already documents this failure mode, in these words: "An
abbreviated SHA looks correct to a human reviewer and bakes a schema violation
straight into the hash chain." The rule and its rationale are recorded. What is
not recorded is that one such entry is still in the ledger, and that the ordinary
repair is unavailable for it.

## What was measured, 2026-09-01

`node plugins/pipeline-core/scripts/check-backlog-state.mjs` prints 22 `DRIFT`
lines and then declares the state valid. Two of those lines are the same defect
seen from two angles:

    DRIFT ledger event 403: evidence.commit must be a full lowercase Git commit OID
    DRIFT items: pipeline.codex-read-only-steps-escalate-individually-instead-of-once
                 closure_commit must equal its final ledger evidence.commit

Ledger sequence 403 (`at: 2026-08-11`, `to: closed`) records
`evidence.commit: "181b7730"` — eight characters. The item's frontmatter records
the full `181b7730c9d6a7ca87a5df108a5b4da3447aa0e6`. Same commit, recorded at two
lengths; the equality check compares bytes.

The remaining 20 DRIFT lines are the accepted 2026-07-19..2026-07-22 batch of
unreachable historical commits, which the checker labels as known.

## Why the ordinary repair does not apply

`backlog/transitions.ndjson` is an append-only hash chain: each entry carries
`previousHash` and `entryHash`. Editing sequence 403's `evidence.commit` in place
changes its `entryHash` and invalidates `previousHash` on every entry after it.
The tamper-evidence property that makes the ledger worth having is exactly what
makes this entry unrepairable by editing.

`backlog/README.md` names the correct route for a committed bad reconciliation —
`planBacklogEvidenceAmendment`'s evidence-amendment machinery
(`plugins/pipeline-core/lib/backlog-state.mjs`, `EVIDENCE_AMENDMENT_SCHEMA`).
Whether that machinery covers this case, an abbreviated-but-correct OID rather
than a wrong one, has not been established and is the first thing to check.

## Directions

1. Amend via the existing evidence-amendment path, if it covers this shape.
2. Append a superseding entry at the head, which needs a supersession shape the
   schema may not currently have.
3. Accept it on the record and teach the checker to recognise this specific
   entry as known-and-accepted, the way the historical batch already is.

## Why it is worth an item at all, given DRIFT never blocks

Because a genuine, repairable inconsistency is sitting inside 21 lines of
permanent accepted noise, in output a reader is being trained to scroll past.
That is how a real signal gets missed. Whichever direction is taken, the goal is
that the checker's DRIFT output ends up either empty or composed entirely of
things somebody decided to accept deliberately.

## Constraint on any fix

It must not weaken the check. A checker taught to accept abbreviated OIDs
generally would stop catching the class of error that produced this one — which
is the class `backlog/README.md` exists to warn about.
