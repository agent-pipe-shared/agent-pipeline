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

## Observed 2026-10-17: forensic export not completable on a grown session store (major for 0.7.0)

Source: PO-supplied forensic analysis of the Codex WSL greenfield run, finding P1-2
(confirmed).

- Direct reads of the session directory are refused (`GUARD-READ-SCOPE-OUTSIDE-ROOT`),
  which is the intended privacy boundary.
- The repository-bound adapter, called with correct consent, failed with
  `scan-bound-exceeded` on the grown session store.
- Its list/read route needs the current exclusion session id, and there is no admitted way
  to hand that id over (shell variable and `printenv` are refused).
- Consequence: the requested runtime and token analysis could not be done at all.

Added acceptance (0.7.0, major):

- One repository-bound export determines the current session itself, finds every parent
  and child segment of this repository, reports start/end events and token deltas,
  pseudonymizes private identifiers and states completeness and limits explicitly.
- It works without an environment query and without a PO signature series.
- A scaling test with many foreign sessions in the store stays within the scan bound
  (indexed or repository-filtered scan) and reports truncation honestly.
