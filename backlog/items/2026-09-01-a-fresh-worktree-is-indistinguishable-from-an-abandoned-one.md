---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-worktree-indistinguishable-from-abandoned
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — a just-provisioned Agent-tool worktree satisfies every retirement condition identically to a genuinely abandoned one, so the retirement sweep cannot be wired into bootstrap until the two are distinguishable."
done_when: manual
source: "NVA-B-WTRETIRE, 2026-09-01: the dispatch that built planRegisteredWorktreeRetirement declined to wire it into the bootstrap sweep and named this as the reason (commit c352528f)."
---

# A freshly provisioned worktree is indistinguishable from an abandoned one

## What blocks what

`planRegisteredWorktreeRetirement` / `retireRegisteredWorktrees` now exist and
are tested (`c352528f`). They admit a registered worktree for retirement only
when all four conditions hold: not the main worktree, clean working tree, HEAD
contained in a local branch tip, and no lock file marking it live.

They are deliberately **not** wired into `runBootstrapWorktreeSweep`. The reason
is not caution in general; it is a specific, checkable overlap.

## The overlap

Condition 4 only protects a worktree someone ran `git worktree lock` on. Nothing
in this codebase locks a freshly provisioned Agent-tool worktree at creation.

And a fresh worktree is created by checking out an exact SHA — typically a
branch tip — so at the moment it exists it is: not the main worktree, clean,
its HEAD contained in a branch tip, and unlocked. **All four conditions, all
satisfied.** It becomes distinguishable from an abandoned worktree only once its
owning dispatch makes its first commit.

So wiring the sweep today would let one session's bootstrap delete another
session's just-provisioned worktree, in the window before that dispatch has done
any work. That is the same unattended-automation-meets-concurrent-dispatch shape
as the 2026-08-25 incident recorded in `CLAUDE.md` — where a self-heal step ran
`git checkout --detach` against a shared checkout and detached a live HEAD
mid-session — except that this one deletes rather than moves.

## Two candidate remedies, not pre-selected

- **Lock at creation.** Whatever provisions an Agent-tool worktree locks it, and
  releases the lock when the dispatch ends or is reaped. This makes condition 4
  mean what the retirement logic already assumes it means. The cost is that a
  truncated dispatch leaves a locked worktree that now needs its own reaping —
  which is the original problem displaced, unless the lock carries an owner and
  a timestamp.
- **A grace period.** Decline retirement for any worktree younger than some
  interval. Simple, needs no coordination with whatever creates worktrees, and
  degrades safely. But it is a heuristic: a dispatch that runs longer than the
  grace period without committing is still exposed, and picking the interval is
  guesswork without data on how long dispatches run before their first commit.

The two are not exclusive; a lock with a grace-period fallback for unlocked
worktrees may be the honest answer.

## Why this is filed rather than fixed

The retirement mechanism is worth having even unwired: it is callable, tested,
and a session can use it deliberately. What is not safe is running a deletion
path unattended at every bootstrap while it cannot tell a new worktree from a
dead one. Filing the gap keeps the two decisions separate — building the
mechanism, and licensing it to run on its own.

## Acceptance criteria

- A fresh, in-use worktree is reliably distinguished from an abandoned one, by
  a mechanism whose failure mode is declining to retire rather than retiring.
- The chosen mechanism handles a truncated dispatch: whatever marks a worktree
  live must not mark it live forever.
- Only then is `planRegisteredWorktreeRetirement` wired into
  `runBootstrapWorktreeSweep`, with a test that a just-created worktree is
  declined.
