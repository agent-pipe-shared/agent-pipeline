# w147 — register the analysis-run suites (candidate 19, F2a)

Applies on top of w146 (the analysis-run command); it does NOT apply to the chain before w146. Elephant-built, in a clone that carries w146.

## What it changes

- `harness/verify-suites.json`: two entries, `analysis-run-lib-tests` (the lib suite) and `analysis-run-cli-tests` (the script suite), each with the pinned invariant and a non-overlap note, in the shape of w124.
- `docs/product-capability-inventory.json`: the two `verify-phase:harness/scripts/verify.mjs:` names in the alphabetical list, between `agy-session-dispatch-tests` and `antigravity-alpha-adapter-tests`.

## Checks

- Run alone in the clone: `check-verify-suite-registration.test.mjs` 1/1, `check-verify-suite-append.test.mjs` 18/18, and the checker itself: 1154 registered, 0 unregistered.

## Not changed / not proven

- The inventory baseline is refreshed by the last step of the apply script, as for every wave. No Full Verify run; no independent Critic review (suspended by the PO).
