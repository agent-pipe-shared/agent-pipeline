---
schema: pipeline.backlog-item.v1
id: pipeline.elephant-main-context-spent-on-wake-ups-and-inline-reads
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Measurement of one long Elephant session (main thread, about 1,900 API responses), Agent-Pipeline Claude/Windows 2026-10-05; first findings in scratch/elephant-load/FINDINGS.md."
sprint: alfred
done_when: manual
---

# Elephant main context spent on wake-ups and inline reads

## Description

Measured on one long Elephant session (main thread, about 1,900 API responses): about
26 % of main-context tokens are one-line replies to stop-hook / goal / task-notification
wake-ups, about 22 % inline investigation (reads, git, search), 5.4 % guard refusals and
10 % persistence/briefing authoring.

The causes are structural: wake-up loops, delegation that is costlier per action than
inline work, `Explore`/`Plan` dispatch refused, guard false positives, and hand-written
briefings.

PO target: at most 10 % pipeline administration.

## Acceptance

- A repeatable measurement tool exists in the repository (C1 telemetry).
- One enforcement-layer measure per cause, each with a before/after measurement.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
