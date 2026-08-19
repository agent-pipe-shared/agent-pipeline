---
schema: pipeline.backlog-item.v1
id: pipeline.publication-authority-lacks-execution-time-criticalproof-reverification
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Noted as a remaining gap during PHX-WP-PUBLICATION-UNIFICATION (commit 41c7711d, 2026-08-19), which proved the publication-authority approve/authorize migration onto the shared pipeline.po-approval-proof.v1 contract was already functionally complete; recorded as a to-be-filed follow-up in backlog/items/2026-08-02-unified-human-authorization-ux.md's 2026-08-19 progress note. This item is that filing, backed by a fresh full read of both code paths."
---

# publication-authority push execution trusts CAS/phase state, never re-verifies the Ed25519 criticalProof at the moment of the actual push

## Description

Push and deploy re-verify a human's detached Ed25519 signature at the exact
moment the externally-effective action is about to happen. Publication does
not: its signature is checked once, at approval time, over a subject that is
then never touched again before the actual `git push` to `main`.

**Push/deploy's execution-time re-verification** (`plugins/pipeline-core/lib/critical-action-authorization.mjs`,
`authorizeRecordedPush`/`authorizeRecordedDeploy`, called from
`plugins/pipeline-core/hooks/guard-push.mjs:745` and `:1218`, immediately
before the guard lets the actual push/deploy-triggering command through):
for every candidate push, it rebuilds the exact subject
(`criticalActionSubjectSha256({kind, candidate: {commit, tree}, subject})`)
from what the guard can *observe about the action happening right now*,
rebuilds the signed intent around it (`createPoApprovalIntent`), and verifies
the detached proof against the trust-anchor key set committed in
`project/critical-human-proof.json` (`verifySignedAction`,
critical-action-authorization.mjs:152-224). A tampered or replayed state
record cannot pass this check without producing a fresh signature under the
operator's key, because the check is re-derived from the live candidate, not
read off the record.

**Publication's approval** (`plugins/pipeline-core/scripts/pipeline-state.mjs:2694-2715`,
the `publication-approve` subcommand): when `policy.requiredKinds.has("publication")`,
`verifyCriticalHumanProof` genuinely performs the same class of Ed25519
verification, over a subject built from `prior.candidateOid`/`prior.candidateTree`
(the commit/tree captured at `publication-prepare` time) plus the transaction
tuple. The resulting `criticalProof` is stored — but not inside the
publication-authority CAS record that governs the push. It is written to a
*separate* ledger, `state.publicationCriticalProofs[transactionId]`
(pipeline-state.mjs:2777-2787).

**What actually gates the push from there on** is
`plugins/pipeline-core/lib/publication-authority.mjs`'s
`approvePublicationAuthority`/`authorizePublicationAuthority` (and their V2
counterparts, `approvePublicationAuthorityV2`/`authorizePublicationAuthorityV2`/
`activatePublicationAuthorityV2`), which delegate to
`publication-bundle.mjs`/`publication-bundle-v2.mjs`'s `approvePublication`/
`authorizePublication`. Their entire approval payload is
`{id: approvalId, attribution, approvedAt, expiresAt, tupleDigest, consumedAt}`
(publication-bundle.mjs:138, publication-bundle-v2.mjs:85) — an opaque
`approvalId` string and a free-text `attribution` string, never a signature or
a proof reference. Every subsequent transition (`authorizePublicationAuthority`,
`beginPublicationExecutionAuthority`, and ultimately the actual push performed
by `plugins/pipeline-core/scripts/publication-executor.mjs`) is gated purely by
CAS chaining (`expectedRevision`/`expectedStateSha256`/`expectedRawSha256`
matching the durable `writer.lock`-protected `state.json`) and phase-machine
invariants (`validatePublicationAuthority`). None of `publication-authority.mjs`,
`publication-executor.mjs`, or the publication branch of `guard-push.mjs`
(`enforcePublicationAuthorization`, guard-push.mjs:936-980, which checks
`publicationReferenceMatches` and authorization-count invariants, not a
signature) imports `critical-action-authorization.mjs` or reads
`publicationCriticalProofs` at all — confirmed by grepping both files for
`publicationCriticalProofs` and `criticalActionSubjectSha256`/
`verifySignedAction`-style calls: zero hits outside pipeline-state.mjs's
write path. The stored `criticalProof` is write-only audit trail; nothing
ever reads it back.

