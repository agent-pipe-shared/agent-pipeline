---
schema: pipeline.backlog-item.v1
id: pipeline.parallel-work-in-one-checkout-is-unsafe
type: defect
owner: pipeline
status: open
created: 2026-10-04
source: "Live observation, W0-3 dispatches, Claude Code session on native Windows, 2026-10-04, feat/sprint-alfred, lifecycle implementing."
sprint: alfred
done_when: manual
---

# Parallel work in one checkout is unsafe

## Observed again 2026-10-05

Defect 7 of the ALFRED-BACKLOG-20261005 set: once a commit cites a task id, `GUARD-DISPATCH-RECORD-COLLISION` refuses every further write to that dispatch record. This contradicts the goldfish template's "commit, then checkpoint/finalize the record" and leaves the record unable to receive its final state or report after the commit. Reproduction shape: dispatch a Goldfish, commit with a `Dispatch: <TASK_ID> (goldfish)` trailer, then write the dispatch record (log entry, outcome flip or report). Impact: the dispatcher must hand-finalize records or the Goldfish must write the final state before its last commit, which the template does not say consistently. Fix direction: admit record writes by the owning dispatch after its own commit (bound to the task id and the agent identity), or amend the template to a single ordering the guard actually admits; add a regression test for the commit-then-finalize sequence.

## Observed again 2026-10-05 (round 3b)

A restart does not stop background dispatches, and the dispatcher has no reliable liveness view. After a PO restart/resume the earlier BLR3 Goldfish kept running while its record still showed only `phase: start`; a re-dispatch (BLR3b) wrote the same backlog files concurrently and overwrote two of them. Fix direction: a liveness readback for open dispatch records (pid/heartbeat or runner task state) that the dispatch guard checks before admitting a second writer in the same checkout.

## Description

Three failure modes were observed during the W0-3 dispatches:

1. **Counter lock.** Parallel tool calls inside one dispatch make the
   dispatch-budget counter answer `DISPATCH-BUDGET-INPUT-INVALID
   (counter-lock-busy)` and leave it stuck for that dispatch ("repair through
   the trusted host path").
2. **Dispatch-record collision.** Two parallel edits of the dispatch's own
   record trip `GUARD-DISPATCH-RECORD-COLLISION` once the outcome flips to
   `committed-pending-report`, leaving an unrepairable record.
3. **Transient not-ready.** A second agent's Write is refused with
   `GUARD-LIFECYCLE-NOT-READY` (session readiness `partial`) while another
   agent commits, although `inspect --intent session` reports ready right
   afterwards (process review PF-8: the preflight and guard readiness intents
   differ).

Parallel dispatch in one checkout is effectively unsafe today.

## Triggering situation

W0-3 dispatches, 2026-10-04.

## Affected artifact

The dispatch-budget counter and its lock; the dispatch-record collision guard
(`GUARD-DISPATCH-RECORD-COLLISION`); the lifecycle readiness evaluation in
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`.

## Proposal

- Make the counter lock wait or retry briefly and recover on its own instead
  of sticking; serialise counter updates per dispatch.
- Make dispatch-record updates atomic and repairable, so a collision never
  leaves an unrepairable record.
- Use one readiness definition for preflight and guard, and never report
  `partial` for the duration of another agent's commit.
- Until then, document that exactly one committing agent and one tool call at
  a time is the supported mode in a shared checkout.

## Observed 2026-10-18: AGY greenfield ran disjoint packages serially (improvement 5.2)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, improvement 5),
installed `pipeline-core` 0.6.2.

- Every work package ran serially in the one checkout, although the architecture map gave
  WP-1A, WP-1B and WP-2A disjoint file sets. The PO asked why nothing ran in parallel.
- Re-check against 0.7.0 (2026-10-18): `antigravity-native-dispatch-prepare.mjs` has no
  worktree mode. Its reference keeps the existing Workflow/worktree route as the only
  parallel path. That route does not exist on Antigravity.

Added acceptance (post-0.7.0 unless the PO pulls it in): AGY native dispatch prepares
disjoint packages for parallel execution in isolated worktrees, under the
single-committer rule above.

## Observed 2026-10-20: a Critic cannot run beside a Goldfish in one checkout (PF-57)

Source: PO report after handover 03, findings PF-57 (2) and the PF-55 addendum, installed
`pipeline-core` `0.7.0+claude.20261020064459.a8ddf85`. The PO calls it critical and puts it into
the next candidate (D62).

- `critic-dispatch-preflight` requires fresh Verify evidence bound to the exact candidate commit
  and tree (`CDP-EVIDENCE-REQUIRED`). `verify-evidence-producer` produces it only for the current
  checkout, and a full Verify run there collides with a running Goldfish's writes. So a Critic
  review and a Goldfish cannot run in parallel on a shared checkout.
- PF-55 addendum: a single dispatch on the new build leaves the session-authority registry clean
  (`lock: absent`, `read: readable`); the parallel case is not yet checked.

Added acceptance (0.7.0, D62):

- `verify-evidence-producer` can produce Critic evidence for a named earlier commit without
  touching the shared checkout (for example in a temporary worktree it creates and removes), and
  the preflight accepts that evidence for that commit.
- A pin runs the producer for an older commit while the checkout has uncommitted changes, and the
  checkout's bytes are unchanged afterwards.
- The session-authority registry stays readable with no orphaned lock after a Critic and a
  Goldfish dispatch ran in parallel; a pin or a recorded live run shows it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
