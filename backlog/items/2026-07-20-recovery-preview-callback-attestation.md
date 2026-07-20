---
type: defect
status: new
created: 2026-07-20
source: Public V3 Foundation stabilization review of the migration recovery boundary
due: 2026-07-27
---

# Attest recovery-preview callback delivery

## Description

The migration recovery path can currently accept a callback that returns without
demonstrating that the recovery preview was delivered. A no-op callback can
therefore look indistinguishable from a completed preview handoff, which makes a
successful recovery result stronger than the available evidence.

## Triggering situation

The Public V3 Foundation stabilization on 2026-07-20 confirmed the open boundary
already listed in `docs/known-issues.md`: callback presence alone does not attest
delivery of the preview.

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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
