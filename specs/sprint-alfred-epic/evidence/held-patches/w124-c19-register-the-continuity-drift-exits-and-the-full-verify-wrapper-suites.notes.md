# W124 C19 registration of the two new suites

Criterion binding: AC-115 (continuity drift exits, w117) and AC-140 (Full Verify resume, w119) are the closest existing accepted criteria; the PRD and the Spec are unchanged.

## What
- `harness/verify-suites.json`: two entries, `continuity-drift-exits-tests` (w117) and `full-verify-wrapper-tests` (w119, `scripts/full-verify.test.mjs`).
- `docs/product-capability-inventory.json`: the two `verify-phase` surfaces, in sorted position.

## Why
A new test file that no Verify suite registers is never run by the Full Verify. `scripts/clone-slice/cc-changed.mjs` listed both as UNREGISTERED after w117 and w119 were applied.

## Measured in a clone with w115 to w123 applied
- `check-verify-suite-registration.mjs`: 1152 registered, 0 unregistered.
- cc-changed over the changed suites: 0 rejected, 0 unregistered. Neither new suite has a case-completion policy, so none is added. The grown suites (verify-journal, routine-repair, architecture-design, dispatch-briefing, po-human-approval, release-preflight, critical-human-proof-gate) carry no policy either, so there is no id list to extend; only `agy-item-delivery-tests` has one and it is accepted (6 ids).
- Guard tests (capability inventory, suite registration, suite append, case completion, module inventory, architecture fitness): 21/21.
- `check-product-capability-inventory.mjs` reports the two surfaces as missing from the committed source baseline until the derived-files refresh (last step of the apply script) re-baselines; expected, not a defect.

## Not proven
- No integrated Full Verify yet.
