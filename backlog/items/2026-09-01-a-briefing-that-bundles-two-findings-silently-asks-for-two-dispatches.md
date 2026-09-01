---
schema: pipeline.backlog-item.v1
id: pipeline.briefing-bundling-two-findings-asks-for-two-dispatches
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
tracking: "Nova B — dispatcher-side scoping defect: bundling two independent review findings into one briefing produced a package that could not fit any single tool budget, and the overrun was read as an agent problem rather than a briefing problem."
source: "Measured on 2026-09-01 across four dispatches in one session, with the decisive case a bundled two-finding briefing whose second half later needed a full dispatch of its own."
done_when: manual
---

# A briefing that bundles two independent findings silently asks for two dispatches

## What was measured

Four dispatches in the 2026-09-01 session overran their briefed tool budgets.
The decisive pair:

- **NVA-B-ALPHAREF** was briefed at 35 + 5 to close two Critic findings, F5
  (reason-code separation) and F6 (the missing configuration surface). It spent
  **65 tool uses**, delivered F5 green and committed, and stopped on the budget
  condition before starting F6 — correctly, and with a detailed handover.
- **NVA-B-ALPHAWRITE** then took F6 alone, briefed at 45 + 5, and spent
  **57 tool uses** to deliver it.

So the second half of the first briefing was, on its own, a ~57-use package. No
budget that fits one dispatch could have covered both. The first briefing did
not overrun because the agent wandered; it overrun because it asked for roughly
two dispatches' worth of work under one cap.

## Why this is not the closed budget item

[`2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md`](2026-08-23-briefed-tool-budget-sits-below-an-unannounced-harness-maxturns-cliff.md)
was closed on 2026-08-25 with the disposition that `maxTurns` is adequate and
that overruns were behavioural — agents treating a non-binding soft cap as
advisory. That conclusion still holds for the cases it measured, and this item
does not reopen it: nothing here argues for raising `maxTurns`.

The failure shape is different and sits one level up. It is not the agent
ignoring the cap and not the cap being too small for the work actually briefed.
It is the **dispatcher** writing a briefing whose true cost exceeded any single
cap, and then reading the resulting stop as the agent's budget discipline rather
than as the briefing's scoping error. Both dispatches here stopped honestly and
handed over well; the discipline worked. The briefing was the defect.

## The tell that was available before dispatching

Both findings came from one Critic report and were adjacent in the same module,
which is what made bundling them look natural. But they were not adjacent in
cost: F5 changed how an existing value is carried, F6 required building an
atomic-write plan/apply pair with its own test suite. The Critic's own severity
labels — both "minor" — actively concealed this, because severity measures the
consequence of the defect, never the cost of the remedy.

## Direction to evaluate

The cheap version is a briefing-construction check, not a new mechanism: before
dispatching a briefing that closes more than one review finding, state each
finding's expected cost separately and split when the sum approaches the cap.
Whether that belongs in `templates/prompts/goldfish-task.md` as a construction
rule, in `roles/elephant.md` as a dispatcher duty, or nowhere formal at all —
because a rule that says "estimate better" tends not to change behaviour — is
the open question this item exists to answer.

Worth weighing against a do-nothing option honestly: the existing stop-condition
and closing-handover machinery already contained the damage both times. Nothing
was lost, and the second dispatch was cheap to brief precisely because the first
one's handover named what remained. That is the system working as designed, and
a new rule that adds friction to every multi-finding briefing may not be worth
the two dispatches it would have saved here.

## Acceptance criteria

- A decision is recorded — including "no change, the handover machinery is
  sufficient" as a legitimate outcome, with its reasoning.
- If a rule is added, it names where a dispatcher states per-finding cost and
  what the split threshold is, rather than asking for better judgement in the
  abstract.
- The closed 2026-08-23 item is left closed and is not retroactively amended;
  this item cites it instead.
