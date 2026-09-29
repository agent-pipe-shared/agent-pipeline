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

## PO scope and architecture decision — 2026-09-29

The PO explicitly selected **“G13 aufnehmen gemäß Vorschlag”**. This accepts G13
implementation scope and the architecture package at
`scratch/0.7-scanner-diagnostics-scope-proposal-20260929/architecture-decision-proposal/manifest.json`,
SHA `4e31e11bcd6e683b82dd86165440d122062e90d0686fd63739e9612667edd06e`.
The genuine chat decision is recorded in `scratch/0.7-g13-po-decision-20260929.md`.
The Source contract is `docs/adr/draft-scanner-diagnostic-sidecar.md` with its
digest-bound `pipeline.architecture-decision.v1` companion.

Implementation must preserve the package's closed diagnostic-only schema,
bounded privacy projection, verdict independence, candidate/evidence binding,
safe descriptor-relative publication and honest unavailable behavior. The older
inert patch remains a sketch, not approved conformant implementation. Ordinary
implementation may proceed under this contract.

## Progress — implementation evidence

Seven product files are delivered in Source. Actual qualification passes the
original147 security cases, 11 descriptor cases and 24 new diagnostic cases
with real FD3 for the new suite; receipt SHA
`1d962bcc0fa26b8544cd33b43c413070d93075f99806c778fa6eba931b817ea8`.
The protected documentation/registration successor is held for its exact
signature. Whole-candidate Verify, independent Critic, installation and native
scanner acceptance remain pending; these Source checks do not replace them.

This item remains open with manual completion. The decision is not a signature,
protected-write capability, implementation/native PASS, new lifecycle approval
or installed acceptance. Formal ADR ordinal/status acceptance follows ADR-0069
at actual trunk acceptance; proposed machine status does not negate the genuine
PO implementation authorization. Existing historical failure paragraphs and
receipts above retain their original observation context.

Additional quality review found a diagnostic candidate-binding gap. The decoder
now requires the evidence payload digest and all three actual candidate identity
fields; valid but different candidate metadata is refused. Existing diagnostic
corpus24/24 passes, including candidate mismatch controls and the public CLI
missing-tool fixture isolated from host HOME fallback. The bounded manual
correction review and final whole-candidate qualification remain separate gates.
