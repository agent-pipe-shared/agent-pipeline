---
schema: "pipeline.backlog-item.v1"
id: "pipeline.recovery-preview-callback-attestation"
type: "defect"
owner: "pipeline"
status: "open"
created: "2026-07-20"
source: "Public V3 Foundation stabilization review of the migration recovery boundary"
due: "2026-07-27"
expires: "2026-08-03"
---

# Attest recovery-preview callback delivery

## Description

The migration recovery path previously accepted a callback that returned without
demonstrating that the recovery preview was delivered. The current Public
candidate adds a structured acknowledgement, but the item remains open until
that candidate has independent review and a sanctioned backlog transition.

## Triggering situation

The Public V3 Foundation stabilization on 2026-07-20 confirmed the boundary
listed in `docs/known-issues.md`: callback presence alone did not attest delivery
of the preview. The first implementation candidate is now present in the
Public Core; this record remains the review/transition authority.

## Affected artifact

The public V3 migration recovery library, its recovery result contract, and the
targeted positive and fail-closed tests for preview delivery.

## Proposal

Require a structured callback acknowledgement bound to the exact recovery
preview digest and invocation. Recovery may report preview delivery only after
that acknowledgement validates. An absent callback, empty/no-op return,
exception, timeout, replayed acknowledgement, or digest mismatch must return a
typed non-success result and must not advance recovery state.

The acceptance boundary is:

- one preview invocation produces one acknowledgement bound to that preview;
- success requires matching schema, preview digest, and invocation identity;
- every missing, malformed, replayed, or mismatched acknowledgement is covered
  by deterministic negative tests and creates no delivery or recovery-success
  claim; and
- the design adds no external identity, secret, network service, or private
  receipt authority.

This is **P1** because it closes a false-success boundary in recovery. The owner
is the next Pipeline Elephant, who should cut an independently reviewable public
implementation package. Target review date: **2026-07-27**.

## Ownership and expiry

The next Pipeline Elephant owns triage, independent review, and the accepted
implementation package.
The triage due date is **2026-07-27**. If no decision is recorded by
**2026-08-03**, this item expires and must be renewed with current evidence
before further implementation or prioritization.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
