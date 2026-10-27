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
2. The Elephant answers a checkpoint with one of: continue (the same agent is resumed with its context through
   `SendMessage`, with a stated extension), or abort (cancel with a class). A checkpoint without an answer never blocks
   other work; the Elephant's answer is the only transition.
3. A hard ceiling stays: a bounded number of extensions per slice (the default is two) and an absolute call cap, then the
   Elephant must choose abort or re-slice. "Never stops" is replaced by "never stops silently and never fails on its own
   pacing".
4. Progress-based extension: an extension is offered only if the checkpoint names a durable artefact written since the
   last one (a patch, a notes file, a red test) or a measured blocker. Re-reading the same sources twice without an
   artefact is reported as a stall, not extended.
5. The briefing generator records the budget as soft limit, extension count and hard ceiling, so the dispatch text says
   what the agent does at the checkpoint (return `checkpoint`, wait for the answer) instead of "stop".
6. Regression: a Goldfish that returns `checkpoint` leaves the registry readable and the next `heal`/dispatch admitted;
   an unanswered checkpoint is listed by the inspect report; an extension beyond the ceiling is refused.

## Open measurements

- Whether a resumed background agent (`SendMessage`) keeps its pending host-commit state under the Claude host is
  unmeasured; if not, the checkpoint must write the continuation card as the only durable carrier (as D179 C2 did).
- The agent definition's turn limit is a harness cap; a resume starts a new budget window, so the ceiling must count
  windows, not only calls.

## Boundaries

Native Goldfish authority is a gate component: independent Critic review stays a parent-owned batch gate. Related:
`2026-10-27-a-stop-failure-diagnostic-makes-the-native-goldfish-inventory-unreadable.md` (the classifier fix does not
remove the cause), `2026-10-27-routine-repair-loop-must-not-need-the-human.md`.
