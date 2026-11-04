# w149 — register the analysis-run admission suite (candidate 19, F2b)

Applies on top of w148 (the shell-guard admission); it does NOT apply to the chain before w148. Elephant-built, in a clone that carries w146 to w148.

## What it changes

- `harness/verify-suites.json`: the entry `analysis-run-command-admission-tests` for `plugins/pipeline-core/lib/guard/analysis-run-command-admission.test.mjs`, with invariant and non-overlap note.
- `docs/product-capability-inventory.json`: the `verify-phase:harness/scripts/verify.mjs:analysis-run-command-admission-tests` name in the alphabetical list.

## Checks

- Registration checker in the clone: 1155 registered, 0 unregistered. The admission test itself ran 3/3 in the clone with w148.

## Not changed / not proven

- The inventory baseline is refreshed by the last step of the apply script. No Full Verify run; no independent Critic review (suspended by the PO).
