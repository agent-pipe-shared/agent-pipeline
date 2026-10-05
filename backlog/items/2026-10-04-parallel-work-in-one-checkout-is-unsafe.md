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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
