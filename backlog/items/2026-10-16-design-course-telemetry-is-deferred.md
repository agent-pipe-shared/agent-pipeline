---
schema: pipeline.backlog-item.v1
id: pipeline.design-course-telemetry-is-deferred
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-16
source: "PO decision 2026-10-16 #2 on pipeline.greenfield-design-course-cost-and-proportionality (AC-160)"
sprint: none
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

## Merged from `2026-10-19-design-course-phase-telemetry-is-not-recorded` (created 2026-10-19; merged 2026-10-22)

*Carried over verbatim from the item closed as a duplicate of this one. What is unique to it: From the 2026-10-19 item: record explicitly says the token counter is unavailable when the host supplies none; the pin must cover one phase with a human wait and one without; the deferral rests on PO decision D25 (2026-10-18), which should be cited next to the canonical's PO decision 2026-10-16 #2. The canonical additionally carries the affected files, the hard-coded phaseWallTime 'unavailable', and un-skipping the typed skip in plugins/pipeline-core/lib/pins/greenfield-design-course-cost-and-proportionality.test.mjs.*

**Front matter of the merged item, verbatim (status/ledger fields of the original):**

```yaml
schema: pipeline.backlog-item.v1
id: pipeline.design-course-phase-telemetry-is-not-recorded
type: defect
owner: pipeline
status: open
created: 2026-10-19
source: "PO decision D25 (2026-10-18): the telemetry clause of greenfield-design-course-cost-and-proportionality leaves the 0.7.0 acceptance"
sprint: none
done_when: manual
```

#### Description

The greenfield design course report (`greenfield-design-course-cost-and-proportionality`)
could only estimate where its time went: the split between agent work, tool time and human
wait was a guess, not a measurement. That item asked to record the split. PO decision D25
moved this clause out of the 0.7.0 acceptance; the other clauses of that item stay in 0.7.0.

#### Triggering situation

Any design course (intake, readiness rounds, PRD/Spec authority signatures) whose cost the
PO or a retro wants to judge from data instead of an estimate.

#### Proposal

Record, per design-course phase, wall time, tool time and human wait as separate measured
values. Report model tokens only where the host supplies trustworthy counters, and say so
when it does not.

#### Acceptance

- Each design-course phase records wall time, tool time and human wait separately, from
  measured timestamps, not estimates.
- Model tokens appear only where the host supplies trustworthy counters; otherwise the
  record says the counter is unavailable.
- A pin covers one phase with a human wait and one without.
