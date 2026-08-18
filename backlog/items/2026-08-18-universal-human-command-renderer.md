---
schema: pipeline.backlog-item.v1
id: pipeline.universal-human-command-renderer
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P0-3 (priority P0)"
---

# Introduce a universal renderer for human-executable commands

## Description

Two HGO (Human-Gated Operation) commands failed because of visual line
wraps in the middle of a path. The safe, bounded copyCommand renderer was
only adopted consistently at a later point in the workflow.

## Triggering situation

Observed during the greenfield happy-path test of pipeline version
0.6.0+codex.20260818162535.96cf805 in test repo Rune_Test1_Codex_060_52;
see Section 9, item P0-3 of the full report at
docs/pipeline-greenfield-happy-path-handover.md in that test repo.

## Affected artifact

HGO command rendering path; any coordinator emitting a human-executable
command.

## Proposal

Every pipeline action that a human must execute externally should deliver
exclusively structured executable/argv data plus a tested
copyCommand.posix|powershell|cmd rendering; agents must not freely format
such commands themselves.

Acceptance test: all generated handoff commands work after copy/paste in
a 72-column terminal, and no path or digest can be split apart by UI
wrapping.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
