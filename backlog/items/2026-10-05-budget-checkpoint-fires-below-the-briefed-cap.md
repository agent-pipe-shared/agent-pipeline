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

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
