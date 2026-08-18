---
schema: pipeline.backlog-item.v1
id: pipeline.happy-path-local-telemetry
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P2-2 (priority P2)"
---

# Add local telemetry for happy-path timing and turn/tool-call counts

## Description

Tool-call and human-turn explosion only became visible after the fact,
through manual transcript forensics. There was no built-in mechanism to
detect this during a run itself.

## Triggering situation

From a greenfield happy-path test report, pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52,
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Cites Section 9, item P2-2 ("Happy-Path-Telemetrie").

## Affected artifact

new local telemetry recorder, feature lifecycle instrumentation.

## Proposal

The pipeline should record locally, per feature: time to durable input;
time to PRD; time from approval to implementation; tool calls per phase;
human handoffs; guard denials and retries; signature attempts; and
review-lane success.

Acceptance test: a local completion report automatically shows whether
happy-path SLOs were met, without exporting any content or private data.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
