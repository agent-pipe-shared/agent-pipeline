# Current capability inventory completion

This package implements the capability-coverage requirement of
`2026-09-07-local-candidate-delta.md` for the current local candidate.

The inventory must account for the discovered source surfaces of its exact
committed baseline, with each surface assigned once to a capability whose
documented behavior it actually implements. The baseline commit/tree must
resolve and remain an ancestor of the delivered candidate. New native Critic
preflight surfaces must be included if they are discovered. Preserve existing
capability identifiers and truthful planned-versus-delivered distinctions.

Technical review covers the changed inventory and its complete current direct
contracts: `harness/scripts/check-product-capability-inventory.mjs`, its tests,
and the inventory's public targets. Inspect coverage discovery, ownership,
evidence references, public markers and anchors, final-phase validation, and
the resulting reader-facing claims. A mapped runtime file is evidence of a
capability's implementation; assigning it does not reopen that runtime
package's completed review cycle.

The inventory remains `required-before-publication` with a null receipt digest
until a genuine passing review covering this package is retained. The checker
validates the attestation field's form, not the receipt itself. The coordinator
must retain the native result and verify its verdict and exact candidate
binding. The attestation digest is the SHA-256 of the canonical nested native
execution receipt, as produced by `nativeCriticCanonicalDigest(result.receipt)`.
Record its path, candidate and reviewed source coverage separately; do not
claim the checker authenticates them. An attestation-only follow-up must not
silently change the reviewed capability data or public claims.

After genuine attestation, run final inventory validation and the separately
required two-stage reader review, then bind those reader results to the final
documentation state. This contract grants no publication or plugin replacement.
