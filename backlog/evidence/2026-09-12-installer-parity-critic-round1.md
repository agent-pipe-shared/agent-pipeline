# Installer attestation parity Critic — substantive round 1

Date: 2026-09-12

Reviewed bundle: `a4c77364b8b1fcfc122d19be71e8d7800c3d19a5..4cbae443`

Assurance: functional-equivalent read-only; OS isolation was not asserted.

The preceding attempt stopped before review because the T1 dispatch omitted its
closed verdict and assurance fields. This file records the substantive report
returned after those fields were supplied.

## Findings

1. **Blocker — documented Claude source cannot pass provenance.** The documented
   directory-marketplace flow copies the plugin into a gitless marketplace,
   while the new host action resolves that copy as its source and the receipt
   writer requires a clean Git checkout. The automatic action therefore always
   rejects for the documented topology and can leave Claude indefinitely at
   `plugin-attestation-required`.
2. **Major — final review candidate lacks machine evidence.** Supplied receipts
   bind the original implementation and the review bundle's parent, not final
   bundle commit/tree `4cbae44393556d97b2a973745d48117a0ecf0d95` /
   `1942e3c4354ab2cac69d009356208fec0c07eaee`.

The Critic also observed a non-material trailing-space issue in the Markdown
evidence. It found no separate defect in runner manifests/protected paths,
path-free receipt storage, Antigravity receipt-before-registration ordering,
JavaScript syntax, dependencies, SPDX headers, rollback text or deferred live
probe ownership.

## Correction boundary

The correction must preserve clean-Git source provenance and test the actual
gitless Claude marketplace-copy topology. Final candidate-bound evidence is
written only after the correction bundle is frozen. The Coordinator separately
identified and included one direct security regression: a gitless Antigravity
root with missing or ambiguous registry binding must not bypass receipt
verification.
