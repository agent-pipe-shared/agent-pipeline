# w138 — a closed predecessor's design receipt is accepted for the next feature when the design is equal (candidate 19, opt-in)

Opt-in block of the candidate 19 apply script (PO decision 2026-11-03, `docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md`, point 1). Applies on the chain at 2645e11c5; it touches only `plugins/pipeline-core/lib/architecture-design.mjs` and its test file.

## What it changes

In `inspectArchitectureDesign` the existing `architecture/design-materialization.json` was compared as a whole with a receipt rebuilt for the active feature. That receipt binds `featureId`, `planPath`, `planSha256` and `specSha256`, so every next feature over an unchanged design failed with `ARCHITECTURE-DESIGN-RECEIPT-STALE`.

The stored receipt is now accepted when it is byte-equal as before, OR when all of these hold:

- it parses as JSON with the same `schema`;
- its `designSha256` equals the current one and its `targets` array equals the current targets (paths and sha256, same order);
- its `featureId` is a string that differs from the active feature and equals an `id` in `state.closedFeatures` (an entry with `forCommit: null` counts as closed).

In that case the result is the same `status: "materialized"` as today, plus one field `inheritedFrom: { featureId, planPath, designSha256 }` taken from the stored receipt. The `receipt` field of the result stays the freshly built one for the current feature. The following `ARCHITECTURE-DESIGN-ARTIFACT-DRIFT` target check is unchanged. Nothing is written; the receipt on disk stays the predecessor's, so no inheritance chain can form.

## Consumers checked

`architecture-adoption.mjs` (reads `receipt.designSha256` only), `pipeline-state.mjs` (passes the inspect function in as a dependency; `sealedTargets` use only `path`), and `inspectArchitectureMaterializationTargets`/`materializeArchitectureDesign` in the same file (they read `receipt.planSha256` and `specSha256` of the fresh receipt and act on `status === "materialization-required"` only). None reads `receipt.featureId` or `receipt.planPath` of the result, so none changes behaviour for an inherited receipt.

## Tests

Three new cases in `architecture-design.test.mjs` (the suite is registered by file, not by case id): closed predecessor with equal design is accepted and names the predecessor, nothing rewritten; open or unknown predecessor, differing target digest, differing design digest, differing schema, the active feature's own non-equal receipt, and a non-JSON receipt all keep `ARCHITECTURE-DESIGN-RECEIPT-STALE`; target drift keeps `ARCHITECTURE-DESIGN-ARTIFACT-DRIFT`; the exact receipt of the active feature has no `inheritedFrom`.

## Binding

The closest existing accepted criterion is AC-108 (fresh bounded attempt under its unchanged Spec text). The PRD and the Spec are unchanged.

## Not changed / not proven

- No typed command that writes an inheritance receipt (the ADR's later part), no State field, no receipt rewrite.
- The ADR's trust analysis for accepting a predecessor beyond "closed and the receipt is its exact materialization receipt" is not extended; the plan/spec digests of the stored receipt are deliberately not compared.
- `architecture-design.test.mjs` 22 of 22 and `architecture-effective-decisions.test.mjs` 16 of 16 pass in the slice clone. The full Verify run was not made.
