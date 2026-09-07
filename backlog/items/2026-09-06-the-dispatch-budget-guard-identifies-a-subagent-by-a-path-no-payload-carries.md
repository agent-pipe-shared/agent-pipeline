---
schema: pipeline.backlog-item.v1
id: pipeline.the-dispatch-budget-guard-identifies-a-subagent-by-a-path-no-payload-carries
type: defect
owner: pipeline
status: closed
created: 2026-09-06
closed_at: 2026-09-07
closure_repository: self
closure_commit: 6372b984
closure_evidence: backlog/evidence/2026-09-06-nva-b-guardfix-critic-round1.md
source: "measured 2026-09-06 with a temporary user-level PreToolUse capture hook against two live goldfish dispatches; full record backlog/evidence/2026-09-06-dispatch-budget-guard-discriminator-measured.md, PO decision queue item 3"
sprint: nova-b
done_when: contains plugins/pipeline-core/hooks/guard-dispatch-budget.mjs agent_id
---

# The dispatch-budget guard identifies a subagent by a path no payload carries

## Description

`guard-dispatch-budget.mjs` counts a dispatched subagent's tool calls
externally so a dispatch stops before the harness cuts it off. It is wired in
`hooks.json`, it fires on every tool call, and it has never counted anything.

The reason is measured, not inferred. The guard decides whether a call belongs
to a subagent by matching the payload's `transcript_path` against the shape
`.../subagents/agent-<id>.jsonl`. No real payload carries such a path. Every
`PreToolUse` payload — from a dispatched subagent exactly as much as from the
orchestrating session — carries the PARENT session's `transcript_path` and its
`session_id`. Every subagent call is therefore classified as the orchestrator,
which the guard exempts by design, so the counter never moves.

The discriminator that does exist is the payload's key set. A subagent's
payload carries two keys an orchestrator payload does not:

| Caller | Keys |
|---|---|
| orchestrator | `cwd`, `effort`, `hook_event_name`, `permission_mode`, `prompt_id`, `scratchpad_dir`, `session_id`, `tool_input`, `tool_name`, `tool_use_id`, `transcript_path` |
| subagent | the same, plus `agent_id` and `agent_type` |

`agent_type` additionally names which agent definition is running, so a budget
can be tiered per agent tier instead of being one fixed number.

## Triggering situation

The guard was corrected once before, on 2026-08-27, when its matcher was
match-all and matched nothing; `hooks.json`'s own comment records that
correction. The matcher has been right ever since — the hook does reach
subagents. Only the discriminator inside it was still wrong, and nothing
distinguished the two failures from the outside: in both cases the counter
simply stayed at zero.

Measured on 2026-09-06 by installing a temporary `PreToolUse` capture hook in
the user-level settings and running two goldfish dispatches under it. Same day,
four dispatches ran 66, 45, 50 and 39 tool calls against briefed caps of 40,
51, 31 and 46; one was cut at the harness turn limit mid-verification, leaving
six edited files uncommitted and producing no report until it was resumed. A
working budget guard is what stands between a briefed cap and that outcome.

## Affected artifact

- `plugins/pipeline-core/hooks/guard-dispatch-budget.mjs` — the discriminator.
- `plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs` — needs both
  payload shapes as fixtures; today nothing pins the real shape, which is how
  the wrong discriminator survived a passing suite.
- `plugins/pipeline-core/hooks/hooks.json` — TP-4 protected. Only relevant if
  the fix needs a wiring change, which on current evidence it does not: the
  matcher is correct.

## Proposal

Replace the transcript-path test with the presence of `agent_id`, and pin both
payload shapes as fixtures so a future change that reintroduces a
shape-guessing discriminator fails a test rather than silently counting
nothing. Keep the orchestrator exemption where it is — inside the guard, never
in the matcher — since that separation is what makes the hook safe to widen.

Consider, but do not fold in silently: `agent_type` makes a per-tier budget
possible (a mechanic tier and a deep tier do not deserve the same cap). That
is a policy change and belongs in its own item if it is wanted.

**A second, more general finding from the same measurement, worth its own
item rather than this one:** a `PreToolUse` hook that exits non-zero but not 2
reports only to the user, never to the agent or to any log. The capture hook
itself was dead for hours that way — a quoting defect made node exit 1 on a
syntax error and nothing anywhere said so. Any hook whose only failure signal
is that exit code needs its own liveness readback; "registered" is not
"running", and this guard is the second instance of that lesson in ten days.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
