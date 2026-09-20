# Nova-B current-code audit record

## Status and candidate identity

This candidate is **not verified green and is not acceptance complete**. Product
fixes, independent Critic review, and native acceptance remain unresolved. This
audit authorizes neither push nor publication.

The production baseline is `9c179fc74b2766b95766d15299015424f7a623d9`.
The clean tested candidate is `396f9b7c366fd874bf7e7d1317074271e68d466e`,
tree `221b4deec840854210b1706c3d62f7d8f71eaecb`. They differ only in the
operational handover, not production code. This audit-record commit is later
documentation and must never be substituted into Verify evidence.

## Coverage and evidence strength

`matrix.json` represents 129/129 items and 112 manual predicates, with 77
explicit Nova-B AC IDs, 17 global ACs, and supplemental B61/B62/B7 records.
Coverage is representation, not passing criteria; partial and not-verifiable
assessments remain provisional. Its narrower source and wiring evidence may
qualify an earlier report status. The R1 recheck is likewise preliminary, not a
Critic receipt.

The no-reuse release Verify receipt in `verify.json` reports 547/555 passed and
eight failed steps: `product-capability-inventory-tests`,
`epic-ac02-publication-check-tests`, `epic-ac02-publication-check`,
`verify-case-completion-registry-tests`, `verify-case-completion-check`,
`backlog-item-strip-for-dispatch-tests`, `backlog-done-predicate-check`, and
`security-scan`. These preserve code/registration/data drift, publication-state
mismatch, and unresolved security findings; no security result is relabelled a
false positive.

`verify-binding-comparison.json` shows a receipt exists but binds a different
candidate while its terminal digest matches. A matching terminal digest does not
prove that later changed source ran.

## Confirmed audit limitations and defects

The controlled probe reproduces the promotion-validator defect: both absent and
incomplete source qualification are accepted. `plugins/pipeline-core/lib/release-promotion-envelope.mjs:195`,
`plugins/pipeline-core/hooks/guard-push.mjs:2044`, and
`plugins/pipeline-core/scripts/push-prepare.mjs:169` have no identified
production producer for the envelope. No real push was attempted. The public
human-terminal caller lacks the trusted-caller adapter required by
`plugins/pipeline-core/scripts/human-terminal-action.mjs:46` and
`plugins/pipeline-core/lib/human-terminal-action-instance.mjs:176,290`; retain
the fail-closed guard and fix its producer/wiring.

Corrections record that aggregate commands naming nonexistent selectors cannot
prove those suites, while claims that denial trimming, slicing, and the CI
reporter were absent were contradicted by code and ADRs. B2 synthetic contracts
and B49 Apple-Silicon work are scope transfers; old B15 Alpha is superseded by
the native AGY package. Fixtures do not establish live capability.

## Bounded remediation queue

1. Bind Verify receipt, manifest, terminal and candidate identity; accept only
   matching commit/tree evidence.
2. Add a production promotion-envelope producer and reject absent/incomplete
   qualification in the validator.
3. Supply a trusted-caller adapter for the human-terminal path with an ordinary
   installed-consumer behavioral test.
4. Resolve and rerun the eight red Verify gates, retaining machine evidence and
   Security output.
5. Prove currently unproved AC source-to-entrypoint wiring without treating
   fixtures as native execution.
6. Run native Windows and macOS verification under the plan below. Preserve
   closed history and immutable evidence; do not widen approvals or disable
   guards.

Independent review: pending. Native acceptance: pending. PO acceptance: open.
