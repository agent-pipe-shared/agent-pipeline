---
schema: pipeline.backlog-item.v1
id: pipeline.resolved-backlog-items-can-keep-status-open-indefinitely
type: defect
owner: pipeline
status: open
created: 2026-08-27
sprint: nova
source: "NVA-BLRECONCILE-1, 2026-08-27 — process-defect finding from the briefing that reported two same-day dispatches briefed against already-finished work"
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
