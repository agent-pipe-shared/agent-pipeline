---
schema: pipeline.backlog-item.v1
id: pipeline.claude-session-start-emits-codex-transcript-recovery-hint
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Manual observation, Claude Code session on Windows, 2026-10-03, SessionStart:startup additional context."
sprint: alfred
done_when: manual
---

# Claude SessionStart emits a Codex-specific transcript recovery hint

## Description

The Claude plugin's `hooks.json` wires `hooks/codex-session-start-hint.mjs` into
the Claude `SessionStart` (`startup|resume|clear`) matcher. In a Claude Code
session it injected context instructing the agent to run
`runner-transcript-recovery.mjs list ... --runner codex`, which lists prior
**Codex** transcripts, and to never search `$CODEX_HOME`/`~/.codex`. For a Claude
session that is the wrong runner. Either the hint is wrongly wired for Claude or
the script fails to parameterise the runner. The injected text also embeds
absolute host paths of the installed plugin and repository.

Positive part: activation is now detected correctly ("Agent Pipeline is active
for this repository"). The earlier "not active in this folder" message came
from a session that started on a branch without `project/pipeline.json`.

The adjacent `staleness-check` line reported `ref=refs/heads/main` and
`reason=timeout` while the checkout is on `feat/sprint-alfred`. Whether that
ref choice is intended for the alpha channel should be checked in the same
pass.

## Triggering situation

Clean session start, 2026-10-03, observation 1 from the previous session's
kickoff notes.

## Affected artifact

`plugins/pipeline-core/hooks/hooks.json` (TP-4 protected) and
`plugins/pipeline-core/hooks/codex-session-start-hint.mjs`.

## Proposal

Decide whether a Claude-side transcript recovery hint is wanted. If it is,
derive `--runner` from the hosting runner (or ship a Claude-specific hook). If
it is not, remove the wiring from the Claude hook set. Add a test asserting
that the Claude SessionStart output never names another runner.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
