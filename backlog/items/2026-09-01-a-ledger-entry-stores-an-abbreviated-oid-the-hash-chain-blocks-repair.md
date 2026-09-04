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

## Triage, 2026-09-03 — the question is answered by measurement; the item stays open, narrowed

Direction 1 is established as unavailable, by live invocation rather than by
reading the schema (`NVA-B-LEDGEROID-1`, commit `75312525`; transcript at
`backlog/evidence/2026-09-02-nva-b-ledgeroid-1-amendment-dryrun.txt`):

- `planBacklogEvidenceAmendment` refuses this item outright.
  `plugins/pipeline-core/lib/backlog-state.mjs:1292` hard-codes
  `id !== "pipeline.source-available-commercial-licensing"` as a blocking
  error, evaluated **before** any OID-shape reasoning. A dry-run with both
  commits set to the full, correct OID returned that single error.
- Even a widened authorization could not clear the finding.
  `validateTransitionLedger` checks every non-`hashRescope` event's own
  `evidence.commit` format unconditionally, and the planner only ever appends
  a trailing event — it never edits an existing one. Sequence 403's abbreviated
  value is therefore permanent. That is the append-only hash chain working as
  designed, not a second defect.

Two corrections to the record, both surfaced by that dispatch:

1. The prior **closed** item
   `pipeline.ledger-event-403-has-a-short-hash-evidence-commit` (2026-08-12)
   already covers this exact entry. This item is a re-filing of it. Its Triage
   attributed the gap to `closure_repository: self` vs `project:` scope; that
   is wrong — the refusal is a single hard-coded item-id allowlist, unrelated
   to `closure_repository`.
2. A second, more general amendment shape exists
   (`pipeline.backlog-evidence-amendment.v1`, validated by
   `validateBacklogEvidenceAmendment`) but **no planner anywhere constructs
   one** for this ledger. Direction 1 therefore fails for two independent
   reasons, not one.

**Why this stays open:** the two DRIFT lines are still printed on every
`check-backlog-state.mjs` run and still have to be read past by every human and
agent who runs it. What remains is Direction 3 alone — teach the checker to
classify this entry as known-accepted, the way the 20-line 2026-07-19..22
historical batch already is. The item is narrowed to that; Directions 1 and 2
are closed as unavailable.

## 2026-09-03 — the amendment route is measured and closed, with one question left open

Dispatch `NVA-B-LEDGEROID-2` was sent to answer one question first: can the
repository's own append-based amendment mechanism express this repair? It reached
that answer and was then lost to a machine outage before reporting. Its raw
captures survived and are tracked; the determination written from them is
`backlog/evidence/2026-09-03-ledger-oid-403-determination.md`. **No ledger write
was made.**

**The answer is no, and it is authorization rather than mechanism.**
`planBacklogEvidenceAmendment` refuses event 403 with "evidence amendment: only
the SNT-1 licensing item is authorized", and the source confirms it —
`plugins/pipeline-core/lib/backlog-state.mjs:1292` compares the item id against a
single hard-coded value.

That closes the route as a matter of fact and reframes it as a decision. An
append-based path that can amend what a hash-chained event attests is an
integrity escape hatch; widening its authorization from one item to a class is a
PO-level call, not a repair, and doing it inside the record whose whole value is
that it cannot be quietly rewritten is the least appropriate place to do it
casually.

**One question is open and was never reached.** The suite output names a second,
different path — `applyBacklogItemHashRescopeAmendment`, covered by `CBS09` and
`CBS10`. Whether it applies to an abbreviated `evidence.commit` or only to the
archival-pin defect its tests describe is unestablished. `CBS10`'s own shape is a
caution: that path refuses while any unrelated finding is outstanding, and this
ledger carries twenty accepted historical ones. Any resumption starts there.

**Confirmed along the way:** the two OIDs are the same commit, so this is a
formatting defect inside a valid chain rather than a mismatch. `CBS08` shows a
tampered `previousHash` is classified `INTEGRITY` and blocks — the chain's
tamper-evidence is intact.

**Named so nobody reaches for it:** setting the item's `closure_commit` to the
abbreviated value would turn both DRIFT lines green by corrupting the correct
record to match the incorrect one. It is the cheapest-looking fix and the only
destructive one.
