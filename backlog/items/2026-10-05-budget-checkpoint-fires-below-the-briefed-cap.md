---
schema: pipeline.backlog-item.v1
id: pipeline.budget-checkpoint-fires-below-the-briefed-cap
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live, Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# The budget checkpoint fires below the briefed cap

## Description

A dispatch briefed with a 45-tool-use cap and an 80 % checkpoint at about 36
was stopped by the hook-enforced checkpoint at 35 tool calls. It is unclear
which source the hook reads for the cap: the agent definition or the briefing.

## Triggering situation

One dispatch in the 2026-10-05 session.

## Affected artifact

The tool-budget hook and `templates/prompts/goldfish-task.md` (budget field).

## Proposal

Confirm which source the hook reads. Make the briefing field the single source,
or state in the template that the agent definition wins.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, documentation option (state in the template which source wins).
- **Rationale:** BUDGETCAP-d (`46cc537b5`, `specs/sprint-alfred-epic/evidence/night-2026-10-05/budget-cap-source.md`) measured the hook as `min(briefed base cap, agent maxTurns - 15)` with the checkpoint at `ceil(0.8 x effective cap)`; a 45 briefing on `goldfish-implementor` (maxTurns 50) is clamped to 35, which matches the stop at 35. The template's own default (40) and its "5 in reserve" arithmetic are wrong against that.
- **Assignment (if accepted):** template wording DOCCAP (dispatched 2026-10-06).
- **Date:** 2026-10-06
