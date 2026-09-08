<!--
GENERATED FILE — do not edit by hand.
Produced by: harness/scripts/generate-enforcement-doc.mjs
Pinned by: harness/scripts/check-doc-contracts.mjs (byte equality).
-->

# Enforcement registrations

This page is a reproducible reference to the hook registrations in this source
checkout. It is for teams that need to inspect which runner event names which
command before they rely on a documented rail.

## What these registrations establish

Each derived row below establishes only that the named manifest registers the
shown command for that runner event and matcher. A registration does not prove
that a plugin is installed, loaded, enabled for a project, reached by a provider,
or delivered by a released build. It also does not say that the command blocks:
allow, deny, advisory, and failure behavior belong to the invoked adapter or guard.
A Claude Code row is not coverage for Codex or Antigravity.

## Derived registrations

The table is generated from the current manifest schemas. It deliberately carries
no hand-maintained guard count or command list.

| Runner | Event | Matcher | Registered invocation |
| --- | --- | --- | --- |
| Antigravity | PreInvocation | (all) | node hooks/antigravity-slicing-hint.mjs deliver |
| Antigravity | PreInvocation | (all) | node hooks/antigravity-start-hint.mjs |
| Antigravity | PreToolUse | run_command&#124;write_to_file&#124;replace_file_content&#124;invoke_subagent | node hooks/antigravity-pretool-guard.mjs |
| Antigravity | PreToolUse | run_command&#124;write_to_file&#124;replace_file_content&#124;invoke_subagent | node hooks/antigravity-slicing-hint.mjs observe |
| Antigravity | Stop | (all) | node hooks/antigravity-stop-hook.mjs |
| Claude Code | PreToolUse | Bash&#124;Edit&#124;Glob&#124;Grep&#124;NotebookEdit&#124;Read&#124;Task&#124;TodoWrite&#124;WebFetch&#124;WebSearch&#124;Write | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-dispatch-budget.mjs" |
| Claude Code | PreToolUse | Bash&#124;Edit&#124;Glob&#124;Grep&#124;NotebookEdit&#124;Read&#124;Task&#124;TodoWrite&#124;WebFetch&#124;WebSearch&#124;Write&#124;Workflow | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-worktree-isolation.mjs" |
| Claude Code | PreToolUse | Bash&#124;PowerShell | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-git.mjs" |
| Claude Code | PreToolUse | Bash&#124;PowerShell | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-lifecycle-ready.mjs" --runner claude |
| Claude Code | PreToolUse | Bash&#124;PowerShell | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-push.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-devplan.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-el01-tripwire.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-gate-strength.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-handover-size.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-lifecycle-ready.mjs" --runner claude |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-onboarding-consent-lock.mjs" |
| Claude Code | PreToolUse | Edit&#124;Write&#124;NotebookEdit | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-testpath.mjs" |
| Claude Code | PreToolUse | Task&#124;Agent&#124;Workflow | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-dispatch.mjs" |
| Claude Code | PreToolUse | Task&#124;Agent&#124;Workflow&#124;TodoWrite | node "${CLAUDE_PLUGIN_ROOT}/hooks/guard-slicing.mjs" |
| Claude Code | SessionStart | compact | node "${CLAUDE_PLUGIN_ROOT}/hooks/post-compact-reground.mjs" |
| Claude Code | SessionStart | startup&#124;resume&#124;clear | node "${CLAUDE_PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs" |
| Claude Code | SessionStart | startup&#124;resume&#124;clear | node "${CLAUDE_PLUGIN_ROOT}/hooks/setup-check.mjs" |
| Claude Code | SessionStart | startup&#124;resume&#124;clear | node "${CLAUDE_PLUGIN_ROOT}/hooks/staleness-check.mjs" |
| Claude Code | Stop | (all) | node "${CLAUDE_PLUGIN_ROOT}/hooks/stop-suggest.mjs" |
| Codex | PreToolUse | Bash | node "${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs"; Windows: node "${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs" |
| Codex | PreToolUse | apply_patch&#124;Edit&#124;Write | node "${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs"; Windows: node "${PLUGIN_ROOT}/hooks/codex-pretool-guard.mjs" |
| Codex | PreToolUse | spawn_agent&#124;update_plan | node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" PreToolUse; Windows: node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" PreToolUse |
| Codex | SessionStart | startup&#124;resume&#124;clear&#124;compact | node "${PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs"; Windows: node "${PLUGIN_ROOT}/hooks/codex-session-start-hint.mjs" |
| Codex | SubagentStart | (all) | node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" SubagentStart; Windows: node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" SubagentStart |
| Codex | SubagentStop | (all) | node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" SubagentStop; Windows: node "${PLUGIN_ROOT}/hooks/codex-slicing-hint.mjs" SubagentStop |

## Maintained explanation and limits

This section is maintained prose, not a second registration inventory. It is kept
separate from the derived rows because the manifests describe invocation, while the
adapter source explains behavior.

- **Direct hooks and native bridges.** Claude Code registers direct hook commands in [`plugins/pipeline-core/hooks/hooks.json`](../plugins/pipeline-core/hooks/hooks.json). Codex and Antigravity register their own native bridge/wrapper commands in [`plugins/pipeline-core/hooks/codex-hooks.json`](../plugins/pipeline-core/hooks/codex-hooks.json) and [`plugins/pipeline-core/hooks.json`](../plugins/pipeline-core/hooks.json); neither registration imports Claude Code coverage into another runner.
- **Advisory slicing.** The slicing adapters are expressly advisory: [Codex](../plugins/pipeline-core/hooks/codex-slicing-hint.mjs), [Antigravity](../plugins/pipeline-core/hooks/antigravity-slicing-hint.mjs), and [the Claude Code slicing hook](../plugins/pipeline-core/hooks/guard-slicing.mjs). Their registrations therefore do not establish a blocking rail. The table does not classify any other registered command as blocking.
- **Missing or unavailable native coverage.** A missing row means only that this source manifest has no matching registration. It does not prove a provider lacks a hook API, that an adapter is absent elsewhere, or that a local installed plugin has the same bytes. Confirm installed delivery and candidate-specific behavior separately.

## Source hashes

The hashes bind this generated page to the exact manifest bytes it read.

| Runner | Manifest | SHA-256 |
| --- | --- | --- |
| Claude Code | [`plugins/pipeline-core/hooks/hooks.json`](../plugins/pipeline-core/hooks/hooks.json) | `e708edd8e0e1bc82ed2936830f134e0938629f1b3b755b7a16d4e93ca5998572` |
| Codex | [`plugins/pipeline-core/hooks/codex-hooks.json`](../plugins/pipeline-core/hooks/codex-hooks.json) | `ec7e3d0f9f5df1ab73e8d5af431ab1f271cbe2a615f9c4135b65178a51a24c68` |
| Antigravity | [`plugins/pipeline-core/hooks.json`](../plugins/pipeline-core/hooks.json) | `3df5fc3e6d6aba4d31aee208cef31fcbfeadeae4a860a7832c06fba973e83d96` |
