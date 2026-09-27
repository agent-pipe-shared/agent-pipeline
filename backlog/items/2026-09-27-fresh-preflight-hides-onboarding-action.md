---
schema: pipeline.backlog-item.v1
id: pipeline.fresh-preflight-hides-onboarding-action
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-05, 2026-09-27; reported preflight plugin-refresh-required with advisory nextAction in a fresh self-application project."
sprint: none
done_when: manual
---

# Fresh-project preflight should surface the executable onboarding action

## Description

The Claude consumer's first preflight returned `plugin-refresh-required` with
an advisory next action even though the project had not been onboarded. The
agent had to find the onboarding driver in documentation. Refresh status may
still matter, but it did not tell the agent how to progress on the primary
fresh-project path. This is a reported usability issue; the exact self-
application source-attestation decision needs replay.

## Affected artifact

`pipeline-start-preflight.mjs`, pipeline-start guidance, and onboarding action
projection.

## Proposal

Expose the actual `onboarding-init`/inspection action as the primary next
action when it is admissible. Carry plugin-refresh status separately as an
advisory unless it truly prevents the onboarding action.

## Acceptance

- A fresh self-application Claude project gets a concrete runnable next
  action from preflight without searching skill prose.
- A genuinely incompatible plugin still produces a blocking refresh action.
- The action and advisory each state their authority and do not contradict
  onboarding inspection.

## Triage