**Assessment: this is a real gap, not an equivalent-but-differently-shaped
guarantee.** The two routes both *start* from a genuine Ed25519 verification,
so the initial trust establishment is comparable. What differs is *when* the
last check that ties the actual git operation to a human's signature happens.
Push/deploy re-derive and re-check at the literal moment of the external
effect, over the literal candidate about to move — so nothing between
approval and push can silently substitute a different commit, tree, or
destination without invalidating the signature check. Publication checks the
signature once, then relies exclusively on the durable CAS/lock discipline of
`publication-authority.mjs` (single-writer lock, `expectedRawSha256` staleness
checks, `validatePublicationAuthority`'s phase invariants) to carry that trust
forward through `publication-prepare` → `publication-approve` →
`publication-authorize` → `beginPublicationExecutionAuthority` → the actual
push. That CAS/lock discipline is itself solid engineering (this session's
prior dispatch found it functionally complete against its own contract), but
it is a *different kind* of guarantee — state-machine/concurrency integrity,
not a human-signature check bound to the literal commit being pushed right
now. A bug anywhere in that chain (a lock race, a stale-authority reuse edge
case, a future edit that loosens a CAS check) would be caught by push/deploy's
model because the signature re-derivation is the last word; the same class of
bug in the publication chain would not be caught by anything resembling a
signature check, because there isn't one left to fail.

## Affected artifact

- `plugins/pipeline-core/lib/publication-authority.mjs` — `approvePublicationAuthority`,
  `authorizePublicationAuthority`, `approvePublicationAuthorityV2`,
  `authorizePublicationAuthorityV2`, `activatePublicationAuthorityV2`,
  `beginPublicationExecutionAuthority`.
- `plugins/pipeline-core/scripts/publication-executor.mjs` (the actual push executor —
  never imports `critical-action-authorization.mjs`).
- `plugins/pipeline-core/scripts/pipeline-state.mjs:2694-2787` (`publication-approve`
  writes `criticalProof` to `state.publicationCriticalProofs`, which nothing
  downstream reads).
- `plugins/pipeline-core/hooks/guard-push.mjs:936-980` (`enforcePublicationAuthorization`,
  the publication branch that does not call `authorizeRecordedPush`/
  `authorizeRecordedDeploy`).

## Proposal

Two candidate directions, not mutually exclusive:

1. **Bind the stored `criticalProof` into the publication-authority CAS record
   itself** (rather than a side-channel ledger), and have
   `beginPublicationExecutionAuthority` (or a new pre-push checkpoint in
   `publication-executor.mjs`) re-derive the expected subject from the
   authority record's *current* `candidateOid`/`candidateTree`/`destinationRef`
   and re-verify the signature against it immediately before the push, the
   same shape `authorizeRecordedPush` uses. This gets publication to the same
   last-moment guarantee push/deploy have, at the cost of touching the
   publication-bundle schema (a versioned migration, given `validatePublicationAuthority`'s
   strict key-set checks) and `publication-executor.mjs`'s trusted boundary.
2. **Document the asymmetry as an accepted, bounded tradeoff** if the CAS/lock
   chain's own guarantees (single writer lock, strict CAS staleness checks,
   `validatePublicationAuthority`'s phase invariants, and publication's
   narrower blast radius — `main` only, via the fixed executor, per
   guard-push.mjs's own comments) are judged sufficient without a literal
   signature re-derivation. This is cheaper but is a real security-posture
   decision, not a mechanical fix, and should be recorded as such (an ADR
   amendment or a new ADR) rather than left implicit.

Direction 1 is the more literal fix; direction 2 is legitimate only as an
explicit, reasoned PO decision — leaving the asymmetry undocumented (its
current state before this filing) is not an acceptable third option.

## Triage

- **Decision:** needs-PO-decision.
- **Rationale:** This is a genuine security-design tradeoff (how much
  execution-time re-verification a release-only, single-destination,
  fixed-executor path needs versus the general push/deploy path), not a
  bounded mechanical defect with one obviously-correct fix. Direction 1 is a
  non-trivial schema migration touching a gate-strength-adjacent execution
  boundary (`publication-executor.mjs`); direction 2 requires the PO to
  affirmatively accept the tradeoff rather than have it stand by omission.
  Neither is Goldfish-dispatchable without that decision first.
- **Assignment (if accepted):** Elephant to bring this item's two directions
  to the PO for a decision; only then dispatch-ready for implementation
  (direction 1) or for an ADR write-up (direction 2).
- **Date:** 2026-08-19

### PO Decision — 2026-08-19

- **Decision:** Direction 2 — document the asymmetry as an accepted, bounded
  tradeoff via a new ADR, rather than migrating publication onto push/deploy's
  execution-time re-verification shape.
- **Rationale:** PO's direct choice between the item's two named directions.
- **Assignment:** Dispatch-ready — a Goldfish writes the ADR (the CAS/lock
  chain's guarantees, why they're judged sufficient for a release-only,
  single-destination, fixed-executor path, and what would revisit the
  decision) and closes this item on landing.
- **Date:** 2026-08-19
