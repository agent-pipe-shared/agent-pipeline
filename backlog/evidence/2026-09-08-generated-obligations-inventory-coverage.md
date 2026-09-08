# Generated-obligations inventory coverage

Date: 2026-09-08

The inventory assigns the existing generated-obligations family to
`generated-agent-obligations`. It moves exactly two already discovered surface
IDs from broad capabilities: the generated template from `starter-templates`
and the registered `obligations-contract-tests` Verify member from
`deterministic-verification`.

The source basis is already local and discoverable. In
`harness/scripts/check-product-capability-inventory.mjs`, `verifyMembers()`
reads `TEST_SUITES` and `discoverSurfaces()` emits those names as
`verify-phase` IDs. `harness/scripts/verify.mjs:648` registers
`obligations-contract-tests`; the template walker emits the generated-template
surface. The prior claim that neither provided a unique generator surface was
therefore a discovery conclusion in error, not a schema limitation.

The production evidence is the explicit CLI
`harness/scripts/generate-agent-obligations.mjs` and its output
`templates/prompts/agent-obligations.md`. It requires Node.js, a local checkout,
and an explicit generator invocation; it does not automatically activate for a
runner. The existing direct test
`harness/scripts/generate-agent-obligations.test.mjs` checks committed-byte
equality and changes a guard-config input to prove source-to-output drift is
detected.

Machine evidence:

- `node harness/scripts/check-product-capability-inventory.mjs --phase inventory`
  exited 0; capture:
  `scratch/NVA-B-D2-OBLIGATIONS-COVERAGE-2/inventory-final.json`.
- The canonical validator reported 616 discovered, assigned, and unique
  assignments; capture:
  `scratch/NVA-B-D2-OBLIGATIONS-COVERAGE-2/coverage-count.json`.
- `node --test harness/scripts/generate-agent-obligations.test.mjs` exited 0;
  capture:
  `scratch/NVA-B-D2-OBLIGATIONS-COVERAGE-2/generate-agent-obligations-contract-test.txt`.

Fresh inventory SHA-256:
`343f9970cfc16e7aba6d624660371843ee074e35524ef5bdea6aa964e316df8e`
(machine capture:
`scratch/NVA-B-D2-OBLIGATIONS-COVERAGE-2/inventory-sha256.txt`).

The README target remains pending and Critic review remains
`required-before-publication`; this evidence neither completes D2 nor attests
full Verify, publication, or review.
