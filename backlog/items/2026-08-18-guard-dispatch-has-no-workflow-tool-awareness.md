---
schema: pipeline.backlog-item.v1
id: pipeline.guard-dispatch-has-no-workflow-tool-awareness
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "self-observation during dispatch NVA-WFDISP-1, 2026-08-18 (briefed disclosure of a confirmed gap: guard-dispatch.mjs has zero Workflow-tool awareness)"
---

# guard-dispatch.mjs has no Workflow-tool awareness, so template-conformance for a Workflow-embedded dispatch is self-discipline only

## Description

CLAUDE.md's "Dispatch from the template, never freehand" Hard Rule requires
a Goldfish/Critic dispatch to be built by filling
`templates/prompts/goldfish-task.md` / `templates/prompts/critic-review.md`,
never hand-written. `plugins/pipeline-core/hooks/guard-dispatch.mjs` is the
mechanical checker that enforces template conformance for a direct Agent-tool
dispatch. It has zero awareness of the Workflow tool's `agent()` call, whose
prompt string can carry the exact same 6-field briefing shape, but arrives
embedded inside a Workflow script parameter rather than a discrete dispatch
`tool_input` the guard's current matcher inspects. Confirmed: `rg -in
"workflow" plugins/pipeline-core/hooks/guard-dispatch.mjs` returns zero hits.
Template conformance for a Workflow-tool-embedded dispatch is therefore
self-discipline only today, not mechanically enforced the way a direct
Agent-tool dispatch is.

## Triggering situation

Surfaced during dispatch NVA-WFDISP-1 (2026-08-18): the Elephant in the
parent session hand-built two Workflow `agent()` prompts by manually
reproducing the `goldfish-task.md` 6-field shape from memory — the exact
"freehand" failure mode the Hard Rule exists to prevent, reached via a
mechanism (the Workflow tool) the mechanical guard does not see at all.
NVA-WFDISP-1 anchored the RULE text (CLAUDE.md, `goldfish-task.md`,
`critic-review.md`) to state explicitly that a Workflow dispatch is covered
by the same discipline, but was scoped not to build the enforcement itself —
this item is that disclosed, deferred gap.

## Affected artifact

`plugins/pipeline-core/hooks/guard-dispatch.mjs` (the template-conformance
checker — no Workflow-tool matcher/awareness today), `plugins/pipeline-core/hooks/hooks.json`
(matcher wiring), and CLAUDE.md's "Dispatch from the template, never
freehand" Hard Rule (now explicitly states the Workflow case is covered as
of NVA-WFDISP-1, but only as a stated rule, not yet a mechanically checked
one).

## Proposal

Needs its own scoped design pass, not a mechanical fix — open questions a
future dispatch would need to resolve:

- What does the Workflow tool's own PreToolUse payload actually carry: the
  full `script` string (including any embedded `agent()` prompt text) or
  only a script path/reference the guard would need to resolve separately?
- How would the guard reliably locate and extract an embedded `agent()`
  prompt string out of an arbitrary Workflow script body, given the prompt
  may be built programmatically (string concatenation, template literals,
  a helper function) rather than as one static string literal the current
  conformance check (built for a single discrete dispatch prompt) can
  statically parse?
- False-positive risk: a Workflow script that never calls `agent()` for a
  Goldfish/Critic dispatch (e.g. pure data-processing fan-out) must not be
  penalized for lacking template fields it was never supposed to carry.
- Candidate direction: detect the Workflow tool's `tool_input`, extract the
  prompt string(s) passed to each `agent()`/`parallel()`/`pipeline()` call
  whose `agentType` resolves to a `goldfish-*`/`critic` role, and apply the
  same 6-field-shape / anti-pattern checks `guard-dispatch.mjs` already runs
  for a direct dispatch.

Same disposition as the sibling item
`backlog/items/2026-08-18-guard-devplan-and-guard-testpath-have-no-bash-write-lane.md`:
confirmed real gap, security/process-adjacent, deferred to a dedicated
dispatch with real design latitude rather than a rushed same-session patch.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, partial implementation landed (Wave 5 round 1,
  dispatch NVA-W5-01); status stays **open** — the core runtime gap is
  not yet closed.
- **Rationale:** the dispatch added `extractWorkflowDispatches()` to
  `guard-dispatch.mjs`, statically recovering an `agentType`/`prompt`
  pair from a Workflow script's `agent()` calls and running the same
  `dispatchFindings` checks (regex-based by design, fail-open on
  anything not statically resolvable — matching this item's own
  false-positive-risk caution). `node --test
  plugins/pipeline-core/hooks/guard-dispatch.test.mjs` 11/11 pass,
  including 2 new cases (GD10/GD11). **This makes the hook's logic
  Workflow-aware but does not wire real runtime enforcement**:
  `plugins/pipeline-core/hooks/hooks.json`'s PreToolUse matcher for this
  hook is still `Task|Agent` only, so a live Workflow tool call is never
  routed through this check at all — only the unit tests (which feed
  stdin directly, bypassing matcher routing) exercise the new logic.
  Adding `Workflow` to the matcher touches a TP-protected file
  (`hooks.json`), correctly identified and left untouched by the
  dispatch per its own scope boundary, rather than attempted freehand.
- **Assignment:** a follow-up TP-ceremony dispatch to add `Workflow` to
  `hooks.json`'s PreToolUse matcher for this hook, closing the actual
  runtime gap. Also unconfirmed: the real Claude Code PreToolUse payload
  shape for a Workflow tool call (script location, field name) was
  inferred from `workflow-dispatch.md`'s description, not observed live
  — worth confirming before or during that follow-up.
- **Date:** 2026-08-19

### Note, 2026-08-19 — NOT resolved by the 2026-08-19 TP-3 consolidation ceremony

Stays **open**. The 2026-08-19 signed TP-3 ceremony (commit `92bb2a08`)
registered 107 test files into `harness/scripts/verify.mjs` — a different
protected file and a different guard class from this item's actual
blocker, which is `plugins/pipeline-core/hooks/hooks.json`'s PreToolUse
matcher (TP-4). An attempted edit to `hooks.json` this same session
resolved to `status=author-repair-required`, not the signable HGO class —
no in-session route exists for it at all. Do not infer closure from the
TP-3 ceremony's suite count.
