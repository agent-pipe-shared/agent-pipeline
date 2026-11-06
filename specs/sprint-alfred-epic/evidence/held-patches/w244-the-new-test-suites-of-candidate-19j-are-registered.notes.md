# w244: the new test suites of candidate 19j are registered

Elephant-built (2026-11-06), on the chain clone with w242 and w243 applied.

## Found

w242 and w243 each add new test files and, by their briefings, leave `harness/` untouched. On the applied chain the registration checker reported three `UNREGISTERED` suites, then three `UNCATEGORIZED-VERIFY-SURFACE` entries; the case-completion checker reported `VULNERABLE-UNREGISTERED` for the stop-pair suite (it emits case ids through `registerTestCaseCompletion`); VCR01 failed with 267 retained identities against the pinned 266.

## What it changes

- `harness/verify-suites.json`: `native-goldfish-host-stop-pair-tests` (policy NGSP1, NGSP2, NGSP3, NGSP3B, NGSP4, NGSP5), `session-authority-registry-leftover-tests`, `session-authority-repair-aside-tests`.
- `harness/config/verify-case-completion.v1.json`: a `required` row for the stop-pair suite.
- `docs/product-capability-inventory.json`: each suite's `verify-phase` surface next to its sibling suites.
- `harness/scripts/check-verify-case-completion.test.mjs` (QG-04, extension only): the stop-pair suite added to `newlyCounted` with the classification and sites the unchanged classifier measures (top-level-assertions, 32) and to the after-R5 list; registry count 391 to 392. No assertion weakened.

## Checks (chain clone)

- `check-verify-suite-registration.mjs`: complete, 1182 registered, 0 unregistered.
- `check-verify-case-completion.mjs`: valid, 392 entries.
- `check-verify-case-completion.test.mjs`: 32/32.
- `git apply --check` against the repository: exit 0.

## Not proven

No Full Verify of the applied state.
