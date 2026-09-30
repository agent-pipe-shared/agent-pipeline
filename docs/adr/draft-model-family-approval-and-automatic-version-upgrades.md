# Draft: Approve model families and upgrade versions automatically

## Status and date
Proposed, 2026-09-30. Implements the PO's explicit direction; this draft is not an installed runtime change. Companion to [functional model roles](draft-functional-model-roles-at-session-bootstrap.md); historical exact-ID proofs remain intact.

## Context
Exact-ID policy approval and changed-mapping acknowledgement currently turn `gpt-6-sol` → `gpt-6.1-sol` into another human ceremony. The PO requires automatic same-type updates, including `gpt-5.6-luna` → `gpt-6-luna`.

## Decision proposed
1. Approve each new provider model family once for its functional roles and duties. Resolve family identity and version through a registered runner adapter; unrelated names, renamed families and ambiguous variants cannot acquire approval through string resemblance.
2. Default every approved family to the numerically newest available supported version. For example, Sol 6.1 replaces Sol 6 and Luna 6 replaces Luna 5.6 automatically; `6.10` sorts after `6.2`.
3. A version-only change requires neither another signature nor a mapping acknowledgement. A new family, changed family-to-role assignment or added/removed role slot remains a human decision.
4. An explicit PO pin is the sole route to an old version. Removing it restores automatic latest-version selection. Missing current models, required efforts, incomplete catalogues and unknown version encodings fail visibly; no silent older or cross-family fallback.
5. Bootstrap and each new dispatch use one resolver. Refresh before new work; do not mutate running invocations. Compact preserves their exact evidence without indefinitely locking subsequent dispatches to an obsolete version.
6. Keep exact selected ID, family, version, policy origin, catalogue/effort evidence and selection reason in verifier-readable receipts. Preserve functional-role and Critic floors. A same-family name or catalogue entry alone is not a benchmark-quality claim.
7. Migrate valid historical Exact-ID assignments through explicit adapter family metadata under the newly adopted upgrade policy; retain the original approval proof and digest. Migration must not fabricate a broader signed subject or reinterpret an old assignment as an intentional pin.

## Consequences
PO decisions govern model types and intentional exceptions; version maintenance becomes host-owned automation. New policy/receipt versions require explicit migration and truthful installed-runner acceptance; this proposal alone changes no old proof or active route.

## Affected contracts and verification
Model policy, session resolver/store, bootstrap acknowledgement, dispatch selection, V3 fallback/projections and the three runner adapters. Cover both named upgrades, numerical ordering, catalogue reordering, pin/release, unknown family/version, unsupported effort, incomplete/offline discovery, downgrade refusal, exact launch identity and preserved historical receipts. Track delivery in [the Alfred item](../../backlog/items/2026-09-30-model-family-approval-with-automatic-version-upgrades.md).
