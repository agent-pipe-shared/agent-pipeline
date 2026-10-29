# Held patch q2: verify-evidence-producer test, Critic fixture asks for the caller-authored fallback (test only)

State: HELD PATCH, test only, independent of every other held patch (one hunk in `plugins/pipeline-core/scripts/verify-evidence-producer.test.mjs`, helper `completedCriticPacket`). Nothing applied, reviewed or accepted. Written and measured by the Elephant.

Found while checking the agent entry for the pnpm lockfile Verify path (`pipeline.verify-for-an-older-commit-demands-package-lock-in-a-pnpm-project`, delivered as D174 PF-81): that entry is delivered, but the file carrying its tests was red.

## Cause

Clean clone of HEAD `a6f087f9f`: `verify-evidence-producer.test.mjs` 50 tests, 45 pass, 5 fail. All five fail the same way, inside the fixture helper: `completedCriticPacket` calls `finalizeSessionCriticReview(review)` and gets `SCF-ORIGINAL-SOURCE-UNAVAILABLE` (`session-critic-finalizer.mjs` `originGate`, lines 135 to 158). Since the Source-return cut (Cut A) a finalized verdict needs a Source-issued return record, and "no runner produces one yet"; without the explicit option `allowCallerAuthoredFallback: true` the finalizer refuses. The fixture predates that gate. The five cases: `candidate Verify carries a consumed Critic only over exact registered evidence commits`, `release Verify consumes a real fresh Critic packet and its same-candidate reverify chain`, `Critic-bound candidate Verify checks the packet before replacing evidence and binds a same-mode rerun`, `release reverify refuses changed candidates and tampered prior evidence`, `an external installed package works and implementation changes invalidate resume`.

## The patch

`completedCriticPacket` finalizes with `{ ...review, allowCallerAuthoredFallback: true }`, the option the finalizer offers for exactly this (weaker classification `caller-authored-fallback`, `nativeAttestation: false`). The admit call keeps the unchanged `review`. Nothing in production changes, and the fixture does not pretend a Source record exists.

## Evidence

- Scratch clone with the patch: 50 tests, 50 pass, 0 fail (baseline 45 pass, 5 fail).
- Fresh-clone verification: see the verify document.
- The D174 pnpm cases (inside the same file) pass in both runs.

## Apply

`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-verify-evidence-producer-critic-fallback-q2.patch`, `git add -A -- plugins/pipeline-core`, `git commit --no-verify -F scratch/commit-msg-po-apply-verify-producer-fallback.txt`.
