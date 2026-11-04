# w161 — push-prepare and guard-push take the freshness verdict from one shared function (candidate 19, D4b/E3 order of work, step 2b, first half)

Delta on w160. Elephant-built, in a clone that carries the whole chain. Step 2 of the order of work in the "Proposed amendment of 2026-11-04" of `docs/adr/draft-authority-carry-forward-and-signed-reconcile-commit.md` (the amendment has had no review), second piece after w159. Behaviour-neutral: it moves the verdict, not the messages.

## Why

The push-gate freshness comparison is written out by hand in four places. Step 3 (a carry-forward vouching for a differing commit, behind an opt-in) has to add one condition to it; with four copies that is four edits that can drift. This patch makes two of the four (the two with the most logic: `scripts/push-prepare.mjs` and `hooks/guard-push.mjs`) take the verdict from one function, so step 3 has one place to change for them.

## What it changes

- `lib/evidence-freshness-codes.mjs`: `evidenceFreshnessFailureCodes({ data, expectedCommit, promoted, isVerify, satisfiesPushBoundary, firstOnly })` returns the ordered failure codes (missing, exit code, stale commit, push boundary). `promoted` and `satisfiesPushBoundary` are thunks, run only when the hand-written code ran them (commit differs; Verify record). `firstOnly` keeps push-prepare's single-failure result, while guard-push collects all of them as before.
- `scripts/push-prepare.mjs`: `checkEvidenceFreshness` takes the code from the function and keeps its own messages, remedies, the promoted success message and the rule that only the two known evidence ids can be promoted.
- `hooks/guard-push.mjs`: `checkEvidenceFreshness` takes the codes from the function and pushes the same three failure messages in the same order. The impacted-Verify ancestry check after it is untouched.
- `lib/evidence-freshness-codes.test.mjs`: EFC5 (order, `firstOnly`), EFC6 (thunks run only when needed), EFC7 (push-prepare promoted/not promoted/unknown id).

## Checks

- Clone: `evidence-freshness-codes`, `push-prepare`, `push-gate-satisfiability` and `guard-push-promotion` together 137/137 (134 before plus the three new cases); `guard-push`, `guard-push-v2`, `guard-push-checkpoint-approval`, `guard-push-architecture`, `guard-push-decision-reference` and `guard-push-attestation-diagnostics` exit 0; `pre-push-hook-install`, `critic-dispatch-preflight`, `pins/critic-course-consumer-chain-walk`, `guard-push-external-ledger` and `guard-push-release-tag-ancestry` together 168/168. `git apply --check` against the chain clone: exit 0.

## Not changed / not proven

- `lib/security-completeness-gate.mjs` (compares `envelope.input.commit`, a different record) and the managed pre-push hook template inside `scripts/pre-push-hook-install.mjs` are NOT moved. The hook template needs a dynamic import of the shared module, as it already does for the security completeness gate; that is the second half of step 2b.
- No carry-forward branch (step 3), no reader of the w156 decision.
- No Full Verify; no independent Critic review (suspended by the PO).
