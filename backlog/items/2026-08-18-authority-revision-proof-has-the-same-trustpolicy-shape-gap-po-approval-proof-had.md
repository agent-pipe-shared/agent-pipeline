---
schema: pipeline.backlog-item.v1
id: pipeline.authority-revision-proof-has-the-same-trustpolicy-shape-gap-po-approval-proof-had
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "dispatch PHX-WP-ARPROOF-HUMANNAME; mirrors backlog/items/2026-08-17-trust-policy-shape-disagreement-between-sign-intent-and-verify-po-approval-proof.md"
closed_at: 2026-08-18
closure_repository: "self"
closure_commit: "a3d3f3459e60589a99eaed595ef50c4161883a2e"
closure_evidence: "backlog/items/2026-08-18-authority-revision-proof-has-the-same-trustpolicy-shape-gap-po-approval-proof-had.md"
---

# authority-revision-proof.mjs has the same trustPolicy shape gap po-approval-proof.mjs had

## Description

`verifyAuthorityRevisionProof` in
`plugins/pipeline-core/lib/authority-revision-proof.mjs` did a strict `own()`
check requiring EXACTLY the 2-key legacy `trustPolicy` shape
`{keyReference, publicKeySha256}` — the same latent bug already found and
fixed in the sister file `po-approval-proof.mjs`'s `verifyPoApprovalProof`
(see `backlog/items/2026-08-17-trust-policy-shape-disagreement-between-sign-intent-and-verify-po-approval-proof.md`).
Since the two verifiers can read the SAME external `trust-policy.json` file
format, and that file can now legitimately carry the 3-key named shape
`{keyReference, publicKeySha256, humanName}` written by
`po-human-approval.mjs`'s `setup --human-name`, this ceremony's proof was at
live risk of being wrongly rejected as `AR-PROOF-INVALID` even though the
signature and keys were entirely valid — not a merely theoretical gap.

## Affected artifact

`plugins/pipeline-core/lib/authority-revision-proof.mjs`
(`verifyAuthorityRevisionProof`'s `trustPolicy` shape check).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accept and fix
- **Rationale:** identical latent-bug pattern to the already-fixed sister
  file `po-approval-proof.mjs`, now a live risk since the shared external
  `trust-policy.json` format can carry `humanName`. Fixed by mirroring the
  exact pattern already proven and tested there: a new `trustPolicy`-specific
  `ownTrustPolicy()` helper accepting either the 2-key legacy shape or the
  3-key named shape, leaving the general `own()` helper and `proof`'s own
  strict check untouched. Any OTHER unrecognised extra key on `trustPolicy`
  still fails closed with `AR-PROOF-INVALID` — only `humanName` specifically
  is tolerated. Covered by new real-crypto tests in
  `plugins/pipeline-core/lib/authority-revision-proof.test.mjs` (3-key
  accepted, 2-key regression still accepted, missing required fields still
  rejected with/without `humanName`, an unrelated extra key still rejected,
  and `proof`'s own `own()` check confirmed unaffected).
- **Assignment:** implemented this dispatch (task `PHX-WP-ARPROOF-HUMANNAME`);
  owner `pipeline`.
- **Date:** 2026-08-18
- **Closure commit:** `a3d3f345`
  (`fix(phoenix): accept the 3-key trustPolicy shape in authority-revision-proof verification`).
