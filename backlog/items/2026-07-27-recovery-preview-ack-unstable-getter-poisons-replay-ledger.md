---
schema: pipeline.backlog-item.v1
id: pipeline.recovery-preview-ack-unstable-getter-poisons-replay-ledger
type: defect
owner: pipeline
status: open
created: 2026-07-27
source: CYB-A0 round-2 Critic re-review (new-issue N1), found while verifying the fix for round-1 F1-F5 in plugins/pipeline-core/lib/recovery-preview-attestation.mjs
---

# `acknowledgementId` read three times without a stable local snapshot

## Description

`attestRecoveryPreviewDelivery` (`plugins/pipeline-core/lib/recovery-preview-attestation.mjs`)
reads `acknowledgement.acknowledgementId` three separate times inside one call:
validation (~line 100), the replay check (~line 105), and the returned
`usedAcknowledgementIds` postimage construction (~line 112) — with no local
variable snapshotting the value once.

## Triggering situation

A caller-supplied acknowledgement object with a non-idempotent
`acknowledgementId` getter (e.g. one that returns a different string on each
read) can pass `safeId()` validation and the `RP-ACK-REPLAY` check using one
value, then contribute a *different*, unvalidated or already-consumed value
to the returned `usedAcknowledgementIds` array. Confirmed by direct
reproduction during the round-2 Critic pass: 3 reads produced a result whose
`usedAcknowledgementIds` postimage carried an already-used id
(`["ack-already-used","ack-already-used"]`) despite `ok: true`.

## Affected artifact

`plugins/pipeline-core/lib/recovery-preview-attestation.mjs`
(`attestRecoveryPreviewDelivery`).

## Impact assessment (not a re-open of CYB-A0)

Availability/robustness only, not an authorization bypass: the poisoned
postimage is itself rejected by the `Set`-dedup guard
(`RP-USED-ACKS-INVALID`) on the caller's *next* call, so the module fails
closed downstream. Also currently unreachable in practice — the sole
in-repo consumer (`authorizePendingTransactionRecoveryV3` in
`runner-profile-migration-v3.mjs`) neither threads `usedAcknowledgementIds`
across calls nor reads `delivery.acknowledgement` back out. Pre-existing
(predates the CYB-A0 round-1 fix commit `c7546a4`), not a regression it
introduced — flagged because that fix's F3 hardening moved this exact code
block without stabilizing the read.

## Proposal

Snapshot the value once inside the `try` block, e.g.
`const acknowledgementId = acknowledgement.acknowledgementId;`, and use the
local for all three reads (validation, replay check, postimage). A small,
mechanical, additive fix — no behavior change for any well-behaved
(non-hostile-getter) acknowledgement object.

## Ownership and expiry

The next Pipeline Elephant owns triage. No due date — this is a hardening
line, not a time-triggered item; does not block CYB-A0's closure.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
