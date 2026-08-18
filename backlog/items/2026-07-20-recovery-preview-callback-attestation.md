---
schema: "pipeline.backlog-item.v1"
id: "pipeline.recovery-preview-callback-attestation"
type: "defect"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "6b5157c186038cea33039acdd107b7214efbfc80"
closure_evidence: "plugins/pipeline-core/lib/recovery-preview-attestation.test.mjs"
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

- **Renewal (2026-08-18):** expired 2026-08-03 with an empty Triage section,
  never triaged in the ~4 weeks since filing. Found while checking whether
  this session's earlier NVA-A8-5 mischaracterization (trusting inherited
  matrix prose instead of a defining backlog item) recurred elsewhere — it
  had, on this item's own P2 dependent (`evidence-bound-review-retry-economics.md`,
  see that item's own Triage). Renewed with current evidence rather than
  left expired.
- **Decision:** accepted, closed. The implementation this item asked for is
  real and complete: `plugins/pipeline-core/lib/recovery-preview-attestation.mjs`
  satisfies every acceptance-boundary bullet in this item's own Proposal
  (one-invocation-one-acknowledgement; schema/digest/identity matching;
  every missing/malformed/replayed/mismatched acknowledgement returns a
  typed non-success, never advances state; no external identity/secret/
  network/private-receipt authority added). A dedicated Critic review
  (`69b96e19..6b5157c1`, functional-equivalent-read-only, this session)
  returned **PASS, no findings** — independently tracing and re-running the
  regression tests for both hardening fixes landed in `6b5157c1`
  (`safeId()`/`safeDigest()` type-coercion bypass; the cross-invocation
  cached-acknowledgement replay vulnerability in
  `runner-profile-migration-v3.mjs`). This is the "independent review and a
  sanctioned backlog transition" this item's own Description named as the
  only thing standing between the candidate and closure.
- **Rationale:** the code was already correct and tested; what was missing
  was purely process (the independent-review step, and someone actually
  reading this item rather than leaving it expired for two weeks while
  `docs/known-issues.md` kept citing it as open).
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18
