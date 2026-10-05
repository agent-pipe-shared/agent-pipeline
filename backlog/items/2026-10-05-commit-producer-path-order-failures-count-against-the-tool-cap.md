---
schema: pipeline.backlog-item.v1
id: pipeline.commit-producer-path-order-failures-count-against-the-tool-cap
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation 2026-10-05 (Alfred session): ALFRED-BACKLOG-20261005 defect 4."
sprint: alfred
done_when: manual
---

# Commit-producer path-order failures count against the hard tool cap

## Description

`goldfish-commit-command-flow.mjs` refuses unsorted `--path` values with `GF-COMMAND-PATH-ORDER`. Each refused call spends a tool use against the hard cap. Twice, a Goldfish reached the cap with the producer still failing and the Elephant had to hand-compose the commit, which the producer exists to avoid.

## Triggering situation

Two Goldfish dispatches on 2026-10-05 near their cap. Reproduction shape: pass `--path` values in non-lexicographic order to the producer.

## Affected artifact

`plugins/pipeline-core/scripts/goldfish-commit-command-flow.mjs`, the budget guard's counting rules, `templates/prompts/goldfish-task.md` commit instructions.

## Proposal

Fix direction: sort the paths inside the producer (the order is canonical, so rejecting rather than normalizing buys nothing), or exempt producer refusals from the counted budget; at minimum state the sorted-order requirement in the briefing template next to the command.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
