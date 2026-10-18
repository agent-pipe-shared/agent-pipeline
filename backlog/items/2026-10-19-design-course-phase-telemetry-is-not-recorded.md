---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-phase-telemetry-is-not-recorded
type: improvement
owner: pipeline
status: open
created: 2026-10-19
source: "PO decision D25 (2026-10-18): the telemetry clause of greenfield-design-course-cost-and-proportionality leaves the 0.7.0 acceptance"
sprint: none
done_when: manual
---

# Design course phase telemetry is not recorded

## Description

The greenfield design course report (`greenfield-design-course-cost-and-proportionality`)
could only estimate where its time went: the split between agent work, tool time and human
wait was a guess, not a measurement. That item asked to record the split. PO decision D25
moved this clause out of the 0.7.0 acceptance; the other clauses of that item stay in 0.7.0.

## Triggering situation

Any design course (intake, readiness rounds, PRD/Spec authority signatures) whose cost the
PO or a retro wants to judge from data instead of an estimate.

## Proposal

Record, per design-course phase, wall time, tool time and human wait as separate measured
values. Report model tokens only where the host supplies trustworthy counters, and say so
when it does not.

## Acceptance

- Each design-course phase records wall time, tool time and human wait separately, from
  measured timestamps, not estimates.
- Model tokens appear only where the host supplies trustworthy counters; otherwise the
  record says the counter is unavailable.
- A pin covers one phase with a human wait and one without.
