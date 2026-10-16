---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-telemetry-is-deferred
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 #2 on pipeline.greenfield-design-course-cost-and-proportionality (AC-160)"
sprint: post-0.7.0
done_when: manual
---

# Design-course telemetry is deferred

## Description

The original item `pipeline.greenfield-design-course-cost-and-proportionality`
(`backlog/items/2026-09-29-greenfield-design-course-cost-and-proportionality.md`,
section "Acceptance", telemetry clause) requires recording phase wall time, tool
time and human wait separately for a greenfield design course, and reporting model
tokens only where the host supplies trustworthy counters. No source produces these
measurements today: the runner session audit carries a hard-coded
`phaseWallTime: 'unavailable'`, and no `humanWait` or `toolTime` field exists in
any design-course source. The regression pin
`plugins/pipeline-core/lib/pins/greenfield-design-course-cost-and-proportionality.test.mjs`
carries this clause as a typed deferred skip.

## Triggering situation

A 3 h 41 min greenfield design course whose time split was only an estimate, not
measured telemetry (see the original item's source field).

## Affected artifact

`plugins/pipeline-core/lib/runner-own-session-audit.mjs`,
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`, and the deferred skipped
case in the pin named above.

## Proposal

Add a producer that records phase wall time, tool time and human wait as separate
measured fields for a design course, and token counts only from trustworthy host
counters. Then remove the `skip` from the pin's telemetry case so it runs green.

## Acceptance

- Phase wall time, tool time and human wait are recorded as three separate fields.
- Model tokens appear only where the host supplies trustworthy counters.
- `phaseWallTime` is no longer a hard-coded `'unavailable'` where a measurement exists.
- The deferred telemetry case in the pin is un-skipped and green.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred.
- **Rationale:** PO decision 2026-10-16 #2 defers design-course telemetry; it is outside 0.7.0.
- **Assignment (if accepted):** post-0.7.0; owner Coordinator for the deferral, pipeline for the work.
- **Date:** 2026-10-16
