# w191 — register the d3 signed reconcile suite in the capability inventory

Candidate 19c, found by the registration checker (`harness/scripts/check-verify-suite-registration.mjs`) in the rehearsal clone after w167.

- **What:** adds `verify-phase:harness/scripts/verify.mjs:d3-signed-reconcile-commit-tests` to the capability list of `docs/product-capability-inventory.json` that holds the other `close-coordinator` and `current-session-artifact` suites, in sorted position. w167 registered the suite in `harness/verify-suites.json` only, so the checker reported `UNCATEGORIZED-VERIFY-SURFACE`.
- **Why:** every registered Verify suite must be categorized in exactly one capability.
- **Not changed:** the suite itself, its registration in `harness/verify-suites.json`, any capability text.
- **Not proven:** a Full Verify of the chain; the checker passes on the rehearsal tree (1171 registered, 0 unregistered).
- **Criterion:** AC-108 is the closest accepted criterion; PRD and Spec are unchanged.
- **Apply order:** after w167 (any later position works; the patch touches one line in the inventory list).
