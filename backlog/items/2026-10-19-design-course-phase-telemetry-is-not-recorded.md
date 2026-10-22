---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-phase-telemetry-is-not-recorded
type: defect
owner: pipeline
status: closed
created: 2026-10-19
closed_at: 2026-10-22
closure_repository: self
closure_commit: 35455319327d44d5519671a13f0956583dd99a21
closure_evidence: backlog/items/2026-10-16-design-course-telemetry-is-deferred.md
source: "PO decision D25 (2026-10-18): the telemetry clause of greenfield-design-course-cost-and-proportionality leaves the 0.7.0 acceptance"
sprint: none
done_when: manual
---

**Rejected as a duplicate (backlog grooming 2026-10-22):** merged into `backlog/items/2026-10-16-design-course-telemetry-is-deferred.md`. Both are the telemetry clause split out of the greenfield-design-course-cost-and-proportionality item: record phase wall time, tool time and human wait separately and report model tokens only from trustworthy host counters. One producer plus one pin closes both. All content of this item is carried over verbatim into that item's section "Merged from `2026-10-19-design-course-phase-telemetry-is-not-recorded`"; nothing is lost.

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
