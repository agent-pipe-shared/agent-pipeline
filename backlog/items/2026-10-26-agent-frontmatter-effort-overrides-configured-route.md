---
schema: pipeline.backlog-item.v1
id: pipeline.greenfield.r2.agent-frontmatter-effort-overrides-configured-route
type: bug
owner: pipeline
status: open
created: 2026-10-26
priority: P1
release: 0.7.0
source: "PO observation 2026-10-26: dispatches ran at xhigh although the config routes medium"
done_when: manual
---

# Agent-Frontmatter-Effort übersteuert die konfigurierte Route

Related existing criteria: AC-191 (model routing), MP-27/MP-29 (policies/model-policy.md).

## Evidence

`pipeline.user.yaml` routes `duty.deep` and `duty.implement` for Claude to
`sonnet` / `medium`; `model-role-dispatch-select.mjs --task-route duty.deep`
confirms `legacy-v3` sonnet/medium. `plugins/pipeline-core/agents/goldfish-deep.md`
pins `effort: xhigh`, the Claude Agent tool cannot pass an effort, and
`dispatch-briefing.mjs` writes `effort: xhigh` into the native binding. Three
wave-1 dispatches on 2026-10-26 therefore ran at xhigh against the PO's
configuration. The same config routes the Elephant (`profiles.epic.execution_phase`)
to opus/medium, which contradicts MP-01's "high–xhigh" wording.

## Acceptance

A dispatch runs at the model and effort the configured route selects, or is
refused with a typed reason before launch when the runner cannot honour the
route; the briefing generator and the native binding record the selected
route, never a different frontmatter pin. Policy text and configuration agree
on the Elephant's execution-phase effort. Escalation above the route stays an
explicit, stated MP-05/MP-07 act.
