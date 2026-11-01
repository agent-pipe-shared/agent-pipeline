# w54 — the tool budget says whether anything counts it, per runner (candidate 17, slice 8)

Applies on top of w52 (both change `scripts/dispatch-briefing.mjs` and its test); apply order w51, w52, w53, w54.

The dispatch tool budget is counted and enforced only on the Claude route (`hooks/guard-dispatch-budget.mjs`, wired in `hooks/hooks.json`). A Codex or Antigravity
briefing still said "Tool budget (TB-09, hard cap)", so a Codex worker (and the Elephant reading the briefing) was told a limit would be enforced that nothing enforces,
and a "continue" message had no grant behind it.

PO decision (2026-11-01): build the budget adapter for Codex and Antigravity inside 17, with an explicit `unenforced` readback where it is not covered.

## What was read before deciding (and why this slice is a readback, not a counter)

- Claude wiring: `hooks/hooks.json` PreToolUse enumerates the tools; the guard identifies a child by `transcript_path` under `subagents/` plus `agent-<id>.meta.json`, binds the
  cap from a pending record `guard-dispatch.mjs` stores under the parent tool-use id, and reads `maxTurns` from the agent definition. Every one of those is Claude-specific.
- Codex wiring: `hooks/codex-hooks.json` has `guard-dispatch.mjs` on `spawn_agent` (so the cap is stored on the parent side), PreToolUse matchers for `Bash` and
  `apply_patch|Edit|Write` only, and SubagentStart/SubagentStop for the native host (whose payload carries `agent_id` and `agent_type`). No hook receives a Codex
  child's tool calls other than shell and writes, and nothing in the repository records what a Codex child's PreToolUse payload carries (no `agent_id` use in
  `codex-pretool-guard.mjs` or `codex-slicing-hint.mjs`, no captured payload fixture).
- Antigravity wiring (`plugins/pipeline-core/hooks.json`, not under `hooks/`): PreToolUse with a matcher naming seven tools
  (`run_command|write_to_file|replace_file_content|write_file|edit_file|read_file|invoke_subagent`), a Stop hook and PreInvocation hooks; no SubagentStart/SubagentStop and
  no child identity. A counter on that matcher would undercount (the failure class the Claude manifest's own comment names) and could not tell a child from the Elephant.

A counter built on an unmeasured payload shape would look like enforcement and not be one, so none was built. Building one needs a measured Codex/Antigravity child payload
(does a child's PreToolUse fire at all, and with which identity field); that measurement is the open step, and the readback below is what is true until then.

## Change

- `scripts/dispatch-briefing.mjs`: new exported `budgetEnforcementFor(runner)` (`enforced` for `claude`, `unenforced:<runner>` otherwise). The generated briefing's field 6
  keeps the numeric cap on the same `Tool budget (...)` line (the existing cap parser reads it unchanged) but reads `self-policed on codex` instead of `hard cap`, and adds
  a `Budget enforcement: unenforced:codex` line that tells the agent nothing counts its calls and a continue message is not a grant. The result carries `budgetEnforcement`
  and, for a non-Claude runner, a warning `DBG-BUDGET-UNENFORCED` for the Elephant. The `DBG-CHECKPOINTED-OWNER` text no longer prescribes `SendMessage` as the only
  continuation route. A Claude briefing is byte-identical to before.
- Tests: one new test (Codex line, readback field, warning, existing cap parser still reads the line; Claude unchanged), the result key-set pin updated for the new field;
  mutation-checked (readback function always answering `enforced` turns the new test red; original restored from backup).

## Not changed / not proven

- No Codex or Antigravity counter exists; the hook-side texts (`lib/dispatch-budget-notice.mjs`) stay Claude-only because only the Claude guard emits them.
- Antigravity: the generator still refuses `--runner antigravity` (its dispatches use a separate route), so no Antigravity briefing carries the readback yet.
- Nothing was run on a real Codex or Antigravity session.
- Suites: dispatch-briefing (136) in the clone; guard-dispatch, guard-dispatch-native-worker, dispatch-briefing-route-record, native-goldfish-host-state,
  three-runner-happy-path, consumer-approved-plan, goldfish-test-briefs, audit-index, dispatch-scope-overlap all pass under `scripts/run-parallel.mjs`.
