# w152 — register the generate-runbook suite (candidate 19, G5 stage 1)

Applies on top of w151 (the generated close runbook); it does NOT apply to the chain before w151. Elephant-built, in a clone that carries w151.

## What it changes

- `harness/verify-suites.json`: the entry `generate-runbook-tests` for `plugins/pipeline-core/scripts/generate-runbook.test.mjs`, with invariant and non-overlap note.
- `docs/product-capability-inventory.json`: the `verify-phase:harness/scripts/verify.mjs:generate-runbook-tests` name in the alphabetical list.

## Checks

- Registration checker in the clone: 1153 registered, 0 unregistered. The generator test ran 6/6 in the clone (Goldfish run, repeated by the Elephant).

## Not changed / not proven

- The inventory baseline is refreshed by the last step of the apply script. No Full Verify run; no independent Critic review (suspended by the PO).
