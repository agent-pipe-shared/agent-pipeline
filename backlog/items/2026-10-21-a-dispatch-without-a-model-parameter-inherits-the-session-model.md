---
schema: pipeline.backlog-item.v1
id: pipeline.a-dispatch-without-a-model-parameter-inherits-the-session-model
type: defect
owner: pipeline
status: open
created: 2026-10-21
source: "PO decision D84 (2026-10-21): the dispatch model comes from the pipeline.user.yaml routing, is enforced, and ships in 0.7.0"
sprint: none
done_when: manual
---

# A dispatch without a model parameter inherits the session model

## Description

The model and effort of every dispatched agent are fixed by the `pipeline.user.yaml`
routing (`models.*` tiers and `worktypes.<profile>` entries, resolved through
`plugins/pipeline-core/config/routing-authority.json`). `policies/model-policy.md`
says subagents never inherit the session model (MP-04, the line "workflow `agent()`
calls MUST set the model explicitly") and CLAUDE.md names silent inheritance as the
failure mode. Nothing enforces it at the dispatch call:

- `plugins/pipeline-core/hooks/guard-dispatch.mjs` does not read the Agent tool's
  `model` parameter at all (no `model` handling in the file);
- `lib/model-role-dispatch.mjs` and `scripts/model-role-dispatch-select.mjs` select
  a route for the Critic hosts and bridges, but are not consulted by the PreToolUse
  gate for an Agent or Workflow `agent()` call;
- built-in agent types (`general-purpose`, `Explore`, `Plan`) and pipeline agent
  types whose frontmatter pins no model run on whatever the session runs on.

Observed 2026-10-21: six `general-purpose` agents were launched by the Elephant
without a `model` parameter and silently ran on the session model; the PO asked which
model they used and ruled that this must never depend on the Elephant.

## Acceptance

- Every Agent tool call and every Workflow `agent()` call is checked at PreToolUse:
  the `model` parameter must be present and must equal the model the configured route
  assigns to that agent type's tier (and effort where the host exposes it). A missing
  or different value is refused with a message that names the configured value as the
  repair; a refused call leaves no state (never fully blocking).
- A deliberate escalation above the configured tier stays possible only through the
  documented grant (MP-07/MP-29) and is recorded; the Elephant cannot pick a model on
  its own.
- Agent types without a declared route (built-in `general-purpose`, `Explore`, `Plan`)
  are either given a route in the configuration or refused with the repair
  "use a pipeline agent type or declare a route"; they never inherit.
- A RED pin per case (absent model, wrong model, escalation with grant, undeclared
  type) exists before the change (QG-04/QG-07), and the enforcement lives in the
  hook, not in the briefing text (runner/platform-neutral).
- The enforcing change touches a protected hook and needs a signature round.

## Progress (2026-10-21, autonomous window)

The pure decision is committed: `lib/dispatch-model-enforcement.mjs`
(`evaluateDispatchModel`, 9 cases in its test, written RED first). It refuses a missing
or unrouted `model` for the Claude Task/Agent tool and only warns when a duty-bound
agent type names a configured but different selector (the MP-05/MP-07 escalation shape,
so the grant route stays open; promoting that warning to a refusal needs the grant
record this item still asks for). Still open: the hook wiring (operator drop-in, scratch
patch 33, plus `model` in existing hook test fixtures), Workflow `agent()` dispatches,
the Codex and Antigravity transports, and a live observation that the hook input carries
the dispatcher's `model` field.
