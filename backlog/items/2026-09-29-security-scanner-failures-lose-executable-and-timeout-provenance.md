---
schema: pipeline.backlog-item.v1
id: pipeline.security-scanner-failure-provenance
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-29
done_when: manual
source: "Read-only scanner policy/provenance audit, 2026-09-29; frozen manifest df50d7e8f373d694f07579119add740081c0ca636a71c46f77f72b6b2c9edaba."
---

# Retain enough scanner provenance to diagnose a failed native scan

## Confirmed observation

The shipped security CLI reported a Semgrep timeout after 60000ms and returned
blocking exit2 during the fresh-consumer PUSHSEED test. The retained output does
not identify the selected executable or version, or preserve timeout child output
and logs. The producer records an executable SHA in v1 evidence, but that evidence
is deleted with the test fixture. V2 tool version is null. The adapter deletes its
temporary log before returning the timeout result.

This confirms diagnostic loss. It does **not** establish why Semgrep stalled.
The original native acceptance remains pending; missing-tool SKIPPED and a clean
empty-required-capability verdict are not native scanner PASS.

## Improvement

Retain a bounded, sanitized diagnostic artifact identifying the assessed tool and
version when observed, executable/rules/candidate digests, child exit/error/signal
and elapsed time, and useful timeout diagnostics before cleanup. State unknown or
unobserved fields explicitly. Preserve ERROR classification, deadlines, trust
boundaries and cleanup; do not persist secrets or unrestricted child output.

Acceptance: completed, missing, refused and timed-out scanner cases remain
distinguishable; diagnostic retention cannot convert a failed scan to PASS.
Deterministic public-CLI fixture coverage and genuine native scanner acceptance
must be reported separately.

## Evidence and related work

Audit: `scratch/0.7-scanner-policy-provenance-20260929/final-manifest.json`.
Actual timeout: frozen full184 manifest `3472d2fb8993458dc1d14371ce8774ff046f567ba0502c1f4b5452db9b23e59a`, output309–325.
The closed August11 per-rule timeout and August28 scanner-packaging/PATH items
address different established causes; this item does not reopen their closures.

Subsequent native diagnosis retained the information the original failure lost:
manifest `353c87ae359c905eb54a5150e87170948dfdc21d2212888df4097d8b1d89ed7e`
shows successful scan summary followed by process timeout. A separate
version-check-disabled minimal fixture completes, manifest
`7bc0847b24fb7b11ef3e9a4342a0750dd042fd36450d9ea90bfe5b93648a1a28`.
These diagnostic helpers are not a delivered production retention feature or
qualification of the original PUSHSEED callback. Assessment and limits:
`scratch/0.7-native-semgrep-bounded-diagnosis-20260929/assessment.md`.
