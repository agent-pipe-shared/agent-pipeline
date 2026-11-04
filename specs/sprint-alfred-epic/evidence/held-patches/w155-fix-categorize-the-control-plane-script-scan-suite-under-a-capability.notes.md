# w155 — categorize the control-plane script scan suite under a capability (candidate 19, chain defect)

Delta on w154. Elephant-built, in a clone that carries the whole chain.

## Why

Found while registering the D4b suite: after the complete apply chain the registration checker (`harness/scripts/check-verify-suite-registration.mjs`) failed with `UNCATEGORIZED-VERIFY-SURFACE "control-plane-script-scan-tests"`. w131 (Q5) registered the suite in `harness/verify-suites.json` but never named it in `docs/product-capability-inventory.json`, and the rebaseline step of the apply script refreshes the baseline, not the capability lists. The rehearsals applied the chain but never ran this checker, so they did not show it. A Full Verify would have been red on it.

## What it changes

- `docs/product-capability-inventory.json`: one surface name, `verify-phase:harness/scripts/verify.mjs:control-plane-script-scan-tests`, placed alphabetically next to `control-placement-tests` in the capability that already lists that suite.

## Checks

- Before: the checker failed in a clone with the whole chain (exit 2, one uncategorized finding). After: `Verify suite registration is complete: 1157 registered, 0 declared exclusion(s), 0 unregistered` (exit 0).

## Not changed / not proven

- No other finding was reported by the checker; the other registrations of the chain (w147, w149, w152) already carry their inventory names.
- No Full Verify; no independent Critic review (suspended by the PO).
