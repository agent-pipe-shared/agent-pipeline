---
schema: pipeline.backlog-item.v1
id: pipeline.empty-trust-anchors-admit-any-self-made-key-at-the-design-approval-boundary
type: security
owner: pipeline
status: open
created: 2026-10-09
source: "ADR0085-T2c dispatch observation; Elephant read of critical-human-proof-policy.mjs and guard-devplan-policy.mjs"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# Empty trust anchors admit any self-made key at the design-approval boundary

## Description

`verifyAgainstTrustAnchors` (`plugins/pipeline-core/lib/critical-human-proof-policy.mjs:536-546`) treats an empty anchor
list as "any well-formed key may sign": it derives the trust identity from the proof itself and checks only that the
signature verifies. The implementation boundary passes exactly that list when the repository's critical-human-proof
policy has no anchors (`plugins/pipeline-core/lib/guard-devplan-policy.mjs:129-132`:
`trust.trustAnchors ?? (trust.trustAnchor === null ? [] : [trust.trustAnchor])`). It then calls
`verifyStoredDesignWorkflowPackageSignature`.

So in a repository with no anchors, a signature-mode design approval is proof of self-consistency, not of the PO: any
process that can generate an Ed25519 key can produce a proof the boundary accepts. The posture is documented in the
function's doc comment (`:520-525`) as the v3 default, so this is a design question, not an accidental bug. In this
repository the anchors are populated, so the live effect here is nil.

## Triggering situation

2026-10-09 early morning: the ADR0085-T2c test slice (`6f9aba5a0`) noted it while pinning the stored verifier. Every S
pin uses a non-empty anchor list, so the empty-list posture is unpinned.

## Affected artifact

`lib/critical-human-proof-policy.mjs` (the posture), `lib/guard-devplan-policy.mjs` (the boundary caller), and any other
signature-mode caller that can pass an empty list. Not yet enumerated.

## Proposal

Recommended: in signature mode, the design-approval boundary refuses an empty anchor set with a typed code (for example
`DAA-PO-APPROVAL-TRUST-ANCHORS-EMPTY`) and names the setup command that pins a key. The general "any well-formed key"
posture stays where a caller explicitly opts into it. Two things are needed first:

- an enumeration of every caller that can pass an empty list;
- a check of whether onboarding or `approve-plan` always pins the signing key into `trustAnchors` before the boundary
  is first reached (WP-B2-4 TOFU), so a fresh repository is not locked out.

This is a security-posture change: PO decision required (PO list, 2026-10-09).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** rejected as a defect — by design (PO, Ruling 157).
- **Rationale:** PO: "Das ist so gewollt! Die Pipeline sperrt den Agenten ein und nicht den human." The Pipeline
  confines the agent, not the human; an empty anchor set admitting a self-made key is the intended posture. Where the
  docs describe this posture, they state it as intended, not as a limitation.
- **Assignment (if accepted):** none.
- **Date:** 2026-10-09.
