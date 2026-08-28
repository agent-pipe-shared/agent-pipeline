---
schema: pipeline.backlog-item.v1
id: pipeline.a-registered-but-abandoned-worktree-is-never-retired
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
source: "NVA-VTPGATE-1 stopped on it live, 2026-08-28"
---

# A registered but abandoned worktree survives every sweep, and the next dispatch stops on it

## What happened

`NVA-VTPGATE-1` (`goldfish-deep`, shared checkout) ran its briefed first-action
worktree check and stopped before doing any work:

```
worktree <repo>                                    HEAD d350cbd4  branch feat/sprint-nova-codex-v046
worktree <repo>/.claude/worktrees/agent-ad07e848fb796e87b   HEAD f7bc54c4  detached
```

Measured afterwards by the dispatcher: the second worktree was created on
2026-08-26 (`f7bc54c4`, 2026-08-26 21:05), its working tree was clean
(`git status --short` empty), and it held no commit that was not already
contained in the branch (`git log f7bc54c4 --not HEAD` empty). Nothing was
running in it. It had simply outlived the Agent-tool dispatch that created it,
by two days and several sessions.

The dispatch was correct to stop, and the stop cost a full dispatch cycle.

## Why the existing sweep does not catch it

`pipeline.stale-worktree-directories-accumulate-with-no-sweep` is closed by
`f1d9fe45` (NVA-SCRATCHSWEEP-1), which added
`planOrphanWorktreeDirectories`/`retireOrphanWorktreeDirectories` and wired
`runBootstrapWorktreeSweep` into `pipeline-start-preflight.mjs`. That sweep
removes a directory only when **`git worktree list` no longer knows it AND** it
carries a dangling worktree `.git` pointer file; any ambiguity leaves it alone.

This case is the exact complement: `git worktree list` **did** know it. It was a
registered, live-by-git, abandoned-by-everyone-else worktree. The existing sweep
declines it by design, not by defect — which is why closing that item did not
close this one, and why the two want different remedies.

## Why it is worth a rule rather than a one-off deletion

Deleting this one directory took a single `git worktree remove` and fixed
nothing durable. Two things make it recur:

1. Nothing binds an Agent-tool worktree's lifetime to the dispatch that asked for
   it. When the dispatch ends — normally or by truncation — the worktree stays
   registered.
2. `CLAUDE.md`'s own worktree guidance makes `git worktree list` load-bearing:
   an unexpected entry is a documented hard stop for a shared-checkout dispatch.
   So every abandoned entry is a live trip-wire for every later dispatch, not
   merely clutter.

## Proposal (confirm before assuming)

Extend the bootstrap sweep with a second, narrower branch for a REGISTERED
worktree, admitting retirement only on all of: it is not the main worktree; its
working tree is clean; its HEAD is an ancestor of (or equal to) a local branch
tip, so nothing unique would be lost; and no lock file marks it live. Anything
short of all four leaves it alone, same fail-open posture as the existing
branch. The alternative — having the dispatcher clean up after each isolated
dispatch — does not cover the truncation case, which is when leftovers are most
likely.

## Triage, 2026-08-28

- **Decision:** accepted, unassigned, sprint `nightwing`. Not a candidate
  blocker — the immediate instance was cleared with one `git worktree remove`
  and the delivery proceeded. Filed because the remedy is a rule, not a
  deletion, and because the cost is asymmetric: the leftover is invisible until
  a dispatch stops on it, and then it costs a whole dispatch cycle. Whoever
  picks up `pipeline.stale-worktree-directories-accumulate-with-no-sweep`'s
  successor work should take this branch with it; the two belong in one sweep
  even though the closed item's fix deliberately does not cover this case.
