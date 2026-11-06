# w240: the new test suites of candidate 19i are registered

Elephant-built (2026-11-06), on the chain clone with w236, w239, w241, w238 and w237 applied.

## Found

The five held patches of candidate 19i each add one new test file and, by their briefings, leave `harness/` untouched. On the applied chain the registration checker reported five `UNREGISTERED` suites, then five `UNCATEGORIZED-VERIFY-SURFACE` entries; the case-completion checker reported `VULNERABLE-UNREGISTERED` and then `REQUIRED-VERIFY-POLICY` for the two suites that emit case ids through `registerTestCaseCompletion` (w236, w237); its own test VCR01 failed with 268 retained identities against the pinned 266.

## What it changes

- `harness/verify-suites.json`: five suites appended: `native-goldfish-host-parallel-admission-tests` (policy NGPA1 to NGPA7), `native-goldfish-host-stop-read-scope-tests` (policy NGSR01 to NGSR06), `session-authority-registry-fewer-checks-tests`, `windows-node-authority-reads-tests`, `custody-inspection-spawns-tests`.
- `harness/config/verify-case-completion.v1.json`: `required` rows for the two policy suites.
- `docs/product-capability-inventory.json`: each suite's `verify-phase` surface placed next to its sibling suites.
- `harness/scripts/check-verify-case-completion.test.mjs` (QG-04, extension only): the two suites added to `newlyCounted` with the classification and sites measured by the unchanged classifier (top-level-assertions 29 and 46) and to the after-R5 list; registry count 389 to 391. No assertion is weakened, no digest changed.

## Checks (chain clone)

- `check-verify-suite-registration.mjs`: complete, 1179 registered, 0 unregistered.
- `check-verify-case-completion.mjs`: valid, 391 entries.
- `check-verify-case-completion.test.mjs`: 32/32.
- `git apply --check` against the repository: exit 0 (it touches only registration files, none of which the five held patches change).

## Not proven

No Full Verify of the applied state.
