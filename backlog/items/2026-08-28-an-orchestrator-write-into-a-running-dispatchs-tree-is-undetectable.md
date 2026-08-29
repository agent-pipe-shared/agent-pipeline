---
schema: pipeline.backlog-item.v1
id: pipeline.an-orchestrator-write-into-a-running-dispatchs-tree-is-undetectable
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nightwing
source: "Re-Critic vtpgate2-368458af finding F2; incident during NVA-VTPGATE-2, 2026-08-28"
done_when: contains plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs lease
---

# A concurrent orchestrator write into a running dispatch's tree is neither prevented nor detected, and the authorship verifier passes it

## What happened

During `NVA-VTPGATE-2` (`goldfish-deep`, shared checkout), a task-notification
reported the dispatch as **finished** and carried a full final report. It had
not finished — it was mid-continuation after a resume.

Acting on that report, the orchestrator edited
`harness/scripts/check-consumer-safe-paths.mjs`, a file in which the dispatch
already had uncommitted work. Two consequences, both measured:

1. The dispatch's next commit, `259b140c`, carries content the orchestrator
   wrote, under the trailer `Dispatch: NVA-VTPGATE-2 (goldfish)`. History is not
   rewritten in this repository (GIT-04), so that attribution stands.
2. Two further orchestrator commits (`85b607fd`, `54f74d08`) landed while the
   dispatch's own `verify.mjs` run was in flight, producing `binding: "drift"`
   and one wasted full verify run.

The duplicate allowlist entry the collision produced was removed in `7b40bf16`.
The false attribution on `259b140c` cannot be removed.

## The actual defect: nothing measures it

`dispatch-authorship-verify.mjs --range d350cbd4..54f74d08` reports **6/6 PASS**,
including `259b140c`. That is not a bug in the verifier's implementation — it is
the limit of its contract. It checks that the named dispatch record exists, that
its `outcome` is terminal, and that `report.changedFiles` covers the commit's
paths. All three hold: the dispatch genuinely did touch that file too. A commit
whose content came from two different actors is indistinguishable, to every check
this repository has, from one the dispatch wrote alone.

So the trailer — the mechanism the whole authorship story rests on — asserts
something no tool can falsify. That is the defect worth filing. The incident
itself was an orchestrator procedure failure and has already been recorded as
one; a procedure failure that no check can catch will recur.

## Why the existing rules and the sibling item do not cover it

- The standing guidance is prompt-level: `CLAUDE.md`'s shared-tree rule and the
  operator-side "after a resume, treat the whole working tree as off-limits"
  memory. Both are instructions to a fallible reader. Neither leaves a trace when
  violated, which is precisely how this one went unnoticed until an independent
  Critic read the diff against the trailers.
- `pipeline.a-registered-but-abandoned-worktree-is-never-retired` (filed the same
  day) is a **different** defect and must not be closed as covering this one:
  that one is a leftover worktree tripping a *later* dispatch's start check; this
  one is two actors writing the *same* checkout at the same time. Isolation would
  incidentally have prevented this instance, but isolation is not always granted
  — confirmed 2026-08-25, when three `isolation: "worktree"` dispatches all landed
  in the dispatcher's own checkout — so a shared-tree remedy is still needed.

## Proposal (confirm before assuming)

Two layers, because detection and prevention are different jobs and this
repository has already learned that a guard cannot enforce its own absence:

1. **Detection, in the verifier.** Have a dispatch record the paths it intends to
   write when it starts, and have `dispatch-authorship-verify.mjs` compare each
   commit's paths against the *lease* rather than against the after-the-fact
   `report.changedFiles` the same dispatch wrote. A path in the commit that was
   never leased is reported, not passed. This makes the violation visible in
   evidence even when nobody prevented it.
2. **Prevention, in a git hook.** A `pre-commit` hook refuses a commit whose
   staged paths intersect an active lease held by a different actor. A PreToolUse
   guard would additionally catch the orchestrator's `Edit` before it happens —
   the orchestrator is the main session, where PreToolUse does fire — but it must
   not be the only layer: PreToolUse does not fire in subagents in Claude Code,
   so only the git hook covers both sides.

Both layers need a stale-lease rule, and it is the same shape as the sibling
worktree item: a truncated dispatch never releases its lease. Retire a lease only
on evidence it is dead, and fail open rather than deadlocking the next session.

## Triage, 2026-08-28

- **Decision:** accepted, unassigned, sprint `nightwing`. **Not** a candidate
  blocker: the one wrong attribution is recorded and cannot be rewritten, the
  duplicated content is already removed, and the delivery's own verify is green
  and exactly bound. Filed because the remedy is mechanical and the cost profile
  is bad — the failure is silent, it corrupts the authorship record rather than
  the code, and it is caught today only by an independent reviewer happening to
  read diffs against trailers. That is exactly the class of rule this repository
  holds should be enforced by a guard rather than by another paragraph of prompt.
