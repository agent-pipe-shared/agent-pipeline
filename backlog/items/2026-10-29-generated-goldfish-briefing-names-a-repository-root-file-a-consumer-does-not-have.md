---
schema: pipeline.backlog-item.v1
id: pipeline.generated-goldfish-briefing-names-a-repository-root-file-a-consumer-does-not-have
type: defect
owner: pipeline
status: open
created: 2026-10-29
priority: P1
release: 0.7.0
sprint: alfred
source: "Glossover consumer handover PF-100, relayed by the PO 2026-10-29"
done_when: manual
---

# The generated Goldfish briefing sends the agent to an obligations file at the repository root that a consumer does not have (PF-100)

## Evidence

The generated briefing told the Goldfish to read `templates/prompts/agent-obligations.md` at the repository root. A consumer project has no such file; only the plugin ships it.

## Delivered

Commit 5e2909ee2: the briefing names the root file first and the identical plugin-root copy for a project without one; pin PF-100 in `dispatch-briefing.test.mjs` (115 of 115). In the stamped candidate 0b10cc602; not installed.

## Open

Real dispatch in a consumer repository.
