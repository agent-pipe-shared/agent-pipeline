---
schema: pipeline.backlog-item.v1
id: pipeline.stale-worktree-directories-accumulate-with-no-sweep
type: defect
owner: pipeline
status: open
created: 2026-08-27
source: "Handover-rotation extraction pass over Phoenix checkpoint 67, 2026-08-27"
---

# `.claude/worktrees/` accumulates stale directories from past Workflow runs, and nothing sweeps them

## What happens

Worktree-isolated dispatches leave their directories behind. Over many runs
these accumulate, and no mechanism removes them. Observed and recorded in
Phoenix checkpoint 67 (2026-08-19):

> `.claude/worktrees/` carries a large number of stale worktree directories from
> past Workflow runs — worth a cleanup pass but not a push blocker

Noted at the time, never filed, and therefore about to be rotated out of the
handover along with the checkpoint that recorded it.

## Distinct from the item that already exists

`backlog/items/2026-08-11-worktree-isolated-dispatch-leaves-an-untracked-dir-that-blocks-verify.md`
covers ONE dispatch's leftover directory making a verify run fail on a dirty
working tree — an acute, single-run problem with a known immediate remedy.

This is the chronic version: nothing ever sweeps them, so they pile up across
sessions. The two share a cause and have different remedies (one needs
cleanup-after-run, the other needs a sweep), so closing the older item would not
close this.

## Why it is worth filing rather than just deleting them

Deleting the directories once is a minute's work and would fix nothing durable —
they come back. The gap worth recording is that the Pipeline has a documented
scratch-cleanup design
(`backlog/items/2026-08-08-the-scratch-cleanup-mechanism-exists-but-no-event-calls-it.md`
— built, wired to no event) whose "sweep orphans on a later bootstrap" shape is
exactly what this needs. These two are plausibly one fix, and whoever picks up
the scratch-cleanup item should be told this directory belongs in its scope.

## Proposal

Fold into the scratch-cleanup wiring rather than building a second sweeper:
`retireOrphanScratchDescriptors` in
`plugins/pipeline-core/lib/session-cleanup-recovery.mjs` already has the right
lifecycle shape. Confirm before assuming — the worktree lifecycle is governed by
`worktree-lifecycle.mjs` and may want its own sweep for good reasons.

## Triage

- **Decision:** open, unassigned. Low urgency on its own; the point of filing it
  is so it is in scope when the scratch-cleanup item is picked up, rather than
  rediscovered later as a separate surprise.
