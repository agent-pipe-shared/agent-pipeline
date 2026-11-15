# ADR-0102: the main session is reminded to work in parallel

> Agent-Pipeline · Sprint Alfred · 2026-11-14

**Status:** accepted (2026-11-14, PO tile "idea one", register D254). Built in candidate 29e. Not yet used on a consumer repository.

**Context source (PO, 2026-11-14):** the PO asked agents to parallelize actively, and asked how that behaviour gets into a durable reminder that tells the agent again every few turns what to do. Of the proposed ideas the PO chose a short reminder from the hooks, preferring an existing hook over a new one.

## Context

A main session tends to fall back to serial work after a while: one read per message, one scout after another, test files run one by one. A rule in a role file is read once at bootstrap and fades from the context. The hooks already run at session start, after a compact and before every tool call, so they can repeat a short line without a new hook.

## Decision

1. **One short text,** `PARALLEL_REMINDER` in `plugins/pipeline-core/lib/parallel-reminder.mjs`: send independent read-only calls together, run independent read-only scouts and test files in parallel; the limits (never two heavy test suites at once, one write dispatch per message, no write to the tree while a write dispatch runs) are part of the same line.
2. **Three existing hooks carry it, no new hook:**
   - `hooks/setup-check.mjs` (SessionStart `startup|resume|clear`) emits it as context when it has no setup message to give;
   - `hooks/post-compact-reground.mjs` (SessionStart `compact`) appends it as the last line of the re-grounding;
   - `hooks/guard-dispatch-budget.mjs` (PreToolUse) adds it on every N-th tool call of the main session.
3. **Context only.** The every-N output carries `additionalContext` and never a `permissionDecision`: an `allow` would skip the user's permission prompt for that call. The reminder decides nothing.
4. **N is configurable** as `session.parallel_reminder_every` in `pipeline.user.yaml`, an integer from 0 to 1000; 0 turns the reminder off at all three points; absent or invalid means 25. The V3 validator and `scripts/pipeline-user-v3.schema.json` accept the key; `keep_awake` stays required in `session`.
5. **The counter is lock-free and fail-open:** one byte per main-session call in `<git-common-dir>/agent-pipeline/dispatch-budget/orchestrator-seen/<session>.calls`; the file size decides. Any error means no reminder; parallel calls can move a reminder by one call. Subagents are not counted.

## Consequences

- Claude Code gets the reminder at all three points.
- Codex gets it after a compact only where its session-start hint carries the compact text; its session start and every-N reminder are not wired. Antigravity has no SessionStart hook and no budget guard here. The reminder is therefore not runner-neutral, and is not reported as such.
- The budget guard's hook matcher does not cover every tool (for example Agent, Workflow and MCP tools), so N counts only the matched calls.
- `lib/parallel-reminder.mjs` joins the never-liftable kernel paths, since a kernel hook imports it.
