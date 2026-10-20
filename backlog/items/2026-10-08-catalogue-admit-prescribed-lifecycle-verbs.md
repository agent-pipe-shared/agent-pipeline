---
schema: pipeline.backlog-item.v1
id: pipeline.catalogue-admit-prescribed-lifecycle-verbs
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Catalogue-admit prescribed lifecycle verbs

## Description

Admin-step inventory row C12 (hand-run lifecycle verbs refused to the agent: `present-plan`,
`design-course-session --run-v2`, continuity writes, run via `!`; per design course, PO terminal) is classified
automatable: catalogue-admit every verb the course prescribes. Source: `docs/admin-steps-inventory.md` row C12,
candidate 4; toil log:27, :29, :30 (T21, T23, T24).

## Triggering situation

Toil rows T21/T23/T24 (toil log:27, :29, :30): the design course prescribes verbs that the agent is then refused,
so the PO runs them by hand.

## Affected artifact

The command catalogue / guard admission in `plugins/pipeline-core` and the design-course lifecycle verbs.

## Proposal

Every verb the course prescribes runs for the agent in the state where it is prescribed.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08

## Observed 2026-10-20: Codex WSL greenfield, second run (blocker)

Source: PO-supplied forensic analysis of a Codex greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_codex2_20261020.md`), installed `pipeline-core`
`0.7.0+codex.20261020064459.a8ddf85`, chat approval mode. The run never reached the first
implementation dispatch. The PO puts the report's blockers and majors into the next candidate (D64).

- Prescribed preparation before implementation was refused as opaque execution, so the PO had to
  grant four chat one-time overrides: the route selection `model-role-dispatch-select.mjs`, the
  initial and the final design-review receipt producer, and the delta receipt (the last one still
  unanswered at the stop). The architecture baseline diagnosis, `pipeline-state.mjs --help` and the
  optional model-role bootstrap readback (`GUARD-DEVPLAN-SHELL`) were refused the same way, and
  `approve-plan` rendered with an absolute node executable was refused while the plain `node`
  spelling passed.

Added acceptance (0.7.0, blocker, D64):

- Every fixed installed entry point that the Pipeline prescribes before the first implementation
  dispatch (route selection, design-review receipt production, architecture materialization and
  baseline diagnosis, feature-package registration, the help and readback forms it documents) is
  admitted in the lifecycle state that prescribes it, in the closed argument forms it documents and
  in the spelling its own next-action rendering emits, absolute node path included.
- One integration test runs with the real guards from a fresh repository to the first
  implementation dispatch (route selection, review receipt, architecture materialization,
  registration) and needs zero human guard overrides.
