# CYB-7 implementation plan — provenance and artifact integrity

> Implements `cyb-7-feature-spec.md` under the recorded Sprint Cyborg plan
> approval and the PO direction of 2026-08-01. Provenance is candidate-bound
> evidence; a signature alone never grants release or policy authority.

| Slice | Owns | Acceptance coverage |
| --- | --- | --- |
| CYB-7A | closed provenance envelope, digest-addressed subject model and reproducibility states | AC1–AC3, AC7, AC9 |
| CYB-7B | pinning, external-signing and credential-hygiene boundaries | AC4–AC6, AC12–AC13 |
| CYB-7C | produce/promote/readback admission evaluator and tamper fixtures | AC8, AC10–AC11 |
| CYB-7D | local reference builder, SBOM/security-evidence links, docs and scoped Verify evidence | all final cross-package evidence |

## Boundaries

- Every subject has one exact candidate and SHA-256 digest; no mutable tag or
  inferred source identity is admission evidence.
- The envelope stores only a signing-key reference and verification result.
  Private keys, bearer credentials and unrestricted logs are never inputs or
  outputs.
- A valid signature is an integrity signal, not a policy acceptance or release
  decision. Unknown, revoked, expired or mismatched evidence fails closed.
- Produce, promotion and readback evaluate the same closed record. Historical
  records are immutable; correction creates a new versioned record.
- The local adapter proves the contract with disposable test keys and synthetic
  artifacts. It makes no SLSA level or certification claim.

## Rollback

Each slice is reversible as a cohesive code-and-Verify unit. On consumer
incompatibility, stop adoption and revert the affected slice together with its
Verify entry while retaining immutable evidence already bound to prior
candidates. Never rewrite a historical provenance record or use a rollback to
manufacture an approval, signature or reproducibility claim.
