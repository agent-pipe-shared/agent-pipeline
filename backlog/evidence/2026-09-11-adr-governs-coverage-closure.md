# Accepted ADR Governs coverage closure

- Source base: `18df868103346d4eb987b85219c55960cd39ce6b`
- Source candidate: `62dddced0df1cfe46b6e72239e46bf7d3ba72cde`
- Reconciliation record: `3974a52525764b9db46461d441a255b7b470acc0`
- Independent closure review: **PASS**, no findings

The source candidate contains 81 numbered ADRs. All 76 accepted decisions have
bounded `Governs:` declarations. The other five are explicitly outside that
accepted denominator: ADR-0017, ADR-0022 and ADR-0031 are
historical/superseded, ADR-0021 is provisional, and ADR-0039 is proposed.

The existing reconciliation checker was run against the exact source range
with the later record commit as `--record-ref`. It reported six changed paths,
one implicated ADR and complete reconciliation. The candidate is an ancestor
of the record commit, and the record section names the full candidate object.
The checker was not weakened for this package.

Focused checks passed for ADR consistency, documentation contracts,
consumer-safe paths, vendored byte identity and diff formatting. The Critic
confirmed that ADR-0081's root and vendored additions are header-only, its
paths are specific existing owners rather than blanket coverage, and the one
consumer-safe-path entry is an exact inherited-canonical classification.

This closure establishes accepted-decision declaration coverage and exact
candidate/ref reconciliation. It does not claim that every implementation
conforms to every ADR, which remains outside the reconciliation checker's
documented scope.
