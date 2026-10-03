---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-budget-lock-refuses-every-subagent-call-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-03: a pipeline-core:goldfish-deep authoring dispatch (ALFRED-FR-AUTHOR-1) was refused on every tool call, including Read."
sprint: alfred
done_when: manual
---

# On native Windows every Pipeline subagent tool call is refused by the dispatch-budget lock

## Description

A `pipeline-core:goldfish-deep` dispatch from a Claude Code session on native
Windows could not execute a single tool call. Read, Write and Bash were all
refused with
`DISPATCH-BUDGET-INPUT-INVALID ... invalid budget state (counter-lock-owner-ambiguous)`.

Root cause from source: `localCounterLockOwner()` in
`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs:420-433` throws
`counter-lock-owner-ambiguous` whenever `process.platform !== "linux"`, because
lock ownership is derived from `/proc` (`boot_id`, process start). The guard can
therefore never acquire its counter lock on Windows or macOS.
`counterLockOwnerState` (`:499-512`) likewise returns `ambiguous` for every
non-Linux platform. As a result no Goldfish or Critic dispatch can work under
Claude on Windows, though ADR-0051 makes native Windows a hard platform
requirement. Read-only `general-purpose` agents were unaffected; apparently only
Pipeline role agents are budget-counted.

Second, related observation: the subagent's first `Write` (its mandatory
dispatch record) was refused with `GUARD-BOOTSTRAP-RECEIPT-MISSING`, which told it
to run the preflight first. Neither `templates/prompts/goldfish-task.md` nor the
generated obligations tell a Goldfish to run the preflight, or which exact
(backslash) spelling is admitted on Windows (see
`2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight.md`).

## Acceptance

- The counter lock has a cross-platform owner identity (for example
  Windows PID plus process creation time via a supported API, or an
  advisory-file-lock primitive) with the same live/dead/ambiguous semantics.
- A native-Windows regression test runs a budget-counted subagent through
  Read, Write and Bash calls under the real hook.
- The Goldfish/Critic briefing templates state the exact bootstrap-receipt step
  a dispatched role must perform before its first write, admitted on every
  platform spelling.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
