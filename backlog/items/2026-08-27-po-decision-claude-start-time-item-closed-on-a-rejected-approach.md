---
schema: pipeline.backlog-item.v1
id: pipeline.po-decision-claude-start-time-item-closed-on-a-rejected-approach
type: requirement
owner: pipeline
status: open
created: 2026-08-27
source: "Phoenix merge conflict resolution, dispatch PHX-ITEMS-2, 2026-08-26"
---

# PO decision: a Phoenix closure cites an approach the PO had explicitly rejected

## The conflict

`backlog/items/2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md`
came out of the merge with two irreconcilable records:

- **2026-08-12** — the PO explicitly rejected a hint-text-only solution for
  this item, in those terms ("not a hint-text-only stopgap").
- **2026-08-18** — the Phoenix line **closed** the item, citing exactly a
  hint-only implementation as sufficient.

## Why this is a PO decision and not a merge resolution

Nothing in the code, the merge base, or either branch's history settles it.
The question is whether a delivered thing met an acceptance bar — and the PO
is the one who set that bar. Either the 2026-08-12 position changed (then the
closure was right and the item stays closed), or the Phoenix closure was made
without knowledge of that decision (then the item reopens and the hint-only
work is a partial step, not a closure).

## The decision

Exactly two options:

- **(a) Stays closed.** Hint-only was accepted after all; the 2026-08-12
  position was superseded.
- **(b) Reopens as `open`.** The hint-only work is recorded as a partial step
  and the original bar is restated.

## Current state, chosen conservatively

The resolving dispatch kept `status: open`, preserved BOTH narratives verbatim,
and added an inline note stating the contradiction. It deliberately did not
pick a side. Nothing is lost either way; the item simply reads as unresolved
until this is answered.

## PO decision, 2026-08-27

**(a) — the item stays closed.** The PO was shown both records side by side
and decided that the 2026-08-12 position is superseded: the shipped hint-only
hook satisfies the item's core ask after all.

Applied to
`backlog/items/2026-08-05-claude-has-no-start-time-opt-in-adoption-path.md`:
status `open` → `closed`, carrying the Phoenix line's closure fields
(`closed_at: 2026-08-18`, `closure_commit: 88dc3ba6952f226ed4f9caa57bad982cb660a425`).

The 2026-08-12 decision text was deliberately left in that item rather than
removed. It is a true record of what was decided that day; a decision later
superseded is not a decision that never happened, and the item's history now
shows both in order with the outcome named.

## Triage

- **Decision:** answered by the PO on 2026-08-27 and applied to the subject
  item in the same session. Status stays `open` only until this change is
  committed: a `closed` item requires a `closure_commit`, and that commit
  cannot exist before the change it records. Closed in the follow-up commit
  that can name it.
- Was queued as PO-1 during the Phoenix merge and filed as a tracked item
  after two independent Critic reviews flagged that such obligations must not
  live only in the merge's scratch notes.
