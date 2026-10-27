---
schema: pipeline.backlog-item.v1
id: pipeline.budget-exhaustion-is-a-checkpoint-the-elephant-answers-not-a-failed-stop
type: defect
owner: pipeline
status: open
created: 2026-10-27
priority: P1
release: 0.7.0
sprint: alfred
source: "PO direction 2026-10-27: dispatches should report to the Elephant at budget exhaustion and keep running; the Elephant decides to let them run or abort"
done_when: manual
---

# Budget exhaustion is a checkpoint the Elephant answers, not a failed stop

## Evidence

Four dispatches on 2026-10-27 (D174, D179 C1, D180 C1 and the earlier D177 line) ended at the tool-budget checkpoint with
an interim report. Each interim report is not the success JSON, so the finalizer treated it as a failed return, wrote a
`stop-failure-<32 hex>.json`, the registry stopped reading, `heal` refused, and the slice reservation had to be cancelled
with class `budget` before a continuation dispatch with a handover card could start. Per budget stop the Elephant ran
five repair steps and the continuation re-read what the first dispatch had already read. The budget is a pacing
control; the pipeline handles it as a fault.

## Wanted

1. A typed outcome `checkpoint` in the return contract (`pipeline.native-goldfish-host-return.v1`), next to `succeeded`
   and `blocked`: it carries the progress facts (calls used, patch or notes written, what remains, a continuation card).
   It is NOT a failure: no stop-failure record, the pending state and the slice reservation stay live.
2. SEAMLESS PROGRESS IS THE DEFAULT (PO refinement 2026-10-27): the checkpoint is a notice to the Elephant, not a gate.
   The dispatch keeps running into the next budget window by itself; nobody has to answer for it to continue. The
   Elephant's only job is to notice staleness: on each notice it checks whether a diff or durable artefact emerged since
   the previous one (patch, notes file, red test, changed paths). Diff present: nothing to do. No diff: the Elephant may
   abort at will (cancel with a class). Abort is the exception path; continue is the silent default.
3. Staleness is detected mechanically so the Elephant's check is one glance: the notice carries "changed paths since the
   last checkpoint" and "calls since the last new artefact". A window with no new artefact is marked `stalled` in the
   notice; a stalled dispatch pauses itself (it does not fail) and waits for the Elephant's continue or abort, because only
   then does silence stop being safe.
4. A high absolute call cap stays as a runaway backstop, not as a pacing tool; reaching it is a `checkpoint` of kind
   `ceiling` that needs an explicit continue. It counts windows, not only calls. "Never stops" is replaced by "never fails
   on its own pacing and never burns budget silently without an artefact".
5. The briefing generator records the budget as soft limit, extension count and hard ceiling, so the dispatch text says
   what the agent does at the checkpoint (return `checkpoint`, wait for the answer) instead of "stop".
6. Regression: a Goldfish that returns `checkpoint` leaves the registry readable and the next `heal`/dispatch admitted;
   an unanswered notice never blocks and the dispatch continues; a `stalled` pause is listed by the inspect report; the
   absolute cap pauses and is refused past an explicit continue.

## Open measurements

- Whether a resumed background agent (`SendMessage`) keeps its pending host-commit state under the Claude host is
  unmeasured; if not, the checkpoint must write the continuation card as the only durable carrier (as D179 C2 did).
- The agent definition's turn limit is a harness cap; a resume starts a new budget window, so the ceiling must count
  windows, not only calls.

## Boundaries

Native Goldfish authority is a gate component: independent Critic review stays a parent-owned batch gate. Related:
`2026-10-27-a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable.md` (the classifier fix does not
remove the cause), `2026-10-27-routine-repair-loop-must-not-need-the-human.md`.
