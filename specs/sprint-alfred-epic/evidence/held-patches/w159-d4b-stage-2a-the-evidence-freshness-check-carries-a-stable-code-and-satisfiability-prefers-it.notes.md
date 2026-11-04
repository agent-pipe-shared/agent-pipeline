# w159 — the evidence freshness check carries a stable code, satisfiability prefers it (candidate 19, D4b/E3 order of work, step 2a)

Delta on w158. Elephant-built, in a clone that carries the whole chain. Step 2 of the order of work in the "Proposed amendment of 2026-11-04" of `docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md` (the amendment has had no review), taken in its smallest safe piece.

## Why

`scripts/push-gate-satisfiability.mjs` classified the failures of `push-prepare.mjs`'s `checkEvidenceFreshness` by substring (`is stale (HEAD is`, `is missing or unreadable`, `exitCode=`). A reword of one message would silently turn a typed status into `unknown-failure`. The ADR amendment asks for a stable code next to the message.

## What it changes

- `lib/evidence-freshness-codes.mjs` (new): `EVIDENCE_FRESHNESS_CODES` (`EF-MISSING`, `EF-EXIT-NOT-ZERO`, `EF-STALE-COMMIT`, `EF-NOT-PUSH-BOUNDARY`) and `satisfiabilityStatusForFreshnessCode`.
- `scripts/push-prepare.mjs`: the five failure results of `checkEvidenceFreshness` carry `code`. The messages, `remedy` and `remedyPlan` are byte-for-byte unchanged; only a field is added.
- `scripts/push-gate-satisfiability.mjs`: `checkVerifyEvidenceBound` takes the status from the code when there is a known one, else from the prose exactly as before, so a result without a code (an older checker, a test double) classifies as it did. A green result is never reclassified.
- `lib/evidence-freshness-codes.test.mjs` (new): EFC1 to EFC4.
- `harness/verify-suites.json` and `docs/product-capability-inventory.json`: registration of `evidence-freshness-codes-tests`.

## Checks

- Clone: new suite 4/4; `push-prepare.test.mjs`, `push-gate-satisfiability.test.mjs` and `guard-push-promotion.test.mjs` together 130/130; `pre-push-hook-install.test.mjs`, `critic-dispatch-preflight.test.mjs` and `pins/critic-course-consumer-chain-walk.test.mjs` together 166/166. Registration checker in the work clone: the new suite is registered and categorized (the only finding there was the w155 one). `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- `hooks/guard-push.mjs`, `lib/security-completeness-gate.mjs` and the managed pre-push hook template (inside `scripts/pre-push-hook-install.mjs`) still compare by hand with free-text messages and carry no code. Moving them onto one shared function is step 2b; the hook template needs a dynamic import of the shared module, as it already does for the security completeness gate.
- No carry-forward branch (step 3), no reader of the w156 decision.
- No Full Verify; no independent Critic review (suspended by the PO).
