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

## Prepared Codex loop diagnosis (2026-09-28)

A source proposal now separates actual offered-command equality from existing
admission. Only an exact returned Codex command refused by the final session
readiness gate is counted. Two refusals against the same observed nine-digest
binding projection retain exit 2 and `GUARD-LIFECYCLE-NOT-READY`, but return a
typed loop diagnostic and the plugin's admitted read-only repair-map action.
The emitted copy command itself is tested against the actual guard.

Twenty registered private-storage cases and five actual guard-adapter cases
pass. Coverage includes changed bindings, admission/foreign-attempt reset,
caller isolation, missing/ambiguous identity, malformed storage, physical
aliases, publication faults and persisted-byte privacy. The new storage
schema's session ID coercion was caught during preparation and corrected with
an explicit string check and negative fixtures.

The broader proposed guard run returned 260 passing and two failing cases.
The missing Spec-marker plan snapshot was corrected; all three related
producer/admission parity cases now pass. The remaining ordinary manifest
test reads unchanged canonical `hooks.json`; a separate digest-bound check
confirms the proposed manifest has the required matcher, without claiming the
ordinary test passed. Raw artifact reads and subprocesses remain canonical
under the selected import hook.

Evidence: `scratch/lifecycle-denial-guard-preparation-evidence.json` and
`scratch/lifecycle-denial-guard-integration-contract.md`. This is Linux-only
telemetry; unresolved Codex caller identity still needs host proof. There is
no complete event-history guarantee across storage failures, global scope
retention guarantee or new admission authority. Productive integration,
canonical Verify, installed Codex replay and formal release stamps remain
pending. This item stays open; no new signature was requested.

## Actual Codex recovery guidance loss (2026-09-29)

A fresh Source advisory qualification was refused before execution with
`GUARD-LIFECYCLE-NOT-READY`. Subsequent Source and installed canonical
inspections reported ready; that later observation does not establish the
readiness state at refusal time or authorize a retry. The exact refusal is
preserved in
`scratch/0.7-fresh-actual-source-onboarding-advisory-qualification-20260929/advisory-launch-denial.json`.
No alternate execution shape or fabricated receipt followed.

Independent Source inspection confirms a narrower recovery defect:
`lifecycleNotReadyRecovery` in `human-guard-override.mjs` retains only the
first line of the lifecycle guard reason. The Codex adapter then emits that
header and a fixed request for technical repair. Existing detailed recovery
guidance from later lines is discarded. The denied action supplies no native
payload digest or readiness provenance, so the underlying partial-state cause
remains unconfirmed; the historical September 20 temporary-file cause must
not be assumed.

Preserve bounded actionable lifecycle guidance through the non-liftable HGO
and Codex response without changing admission, counting a legitimate state
change as a loop, storing command payloads, or authorizing an automatic retry.
Qualify the actual adapter response; a library-only shape is insufficient.
