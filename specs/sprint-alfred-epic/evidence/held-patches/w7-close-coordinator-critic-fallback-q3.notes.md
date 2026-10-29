# Held patch q3: close-coordinator-audit-lifecycle test, Critic fixture asks for the caller-authored fallback (test only)

State: HELD PATCH, test only, independent of every other held patch (one hunk in `plugins/pipeline-core/scripts/close-coordinator-audit-lifecycle.test.mjs`, helper `fixture`). Nothing applied, reviewed or accepted. Written and measured by the Elephant. Same cause and same remedy as patch 20 (`w7-verify-evidence-producer-critic-fallback-q2`).

Found while checking the agent entry `pipeline.greenfield.g20` ("retained close/kernel 9/9"): on a clean clone of HEAD `a5c4087a5` this file is 0 of 8, not green.

## Cause

All eight cases fail in `fixture()` at the call `finalizeSessionCriticReview(review)` with `SCF-ORIGINAL-SOURCE-UNAVAILABLE` (`session-critic-finalizer.mjs` `originGate`): a finalized verdict needs a Source-issued return record unless the caller passes `allowCallerAuthoredFallback: true`, and no runner issues such a record yet. The fixture predates that gate. (An older entry in `backlog/items/2026-10-19-suites-red-on-this-checkout-before-pf55.md` lists the same file red for a different, earlier cause.)

## The patch

`finalizeSessionCriticReview({ ...review, allowCallerAuthoredFallback: true })`; the `admitSessionCriticReview(review)` call before it is unchanged. Nothing in production changes; the fixture does not pretend a Source record exists, it asks for the visibly weaker classification the finalizer offers.

## Evidence

- Clean clone of HEAD: 8 tests, 0 pass, 8 fail.
- Fresh clone with the patch (`verify-held-patch.mjs`): 8 tests, 8 pass, 0 fail.

## Apply

`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-close-coordinator-critic-fallback-q3.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-close-coordinator-fallback.txt`.
