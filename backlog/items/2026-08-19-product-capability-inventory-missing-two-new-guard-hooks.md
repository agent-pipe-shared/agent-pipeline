---
schema: pipeline.backlog-item.v1
id: pipeline.product-capability-inventory-missing-two-new-guard-hooks
type: defect
owner: pipeline
status: open
created: 2026-08-19
source: "Found while gathering full harness/scripts/verify.mjs evidence for the HGO Part C Critic round-2 delta re-review (dispatch PHX-WP-HGO-FAILCLOSED-IMPL-C), 2026-08-19."
---

# product-capability-inventory-tests fails HAW-A01 — same root cause as the unregistered guard-hook suites

## Description

`harness/scripts/check-product-capability-inventory.test.mjs`'s `HAW-A01`
check ("discovers the complete current direct product surface") fails with
`AssertionError: false !== true` at line 124. `docs/product-capability-inventory.json`
does not mention either `guard-gate-strength-ledger` or `guard-handover-size`
(confirmed via direct grep — zero hits for both names in the inventory
document), the same two guard hooks the companion item
`2026-08-19-two-guard-hook-test-files-unregistered-in-verify.md` found missing
from `verify.mjs`'s suite registration. Both gaps are one root cause: these
two hooks were added to `plugins/pipeline-core/hooks/` without the
accompanying updates to either tracking artifact.

## Affected artifact

`docs/product-capability-inventory.json` (needs entries for the two hooks),
`plugins/pipeline-core/hooks/guard-gate-strength-ledger.mjs`,
`plugins/pipeline-core/hooks/guard-handover-size.mjs`.

## Proposal

Fix together with `2026-08-19-two-guard-hook-test-files-unregistered-in-verify.md`
in one pass: register both hooks' capability surface in
`docs/product-capability-inventory.json` following the existing entry shape
for sibling guard hooks, alongside registering their test files in
`verify.mjs`.

## Related

- `2026-08-19-two-guard-hook-test-files-unregistered-in-verify.md` — same two
  hooks, the sibling verify-registration gap.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
