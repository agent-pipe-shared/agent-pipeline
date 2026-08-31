---
schema: pipeline.backlog-item.v1
id: pipeline.a-deferred-item-is-terminal-so-a-live-defect-can-be-parked-invisibly
type: defect
owner: pipeline
status: open
created: "2026-08-31"
sprint: nova-b
source: "Measured 2026-08-31 during 0.6.0 release preparation, while verifying that only Nova B / Alfred / Batman / Nightwing items remained open."
---

# A `deferred` backlog item is terminal in the ledger, so a live defect can be parked invisibly

## Description

`FORWARD_TRANSITIONS` in `plugins/pipeline-core/lib/backlog-state.mjs` (near
line 54) defines successors only for `open` (`in_progress`, `rejected`,
`deferred`) and `in_progress` (`closed`):

```js
const FORWARD_TRANSITIONS = Object.freeze({
  open: Object.freeze(["in_progress", "rejected", "deferred"]),
  in_progress: Object.freeze(["closed"]),
});
```

`deferred` and `rejected` have no entry in this table at all, so the ledger
records no path back out of either. A `deferred` item can never be reopened,
re-sprinted into a working window, or closed through the ledger — this is not
an oversight in one code path, it is the whole transition model: the module's
own comment above the table (lines ~48-53) confirms "no path back out of a
triage disposition, matching what backlog/README.md documents today."

The consequence: **the backlog's own sprint-assignment gate only fails on
`undeclared and open`** (`check-backlog-sprint-assignment.mjs`'s
`undeclared and open (failing): 0` line). A `deferred` item is exempt from
that check by construction — deferral is a status, not an `open` item with a
missing declaration — so a terminally-deferred item describing a real, still
unfixed defect is invisible to every mechanical check in the backlog tooling
while remaining a real defect in the code.

## Verification against the four items named as the trigger for this filing

Each was read fresh (not inherited from prior characterization) and checked
against its cited code site as of this measurement:

1. **`backlog/items/2026-08-08-po-authority-decision-offers-a-prd-option-that-is-always-unavailable.md`**
   — `status: deferred`, confirmed. The defect it describes is CONFIRMED STILL
   PRESENT: `plugins/pipeline-core/scripts/pipeline-state.mjs:6536` still has
   the static literal `selectedCandidate: "prd", status: "unavailable"`,
   emitted unconditionally rather than measured.
2. **`backlog/items/2026-08-08-the-gate-strength-override-route-is-advertised-but-never-offered.md`**
   — `status: deferred`, confirmed. The defect it describes is CONFIRMED STILL
   PRESENT: `plugins/pipeline-core/hooks/guard-gate-strength.mjs:668` still
   reads `if (consumed.status === "absent" || consumed.status === "replan")`
   with no `else` branch, so any other `consumed.status` value leaves
   `overrideGuidance` empty and the promised override route unprinted.
3. **`backlog/items/2026-08-08-the-ledger-reconciler-writes-before-the-items-are-validated.md`**
   — `status: deferred`, confirmed. The defect it describes is CONFIRMED STILL
   PRESENT: `plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs`'s
   `readItems()` (lines ~88-100) checks only `parsed.item?.metadata?.id` and
   never calls `validateBacklogItem()` before an item is queued for a ledger
   write.
4. **`backlog/items/2026-08-17-privacy-review-critic-dispatch-was-time-boxed-not-exhaustive.md`**
   — `status: deferred`, confirmed (`type: workflow-improvement`, not
   `defect`; its own Proposal asks for a full exhaustive privacy-review Critic
   pass before the next real push of the branch it names — that trigger
   condition is process-level and was not independently re-verified against
   current push history here, since it is a scheduling condition rather than a
   code site).

All four items are held as `status: deferred`, and per point 1 above none of
them has a mechanical path back to `open`, `in_progress`, or `closed` through
the ledger — each requires a human to hand-author a new decision, outside the
tooling this item is about.

## Consequence

The sprint-assignment gate (`check-backlog-sprint-assignment.mjs`) and the
backlog-state gate (`check-backlog-state.mjs`) both validate structure and
transitions, never whether a `deferred` item's underlying code defect has
since been fixed or is still live. Three of the four items above (all
`type: defect`) describe real, currently-unfixed problems in guard/state
machinery that carry no mechanical reminder to revisit them — they surface
only if a human or agent happens to re-read them, exactly as this filing did.

This is the inverse shape of
`backlog/items/2026-08-27-resolved-backlog-items-can-keep-status-open-indefinitely.md`:
that item is about a RESOLVED item that can stay `open` forever because
nothing forces closure; this item is about a LIVE, unresolved defect that can
be parked in `deferred` forever because nothing forces revisiting it. Both
gaps share the same root cause — the ledger's transition model and the
mechanical gates built on it track *shape* (does every open item declare a
sprint?) rather than *truth* (does the code still have the bug the item
describes?).

## Affected artifact

- `plugins/pipeline-core/lib/backlog-state.mjs` — `FORWARD_TRANSITIONS`
  (no successor entries for `deferred`/`rejected`).
- `plugins/pipeline-core/scripts/check-backlog-sprint-assignment.mjs` — only
  fails on `undeclared and open`, exempting `deferred` items from the
  gate entirely.
- `backlog/README.md` — Status lifecycle section, which already documents
  `deferred`/`rejected` as terminal; this item is about the mechanical
  consequence of that documented design, not a contradiction of it.

## Proposal

Owner: PO. Options ordered by cost; this item deliberately does not
pre-decide, and does NOT propose reopening any of the four cited `deferred`
items by hand-editing the ledger.

1. **Cheapest: a periodic reminder, not a gate change.** Add a check (or a
   close-block/session-bootstrap step) that reports the count and age of
   `deferred` `type: defect` items, so a human periodically re-triages them —
   no new ledger transition, no change to `FORWARD_TRANSITIONS`.
2. **Medium: a sanctioned reopen transition.** Add `deferred -> open` (and
   possibly `rejected -> open`, separately decided) to `FORWARD_TRANSITIONS`,
   gated by the same kind of explicit, evidenced ledger write the other
   transitions already require — never a hand edit to `transitions.ndjson`.
   This changes the transition model itself and needs its own design pass
   (what evidence justifies a reopen, who may trigger it).
3. **Most expensive: fold `deferred` `type: defect` items into the
   sprint-assignment gate's failing set** — e.g. a `deferred` defect older
   than some threshold with no revisit condition met counts toward
   `undeclared and open (failing)` or a sibling failing category. This is the
   only option that closes the invisibility gap mechanically rather than by
   reminder, but it also most changes the meaning `deferred` currently has
   (a stable, review-exempt parking state) and should not be adopted without
   the PO weighing that tradeoff explicitly.
