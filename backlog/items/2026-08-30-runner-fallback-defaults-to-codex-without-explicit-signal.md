---
schema: pipeline.backlog-item.v1
id: pipeline.runner-fallback-defaults-to-codex-without-explicit-signal
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- surfaced 2026-08-30 while cross-checking the Claude/Windows greenfield retrospective (docs/pipeline-retrospective-claude-060-78.md, section 8) against current code; confirmed still present, unfixed."
source: "Claude-060-78 greenfield retrospective, section 8, tool defect 1; verified live against plugins/pipeline-core/scripts/pipeline-state.mjs:5938-5939 on 2026-08-30."
---

# `resolvePoRebindRunner()` defaults to "codex" in a human terminal with no runner signal

## What happened

`plugins/pipeline-core/scripts/pipeline-state.mjs` around line 5938:

    return explicitRunner ?? (env.CLAUDECODE === "1" ? "claude"
      : (env.ANTIGRAVITY_AGENT === "1" || env.AI_AGENT === "antigravity") ? "antigravity"
      : "codex");

When no `--runner` flag is given AND none of `CLAUDECODE`/`ANTIGRAVITY_AGENT`/
`AI_AGENT` is set in the environment -- exactly the case of a human typing
the command directly in a plain terminal, not through any of the three
supported AI runners -- this silently resolves to `"codex"` rather than
refusing or asking. A human operator gets attributed to the wrong runner
with no warning.

## Proposal

Make the fallback fail closed instead of guessing: when no explicit
`--runner` and no recognized runner env var is present, either (a) refuse
with a clear error asking for an explicit `--runner`, or (b) resolve to a
distinct `"human"`/`"unknown"` runner identity rather than silently
defaulting to `"codex"`. Pick whichever this repository's runner-identity
schema and its downstream consumers (attribution, dispatch routing) already
support without a breaking change.

## Acceptance criteria

- A call with no `--runner` and no runner env var set does NOT silently
  resolve to `"codex"`.
- Regression test added exercising exactly this case.

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30 alongside 3 sibling findings from
  the same retrospective cross-check
- **Date:** 2026-08-30
