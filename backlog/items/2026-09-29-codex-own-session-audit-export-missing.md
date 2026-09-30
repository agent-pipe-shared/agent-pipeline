---
schema: pipeline.backlog-item.v1
id: pipeline.codex-own-session-audit-export-missing
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
source: "Codex 0.7.0 greenfield review: the approved transcript recovery lists prior sessions only and cannot provide an own-session path or reliable phase/token accounting for the running session."
sprint: alfred
done_when: manual
---

# Export bounded current-session audit metadata without exposing transcripts

The existing transcript-recovery API deliberately excludes the current
session. The greenfield review therefore could not substantiate token costs
or identify the current transcript through the approved route.

## Acceptance

- Add an explicit own-session host audit/export command that proves the active
  session and repository identity before returning bounded metadata.
- Keep transcript content private by default; reveal a path or content only
  under a distinct explicit read action and the host's file permission model.
- Report observed model identity, phase wall time and token counters only when
  supplied by the runner; use `unavailable` for absent data.
- Reject another session's ID, foreign repository metadata, aliases and
  unbounded content. Test Codex reconnect and honest unavailable readback.
