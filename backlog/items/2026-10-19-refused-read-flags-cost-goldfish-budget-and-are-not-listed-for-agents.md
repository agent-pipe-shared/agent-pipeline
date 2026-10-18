---
schema: pipeline.backlog-item.v1
id: pipeline.refused-read-flags-cost-goldfish-budget-and-are-not-listed-for-agents
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "real greenfield project report 2026-10-19 (PF-28)"
sprint: none
done_when: manual
---

# Refused read flags cost Goldfish budget and are not listed for agents

## Description

`guard-lifecycle-ready` refuses common read-only `rg`/`grep` flags (`-i`, `-l`, `--glob`,
`-A`, `-B`). In a consumer project, a Goldfish implementor spent about 6 of 35 tool calls on
such refusals in one run, plus several stops at the budget checkpoint. `agent-obligations.md`
does not name these flag limits concretely, so the Elephant had to write them into the
briefing by hand.

## Triggering situation

A Goldfish searching for type definitions under `node_modules` in a consumer project.

## Proposal

Either admit the bounded read-only flags that cannot write or execute (`-i`, `-l`, `-A`, `-B`,
a bounded `--glob`), or list the exact refused flag set in the generated
`templates/prompts/agent-obligations.md` so a dispatch learns it before its first call.

## Acceptance

- Each named flag is either admitted for in-root reads with a pin, or named in the generated
  agent obligations with its admitted alternative.
