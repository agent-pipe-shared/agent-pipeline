# Ledger event 403's abbreviated OID — determination, no ledger write

Dispatch `NVA-B-LEDGEROID-2` was briefed with two acceptable outcomes: repair the
entry through an existing append-based mechanism, or establish that no such route
exists and record why. It reached the decisive measurement and was then lost to a
machine outage before writing its report. The raw captures survived and are
tracked alongside this file; this determination is written from them.

**No ledger write was made, and none should be made on the strength of what is
known today.**

## The two OIDs are the same commit

Confirmed before treating this as a formatting defect rather than a genuine
mismatch:

- ledger event 403 records `evidence.commit: "181b7730"` — eight characters
- the item's frontmatter records
  `closure_commit: 181b7730c9d6a7ca87a5df108a5b4da3447aa0e6`

Same commit, recorded at two lengths. The checker's equality test compares bytes,
so it reports both halves of the same fact: a schema violation on the ledger side,
and a `closure_commit` mismatch on the item side.

## The evidence-amendment mechanism cannot express this repair

`planBacklogEvidenceAmendment` was invoked against event 403 and refused:

```
planBacklogEvidenceAmendment ok: false
errors: [ "evidence amendment: only the SNT-1 licensing item is authorized" ]
```

Confirmed at source rather than from the error string alone —
`plugins/pipeline-core/lib/backlog-state.mjs:1292`:

```js
if (id !== "pipeline.source-available-commercial-licensing") errors.push("evidence amendment: only the SNT-1 licensing item is authorized");
```

The mechanism exists, and it is hard-scoped to exactly one item id. This is the
briefing's stop condition 3 firing precisely as written: the mechanism exists but
is scoped to something else, and stretching it would change its meaning.

**Widening that authorization is not a repair, it is a decision.** The scope is
an integrity control: an append-based amendment path that can rewrite what a
hash-chained event attests is exactly the kind of escape hatch that should be
authorized per case rather than per class. Opening it to a second item — however
obviously benign this one looks — converts a one-off exception into a general
capability, and does so inside the record whose value is that it cannot be
quietly rewritten.

## What was NOT established, and must be before anyone proceeds

The suite output shows a **second, different** amendment path:
`applyBacklogItemHashRescopeAmendment`, covered by `CBS09` ("succeeds when the
only outstanding finding is the stale pin it resolves") and `CBS10` ("still
refuses when an unrelated finding is also outstanding").

The stopped dispatch never reached it. Whether it applies to an abbreviated
`evidence.commit`, or only to the archival-pin defect its test names, is open. It
should be the first question of any resumption — and CBS10's shape is a warning
in itself: that path refuses while any unrelated finding is outstanding, and this
ledger currently carries twenty.

## Current state, measured

`check-backlog-state.mjs` exits 0 and declares the state valid, printing 22 DRIFT
lines to stderr:

- **20** are the accepted `2026-07-19..2026-07-22` batch of unreachable
  historical commits, which the checker labels as known.
- **2** are this defect, seen from both sides — the schema violation on event 403,
  and the resulting `closure_commit` inequality on
  `pipeline.codex-read-only-steps-escalate-individually-instead-of-once`.

`node --test plugins/pipeline-core/scripts/check-backlog-state.test.mjs` passes
15/15, including `CBS08` — a tampered `previousHash` is `INTEGRITY` and blocks,
never appearing as drift. The chain's tamper-evidence is intact; this entry is a
schema defect inside a valid chain, not a broken chain.

## The route that must not be taken

Setting the item's `closure_commit` to the abbreviated value would turn both DRIFT
lines green. It would do so by corrupting the correct record to match the
incorrect one, and it would leave the ledger asserting an eight-character OID as
though that were the schema. It is named here because it is the cheapest-looking
fix and the only genuinely destructive one.
