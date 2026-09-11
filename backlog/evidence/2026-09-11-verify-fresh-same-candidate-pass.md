# Fresh same-candidate Verify — implementation and Critic evidence

Implementation commit:
`0eba7f80f050d1affc819940e3a834db6cbc18b0`

The repository Verify entry point and the installed consumer producer now
accept `--no-reuse`. The flag leaves suite selection unchanged and disables
receipt reuse only for that invocation. A matching prior receipt is recorded in
the private resume plan as `reuse-disabled`; the public artifact records
`verifyRun.receiptReuse: "disabled"` and the actual `reused` disposition on
every step. Omitting the flag preserves the previous reuse behavior.

Focused verification passed:

- `self-verify-selection.test.mjs`: 11 assertions
- `verify-resume.test.mjs`: 16 tests
- `verify-journal.test.mjs`: 38 tests
- `verify-evidence-producer.test.mjs`: 18 tests, including the installed
  package CLI path used by consumer repositories
- documentation contracts, ADR consistency, consumer-safe paths, Verify suite
  registration, and final product-capability inventory

The real command
`PIPELINE_VERIFY_CONCURRENCY=2 node harness/scripts/verify.mjs --mode release --no-reuse`
ran from 2026-09-11T08:51:18.576Z through 2026-09-11T08:54:26.784Z. Run
`verify-1789116678576-b18282647ee90a24` binds exact commit `0eba7f80` and tree
`01d6ee16a3a4c1a353076ec5ecadbe29c2108118`; all 520 registered suites were
selected, all 520 passed, and zero steps were reused. The public run record
contains `receiptReuse: "disabled"`.

An independent Critic reviewed
`792b29a75eaff8d084fb99b5171d98026be20c23..0eba7f80f050d1affc819940e3a834db6cbc18b0`
and returned **PASS** with no findings. It independently confirmed the default
behavior, typed invalidation, self and consumer wiring, schema updates,
canonical/vendored documentation agreement, exact candidate binding, complete
fresh coverage, and absence of briefing violations.

Assurance: `functional-equivalent-read-only; OS isolation not asserted`.
