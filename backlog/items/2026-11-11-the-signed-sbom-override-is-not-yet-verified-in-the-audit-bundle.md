---
schema: pipeline.backlog-item.v1
id: pipeline.the-signed-sbom-override-is-not-yet-verified-in-the-audit-bundle
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: Candidate 28c design; ADR-0091 decision 5; PO tile 2026-11-11 asked for a signature
sprint: alfred
done_when: manual
---

# The signed SBOM override is verified at the close but not yet by the audit bundle

## Description

A blocked SBOM (`stale`, `invalid`, `partial`, `unsupported`) passes the close only with the PO's signature (PO tile 2026-11-11, replacing the first draft that took the human's literal words). The close writes a request naming the feature, every finding and HEAD, the PO signs it with `po-human-approval.mjs sign-intent --request`, and the close verifies the proof against the trust anchors of `project/critical-human-proof.json`. The record names the signing key, the intent and proof digests and the candidate, and the signed request and proof stay in `specs/<feature>/evidence/sbom/`.

Three things are not built yet:

- The audit bundle checks the record's shape only. It does not copy the signed request and proof as verified proofs, and the offline verifier does not re-check the signature.
- A project without a trust anchor in `project/critical-human-proof.json` cannot pass a blocked SBOM at all; it can only repair it. The way to add the first anchor is the existing human-gated edit of that file.
- The anchor file is committed in the repository: a human-gated and audited route, not an unwritable one.

## Decision

The close-time signature is built in candidate 28c with tests (a proof of another key, another finding set, another commit or another feature is refused; a project without an anchor is refused; the signing command shows the findings). Whether the bundle should verify the proof offline is open.

## Done when

The bundle carries the signed request and proof of an override as proofs and its offline verifier checks the signature and the binding to the carried record, with a test that a tampered proof or a record that names other findings is refused.
