---
schema: pipeline.backlog-item.v1
id: pipeline.typed-plugin-update-next-action
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "admin-step inventory (docs/admin-steps-inventory.md), decision AO"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Typed plugin-update next action

## Description

Two admin-step inventory rows (Claude Code: marketplace/plugin update plus `/reload-plugins`; Codex: update via
`/plugins` then `/new`; both per session when an update is recommended, PO) are classified automatable: the
bootstrap helper deliberately never updates, but a typed next action could offer the runner's update command instead
of prose. Source: `docs/admin-steps-inventory.md` runner rows (lines 41 and 51), candidate 5;
`harness/session-bootstrap.md:211`, `:181`.

## Triggering situation

When an update is recommended, bootstrap prints prose and the PO performs the update steps by hand each session.
The operator boundary (helper never updates or restarts) must stay explicit.

## Affected artifact

The bootstrap next-action output (`plugins/pipeline-core` start preflight) and `harness/session-bootstrap.md`.

## Proposal

Offer the runner's update command as a typed next action, keeping the update itself an explicit operator step.
Owner: pipeline; due 2026-10-31.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** decision AO: automatable admin step.
- **Assignment (if accepted):** post-0.7.0 automation lane unless pulled in.
- **Date:** 2026-10-08
