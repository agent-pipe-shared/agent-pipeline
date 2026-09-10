# Current capability inventory completion

This package implements the capability-coverage requirement of
`2026-09-07-local-candidate-delta.md` for the current local candidate.

The inventory must account for the discovered source surfaces of its exact
committed baseline, with each surface assigned once to a capability whose
documented behavior it actually implements. The baseline commit/tree must
resolve and remain an ancestor of the delivered candidate. New native Critic
preflight surfaces must be included if they are discovered. Preserve existing
capability identifiers and truthful planned-versus-delivered distinctions.

The initial technical review covers the changed inventory and its complete
current direct contracts: `harness/scripts/check-product-capability-inventory.mjs`, its tests,
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
claim the checker authenticates them.

This package explicitly requires actual Critic PASS under QG-13. After the
initial review, every follow-up is a fresh review of only
`immediately-previous-reviewed-commit..new-candidate`, including fixes in that
diff and their direct regressions. Use the native exact-range input
`reviewBase` with `reviewMode: "full"`; do not repeat the initial eight-source
current-artifact audit. Unchanged direct contracts may be read to interpret
the diff, without reopening cleared areas.

The coordinator must retain and verify the real initial eight-source audit
and each actual intermediate FAIL/fix/PASS result with canonical receipt
digest, candidate commit/tree, exact consecutive range, and original source
path/blob/digest/mode bindings. Prove source equality to carry unchanged
coverage forward; retain unresolved findings until a later reviewed correction
clears them. Every source change after its review must be covered by the
continuous correction chain. Missing results, gaps, ambiguous source coverage
or an unresolved blocker keep the inventory pending. A retained FAIL is not
passing coverage of its unresolved findings and must never be relabeled PASS.
Keep this lineage and finding-disposition record coordinator-side, outside
the fresh Critic input; do not pass prior verdict prose or findings.

The latest genuine correction-diff PASS, together with that verified lineage,
satisfies the technical PASS criterion. Store the digest of that latest real
nested native execution receipt, not a fabricated eight-source receipt or the
digest of a coordinator-authored composite. Record separately which coverage
was carried forward and which diff the latest reviewer actually examined.
This is a coordinator verification duty; the checker still validates only
attestation field shape. An attestation-only follow-up must prove that the
only inventory change is the attestation fields and that capability data and
public claims remain equal to their covered committed sources. Any substantive
change requires the next exact correction-diff review before attestation.

After genuine attestation, run final inventory validation and the separately
required two-stage reader review, then bind those reader results to the final
documentation state. This contract grants no publication or plugin replacement.
