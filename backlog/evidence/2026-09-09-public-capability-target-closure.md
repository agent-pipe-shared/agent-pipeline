# Public capability target closure

Date: 2026-09-09

This closure supplies the four missing public anchor recognitions and the three
missing capability markers identified by the frozen finalization audit. It does
not activate the production inventory or attest a review.

The completed documentation corrections are:

- `human-accountability-roles` retains its existing README HTML anchor and now
  has the adjacent comment anchor recognized by the inventory checker.
- `governance-example-extensions` has its capability marker and comment anchor
  before the existing English Operating Model extensions paragraph, which
  already describes governance guidelines.
- `release-planning-controls` now targets `FLOW`, not `OPERATING_MODEL`, and
  has its capability marker and comment anchor before the existing optional
  branches table. Its `Release / promotion` row names the release adapter,
  human promotion gate, evidence, and rejoin/terminal state. The comments are
  before the table rather than between rows, so rendering is unchanged.
  This target-document correction leaves its `pending` status and the live
  null review receipt unchanged.
- `documentation-quality-gates` has its README capability marker and comment
  anchor by Operations. The English and German Operations prose factually limit
  the documentation-contract check to this source repository; it checks tracked
  Markdown links, anchors, and the calibrated handover authority locally.

The inventory test fixture now makes its state explicit and independent from
the live inventory. `review: "pending"` assigns the contract's
`required-before-publication` status with a null receipt; `review: "attested"`
uses a fixture-only digest. `targets: "pending"` and `targets: "active"`
assign every fixture target's lifecycle state. The old fabricated-digest and
pending-final-target negatives remain. `HAW-A04a` proves an active,
fixture-only final phase can validate the actual public documentation targets.
It neither changes a live target nor supplies a Critic receipt.

Machine evidence:

- Before the documentation closure,
  `node harness/scripts/check-product-capability-inventory.mjs --phase final`
  exited 1 with the three missing markers recorded in
  `scratch/NVA-B-D2-PUBLIC-TARGET-CLOSURE-1/final-phase-pending-before-target-closure.json`.
  The four missing recognized anchors are recorded separately by the frozen
  audit in `scratch/NVA-B-D2-FINALIZATION-AUDIT-1/final-phase-current.json`;
  pending targets do not make the final-phase checker evaluate their anchors.
- `node --test harness/scripts/check-product-capability-inventory.test.mjs`
  exited 0: 25 checks passed, including `HAW-A04a`; capture:
  `scratch/NVA-B-D2-PUBLIC-TARGET-CLOSURE-1/inventory-fixture-tests.json`.
- `node harness/scripts/check-doc-contracts.mjs` exited 0; capture:
  `scratch/NVA-B-D2-PUBLIC-TARGET-CLOSURE-1/doc-contract-check.json`.
- `node harness/scripts/generate-vendored-canon.mjs --check` exited 0 after
  regenerating only `plugins/pipeline-core/docs/operating-model.md`; capture:
  `scratch/NVA-B-D2-PUBLIC-TARGET-CLOSURE-1/vendored-canon-check.json`.
- After the documentation closure, final phase remains expected-red because
  `criticReview` is still `required-before-publication` with a null receipt and
  every public target remains pending; capture:
  `scratch/NVA-B-D2-PUBLIC-TARGET-CLOSURE-1/final-phase-pending-after-target-closure.json`.

No full Verify, publication, final inventory acceptance, or Critic PASS is
claimed here. A later genuine receipt and post-activation reader review remain
required.
