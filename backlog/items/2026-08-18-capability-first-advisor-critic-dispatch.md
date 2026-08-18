---
schema: pipeline.backlog-item.v1
id: pipeline.capability-first-advisor-critic-dispatch
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-18
source: "Rune happy-path handover report, greenfield test of pipeline 0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52 (external, not this checkout): docs/pipeline-greenfield-happy-path-handover.md, Section 9, item P1-2 (priority P1)"
---

# Capability-first ordering for Advisor and Critic dispatch transport

## Description

Evidence gathering, consent requests, and wait times currently occur
before a usable transport has been demonstrated. This means costs are
incurred even when the underlying sandbox lane is not actually available.

## Triggering situation

From a greenfield happy-path test report (pipeline version
0.6.0+codex.20260818162535.96cf805, test repo Rune_Test1_Codex_060_52),
full report at docs/pipeline-greenfield-happy-path-handover.md in that
test repo. Section 9, item P1-2.

## Affected artifact

Advisor/Critic dispatch coordinator, selected-sandbox preflight.

## Proposal

Reverse the order of operations: (1) run a model-free preflight of the
selected-runner transport; (2) if unavailable, immediately record a
deferred state note and continue; (3) only once a usable lane is
confirmed, proceed to export consent, packet assembly, and model start.

Acceptance test: if the sandbox lane is missing, the entire Advisor/Critic
path must end in under ten seconds, with no export question, no bundle,
no PTY wait, and no model attempt.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
