# Declarative Verify Suite Registration via harness/verify-suites.json (WP-B2-2)

Evidence artifact for the closure of backlog item `2026-08-08-a-hardening-round-cannot-register-the-suites-it-writes.md` (Issue #106 / AC-11) per Sprint Alfred Spec §5.2 item 2 (WP-B2-2).

## 1. Context & Problem

Previously, test suite registration was hardcoded inside `harness/scripts/verify.mjs` within the `TEST_SUITES` array literal. Because `verify.mjs` is protected under `project/guard-config.json` rule TP-3, dispatches adding new test suites could not register them without requiring a detached Ed25519 signature override ceremony.

As a consequence, dispatches often wrote test suites that passed standalone but remained unregistered and invisible to the Verify gate. A prior hardening round introduced `check-verify-suite-registration.mjs` to detect unregistered `*.test.mjs` files, turning silent omission into a loud check failure, but did not eliminate the underlying friction of requiring TP-3 edits for suite registration.

## 2. Mechanism & Deliverables

Per WP-B2-2 and Spec §5.2 item 2, declarative suite registration moves test suite registration out of `verify.mjs`'s protected logic into a dedicated declarative configuration file while maintaining strict gate integrity:

1. **JSON Schema (`schemas/pipeline.verify-suites.v1.json`):**
   - Schema id: `pipeline.verify-suites.v1`.
   - Closed object schema (`additionalProperties: false`, required: `["schema", "suites"]`).
   - `schema`: const `"pipeline.verify-suites.v1"`.
   - `suites`: array of objects, each containing:
     - `name`: string (unique suite id/name, e.g. `architecture-baseline-tests`).
     - `file`: string (repo-relative path to `*.test.mjs` or check script).
     - optional `caseCompletion`: object with schema `pipeline.verify-case-completion-policy.v1`.

2. **Declarative Suite Registration (`harness/verify-suites.json`):**
   - Implements `pipeline.verify-suites.v1`.
   - Registers the two previously unregistered suites:
     - `architecture-baseline-tests` -> `plugins/pipeline-core/scripts/architecture-baseline.test.mjs`
     - `report-interruptions-tests` -> `plugins/pipeline-core/scripts/report-interruptions.test.mjs`

3. **Verify Gate Integration (`harness/scripts/verify.mjs`):**
   - At runtime, `verify.mjs` loads `harness/verify-suites.json` if it exists.
   - Validates the document shape against `pipeline.verify-suites.v1`.
   - For each suite entry, resolves `file: join(repoRoot, suite.file)` and appends to `TEST_SUITES`.
   - Fails fast and logs an error if the declarative configuration is invalid or malformed.

4. **Suite Registration Checker Integration (`harness/scripts/check-verify-suite-registration.mjs`):**
   - Exports `loadDeclarativeVerifySuites` and `validateDeclarativeVerifySuites`.
   - In `checkVerifySuiteRegistration()`, loads `harness/verify-suites.json` if present and validates against `pipeline.verify-suites.v1`.
   - Appends each entry with `arrayName: "TEST_SUITES"` and `resolvedPath: join(repoRoot, entry.file)`, ensuring full validation:
     - Existence of test files (`MISSING-FILE`).
     - Duplicate detection across `verify.mjs` and `verify-suites.json` (`DUPLICATE-NAME`).
     - Verification surface categorization in `docs/product-capability-inventory.json`.
     - Completeness of registration (`UNREGISTERED`).

5. **Product Capability Inventory (`docs/product-capability-inventory.json`):**
   - Assigned the derived surface strings to capability `deterministic-verification` in sorted order:
     - `"verify-phase:harness/scripts/verify.mjs:architecture-baseline-tests"`
     - `"verify-phase:harness/scripts/verify.mjs:report-interruptions-tests"`

## 3. Verification & Acceptance

- `node harness/scripts/check-verify-suite-registration.mjs` exits 0 with 553 registered suites, 0 declared exclusions, and 0 unregistered files.
- `node --test harness/scripts/check-verify-suite-registration.test.mjs` passes all 46 tests cleanly, including new test cases for:
  - Valid declarative suite loading and registration recognition.
  - Duplicate suite name detection between `verify.mjs` and `verify-suites.json`.
  - Schema validation failure on invalid schema identifier.
  - Schema validation failure on missing required properties.
- `git diff --check` exits 0 with clean working tree diff.
