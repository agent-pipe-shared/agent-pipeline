---
schema: pipeline.backlog-item.v1
id: pipeline.repeated-lifecycle-denials-are-not-counted
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
source: "Claude/Windows greenfield review F-11, 2026-09-27; reported seven lifecycle refusals but denial-class telemetry contained only the outside-root read class; source says lifecycle denials remain outside that recorder."
sprint: none
done_when: manual
---

# Repeated lifecycle refusals need a deadlock signal

## Description

The Claude consumer reports seven `GUARD-LIFECYCLE-NOT-READY` refusals during
onboarding, while its denial-class record listed only the outside-root read
refusal. The guard source explicitly keeps lifecycle denials outside the
current class recorder. Repeated refusal of the exact returned next action is
therefore invisible to a machine-readable loop detector.

## Affected artifact

`guard-lifecycle-ready.mjs`, denial telemetry, repair-map guidance, and
session-facing recovery hints.

## Proposal

Record a bounded, privacy-safe lifecycle denial fingerprint containing phase,
action kind and reason code, then detect repeated identical refusals of a
returned action. Escalate to a distinct safe recovery/PO-visible diagnostic
instead of recycling the same inspection instruction.

## Acceptance

- Two identical returned-action refusals produce a detectable loop signal and
  an actionable, non-repeating recovery path.
- Telemetry stores no command payload, secret path or user content.
- A fixture distinguishes a legitimate retry after state change from a loop.

## Triage

