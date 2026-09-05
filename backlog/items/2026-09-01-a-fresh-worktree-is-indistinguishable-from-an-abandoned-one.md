---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-worktree-indistinguishable-from-abandoned
type: defect
owner: pipeline
status: closed
created: 2026-09-01
closed_at: 2026-09-06
closure_repository: self
closure_commit: 05bdf6a9c6d775c978a6db8f13a0636f3d439a8d
closure_evidence: "backlog/items/2026-09-01-a-fresh-worktree-is-indistinguishable-from-an-abandoned-one.md"
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

## Progress, 2026-09-05 (dispatch NVA-B-WTLIVE-1)

**First two acceptance criteria met, landed, stands: `1ebf80d5`.** A fifth
`evaluateWorktreeCandidate` condition (gitdir `logs/HEAD` reflog age,
threshold derived from real `evidence/dispatch-record-*.json` inter-commit
gaps with a stated safety multiplier) closes the gap this item's own framing
undersold: the danger window is not only at creation, it recurs after every
commit an attached-branch worktree makes, since a just-committed worktree is
clean, unlocked and its HEAD is the branch tip by the pre-existing four
conditions alone. Both creation paths (the `worktree-lifecycle.mjs`-recorded
path and the record-less host-harness `isolation: "worktree"` path) are
covered. 30/30 tests green, independently re-verified.

**Third criterion (wiring) attempted and reverted, not met.** `bb8347e4`
wired the mechanism into `runBootstrapWorktreeSweep`, which fires
unconditionally on every `pipeline-start-preflight.mjs` bootstrap. A T1
Critic review (opus, max) returned FAIL on F1 (major): the registered-worktree
branch this wiring calls enumerates and can `git worktree remove` **any**
registered worktree repository-wide — unlike the sibling orphan-directory
branch, which is correctly scoped to `.claude/worktrees/` — so the unattended
sweep could delete a human-created worktree elsewhere in the repository,
including gitignored, unbacked-up content `git status --porcelain` never
reports and `git worktree remove`'s own clean-check does not protect.
Reverted (`d818dcf1`) the same session, before any bootstrap could exercise
it. Two minor findings also open: a combined try/catch's doc comment claims
a fault-isolation property the code does not actually have (low reachability,
disclosed); `resolveMainWorktreePath` misidentifies the main worktree when
run from inside a linked worktree (currently harmless by two accidental
safety nets, not by the check the doc comment claims).

**What remains:** scope the unattended call — options include restricting it
to worktrees `worktree-lifecycle.mjs` itself provisioned/recorded, or an
explicit PO-level decision on the acceptable population for automatic
deletion (`harness/review-protocol.md`'s PO-escalation trigger for
irreversible matters applies here) — then re-wire, gated on the same decline
tests plus a repro of F1's exact reported scope gap.

## Closed, 2026-09-05 — PO decided the scope; landed, re-Critic'd, self-verified

**PO decision:** the unattended sweep may automatically retire only worktrees
under Pipeline-owned path prefixes (`.claude/worktrees/`, `branch/`,
`branch/detached/`); a worktree anywhere else is never touched by the
automatic sweep, though the pre-existing, separately-reviewed
deliberate-invocation API (`c352528f`) keeps its repository-wide reach
unchanged.

`NVA-B-WTLIVE-2` (`baf1ad71`, `eca3e170`) implemented it: an opt-in
`restrictToPipelineOwnedPaths` parameter, default `false` (zero behavior
change for existing callers), requested only by the wired bootstrap sweep. A
T1 re-Critic round found one further major: the allowlist anchored to
`resolveMainWorktreePath`'s `--show-toplevel` result, which is the *running*
worktree, not necessarily the true primary checkout — a false doc-comment
claim and a silent no-op risk if bootstrap ever runs from a linked worktree,
though never an incorrect deletion (every misidentified case over-declines).
Per `harness/review-protocol.md`'s two-round cap, no third Critic round was
dispatched; `NVA-B-WTLIVE-3` (`b2d8ccf1`, `05bdf6a9`) fixed it — the
allowlist now anchors to a `--git-common-dir`-derived primary-checkout root,
matching `worktree-lifecycle.mjs`'s own convention, plus an additive,
unconditional `skipped-running-worktree` condition so the sweep can never
retire the worktree it is itself running from. Self-verified by the
Elephant directly (per the review-protocol's own instruction for a second
blocking finding): `session-cleanup-recovery.test.mjs` 35/35,
`pipeline-start-scratch-lifecycle.test.mjs` 13/13,
`check-consumer-safe-paths.test.mjs` 9/9, all independently re-run; both
commits' authorship confirmed via `dispatch-authorship-verify.mjs` (one
UNVERIFIABLE-not-FAIL note: `NVA-B-WTLIVE-3`'s dispatch record wrote
`report` as a bare string instead of the template's mandated
`{text, changedFiles}` object — a record-shape defect, not a code defect,
disclosed here rather than silently accepted).

**F3 stays open, separately tracked, not blocking:** `resolveMainWorktreePath`
still mislabels the main worktree when invoked from inside a linked
worktree — harmless today (the new running-worktree condition and the
corrected anchor both independently prevent any resulting misbehavior), but
worth its own fix.

Closing this item: all three acceptance criteria are met (liveness
mechanism, truncated-dispatch handling via the reflog signal, and the
wiring — now correctly scoped and anchored).
