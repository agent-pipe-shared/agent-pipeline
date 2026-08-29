---
schema: pipeline.backlog-item.v1
id: pipeline.resolved-backlog-items-can-keep-status-open-indefinitely
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nova
source: "NVA-BLRECONCILE-1, 2026-08-27 — process-defect finding from the briefing that reported two same-day dispatches briefed against already-finished work"
done_when: contains plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs pipeline.undeclared-is-fatal
---

# A resolved backlog item can keep `status: open` indefinitely, so a dispatcher only avoids re-briefing finished work by remembering to check

## Description

Nothing mechanical connects a backlog item to the commit(s) that resolve it.
Closing an item requires a human or agent to notice the item is done, edit
its frontmatter to `status: closed`, fill the closure fields, and run
`reconcile-backlog-ledger.mjs`. Until that happens the item keeps reading
`status: open` no matter how long ago the underlying work actually landed.
`docs/operating-model.md` and this repository's own rule already require
re-verifying an inherited "still open" claim (`git log` for the area) before
dispatching work on it — but that rule lives entirely in a human/agent's
memory of the process; no check enforces it, and no signal on the item
itself distinguishes "genuinely still open" from "resolved, just never
closed."

## Triggering situation

Twice on 2026-08-27, a dispatch was briefed from a backlog item reading
`status: open`, and discovered on arrival that the work was already done:

- **`NVA-PATHBIND-1`** — briefed against
  `backlog/items/2026-08-27-path-bound-fingerprints-break-across-windows-wsl-access.md`
  while it still read `status: open`. The two mechanisms it named were
  already fixed by commit `1858a21b` ("fix(authority): fold the WSL and
  Windows spellings of one checkout to one fingerprint",
  `NVA-FINGERPRINT-1`). The dispatch made zero production edits and
  correctly stopped rather than redoing finished work.
- **`NVA-SCRATCHSWEEP-1`** — briefed against
  `backlog/items/2026-08-27-stale-worktree-directories-accumulate-with-no-sweep.md`
  while it still read `status: open`. Commit `f1d9fe45` ("feat(scratch-sweep):
  give the built scratch-cleanup mechanism a real caller, and cover
  .claude/worktrees/") had already resolved half the item's premise by the
  time the dispatch arrived, so the dispatch found half its premise stale.

Both dispatches reported honestly rather than silently redoing the work, but
the cost was already paid: two deep-tier dispatches spent verifying,
rather than doing, already-finished work. Both resolving commits were
themselves the product of dispatches against the SAME items, in the SAME
session window, which never circled back to flip `status:` to `closed`
before a sibling dispatch was briefed from the stale copy.

## Affected artifact

`backlog/README.md` (status lifecycle, ledger reconciliation process);
`plugins/pipeline-core/scripts/reconcile-backlog-ledger.mjs` (only acts on
what an item's frontmatter already says; implements nothing, reviews
nothing); the dispatch-briefing process itself (whoever drafts a Goldfish
briefing from a backlog item currently has no mechanical prompt to re-check
liveness before naming the item as the task's premise).

## Proposal

Not designed here — this item records the defect, not its fix, per this
dispatch's own scope (a judgment-light closure/filing pass, not a design
task). At least one concrete direction worth exploring: a mechanical,
git-log-based staleness check that a dispatch-briefing tool (or a
pre-dispatch gate, analogous to `check-backlog-sprint-assignment.mjs`) runs
against the exact files/commits an `open` item's own body claims are
unresolved, flagging (not auto-closing) any item whose named files have
commits touching them since the item's `created` date — surfacing "this may
already be resolved, re-check before dispatching" as a structural nudge
instead of relying on memory alone. Other directions (a closure-linking
convention items can declare, a periodic sweep) are equally plausible and
were not evaluated here.

## Triage

- **Decision:** open, unassigned.

### Predicate note, 2026-08-29 — the mechanism exists but does not yet bind

A predicate of `path-exists plugins/pipeline-core/scripts/check-backlog-done-predicate.mjs`
was briefly declared here and reported satisfied. It was replaced, because a
`path-exists` on a file that already existed before this item was assessed can
never go from false to true — it is not falsifiable, and a predicate that
cannot fail measures nothing.

The checker genuinely is the right mechanism. Its STALE-OPEN class is exactly
this item's ask: an item whose remedy has landed is mechanically identified
instead of sitting `open` forever on nobody's word. It caught six such items in
a single day, including five whose fixes had landed hours earlier.

But the mechanism only reaches items that declare a predicate, and UNDECLARED
is reported without being fatal. As of 2026-08-29, 81 open items declare
nothing, so for those the original defect is untouched: they can still sit
`open` indefinitely with no mechanical challenge. The mechanism exists; it does
not yet bind.

The predicate therefore names the graduation rather than the mechanism: a
marker `pipeline.undeclared-is-fatal` in the checker, placed when UNDECLARED
on an open item stops being advisory. That is the point at which a resolved
item can no longer stay silently open, and it is reachable only once the open
backlog actually carries predicates — which is the work in progress now.
Making UNDECLARED fatal today would simply break the gate for 81 items nobody
has assessed yet.

## PO decision, 2026-08-29

**Decision:** run the campaign now — assign a real, judged `done_when`
predicate to all 81 currently-undeclared open items, then place the
`pipeline.undeclared-is-fatal` marker in `check-backlog-done-predicate.mjs`
and flip UNDECLARED to fatal for open items.
**Rationale:** PO chose "campaign now" over deferring or scoping to
nova/none-only, explicitly preferring to close the gap fully rather than
partially.
**How to apply:** dispatch a survey pass (same shape as the 27-item 0.6.0
survey this session) across all 81 items to determine, per item, whether it
is already resolved (close it) or genuinely open (assign a real, falsifiable
`done_when`) — then land the marker once every item carries one. This is a
large parallel campaign; scope it as its own dedicated Workflow wave, not
folded into the current 0.6.0 fix wave.
