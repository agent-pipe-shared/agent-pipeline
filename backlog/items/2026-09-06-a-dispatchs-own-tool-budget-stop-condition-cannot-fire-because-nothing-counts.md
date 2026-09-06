---
schema: pipeline.backlog-item.v1
id: pipeline.tool-budget-stop-condition-cannot-fire
type: defect
owner: pipeline
status: open
created: 2026-09-06
sprint: nova-b
done_when: manual
tracking: "Nova B -- every Goldfish briefing carries 'tool budget reached or clearly about to be exceeded' as a stop condition, but an agent has no counter to read: it must estimate its own tool-call count from memory of its own turn. Measured twice on 2026-09-06 in one session: both dispatches overran and neither stop condition fired. This is a sibling of the closed maxTurns-cliff item, not a duplicate -- that one was about the hard limit being unannounced, this one is about the soft limit being unobservable to the agent expected to honour it."
source: "Direct measurement, 2026-09-06: NVA-B-VERIFYLANE-2 used ~59-61 tool calls against a briefed 45+5 and reported the overrun only after an advisor consult flagged it retroactively; NVA-B-DENIALCODE-1 reached the harness turn limit at 80 against a briefed 40+5, losing its report entirely."
---

# A dispatch's own tool-budget stop condition cannot fire, because nothing counts the tool calls

## The gap

`templates/prompts/goldfish-task.md` field 5 asks every dispatch to stop when
its "tool budget reached or clearly about to be exceeded". The template is
honest that the budget is not hook-enforced. What follows from that, and is
not stated, is that the *stop condition itself* is unimplementable as written:
an agent has no counter to consult. Honouring it requires the agent to
maintain an accurate running count of its own tool calls across a long
context, from memory, while doing the actual work.

That is the one thing an agent in a long run is least able to do reliably. The
stop condition therefore reads as a real safeguard, is briefed as one, and is
load-bearing in the sense that dispatchers size budgets assuming it will fire
— but it has no mechanism.

## Measured, same session, two of two dispatches

| Task | Briefed | Actual | How it ended |
|---|---|---|---|
| `NVA-B-VERIFYLANE-2` | 45 + 5 | ~59–61 | Ran to completion; overrun noticed only when an advisor consult flagged it retroactively, and disclosed honestly in the report |
| `NVA-B-DENIALCODE-1` | 40 + 5 | 80 (harness cap) | Cut mid-run during evidence capture; report and record log lost entirely |

Two for two is not a sample, but it is the whole population of that session's
budgeted dispatches, and neither failure mode was the agent ignoring the rule
— in both cases the agent had no way to know it had crossed the line.

## Why it matters beyond tidiness

The second row is the expensive one. The budget exists to make a dispatch stop
*before* the harness cuts it off, because a self-stopped dispatch writes its
report and a harness-cut one does not. A stop condition that cannot fire
converts every mis-sized budget into data loss instead of a clean stop.

## Not yet decided

Candidate directions, none chosen:

- A `PostToolUse` hook that counts calls per dispatch and injects the running
  count back into the agent's context — the delivery channel for this is now
  confirmed to work (`additionalContext` reaches the model), so it is newly
  feasible in a way it was not when the budget rule was written.
- Requiring the dispatch to write its call count into its own dispatch-record
  `log` per phase, making the count an artifact rather than a memory.
- Dropping the stop condition's claim to be a safeguard and re-describing it
  as advisory, so dispatchers stop sizing budgets on the assumption it fires.

The first two cost work; the third costs nothing and is honest, but leaves the
data loss in place.

## Related

- `2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`
  (closed) — the hard cliff. This item is the soft limit's own blind spot, and
  closing that one did not address it.
