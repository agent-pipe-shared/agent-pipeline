# w8-register-sixteen-unregistered-suites (held patch, not applied)

Cause of the red `verify-suite-registration-check` step: sixteen `*.test.mjs` suites under registered roots carried no entry in
`harness/verify-suites.json` and no surface in `docs/product-capability-inventory.json` (capability `deterministic-verification`).

Change: one suite entry (name, file, invariantPinned, nonOverlapNote) and one sorted inventory surface per file; the stale "needs registration" note in
`published-tag-push.test.mjs` is removed. Every suite was run in a clean clone first: fifteen were green. The sixteenth,
`no-route-denials-seed-no-override-request`, was red because its NRS02 case expected an override request for a target outside the project root;
`lib/guard/constants.mjs` ("Measured boundary") documents that such a target is HGO-NONOVERRIDABLE-CROSS-BOUNDARY, prints the typed no-route line and seeds nothing.
The case moves to NRS01 (no route, seeds none), so the test now matches the documented behaviour.

Evidence (clean clone, patch plus the rebaseline/sync pair): registration checker suite, capability inventory suite, the corrected guard suite and the
tag-push suite green. The mirror `plugins/pipeline-core/reader-inputs/product-capability-inventory.json` and its pins are produced by the apply script's
rebaseline and sync step, not by this patch. Applies to the repository HEAD.
