# D165 PF-75 slice B: course admission reads a late review unit at its introducing commit

Cumulative patch against HEAD 9999e9a3ea5c3e0c26d808b6a8bb01b975f3610b. THIS PATCH SUPERSEDES SLICE A (d165-pf75-a-declaration-commit.patch): apply this one patch only, never slice A separately.

## Cause
featureReviewUnit read the review unit only from the manifest at the genesis base, so a unit added after delivery was refused with CCA-REVIEW-UNIT-REQUIRED unless the unit commit was itself the first review base.

## Change (lib/critic-course-admission.mjs)
- New helper introducingCommit(root, base, candidate, manifestPath, path): returns base when the manifest at base lists the unit path, else the first commit of range(base..candidate) whose manifest lists it (a manifest read error counts as not listing), else fails CCA-REVIEW-UNIT-REQUIRED.
- featureReviewUnit uses the manifest and blob at that commit (former lines 506, 509-511, 513-514, 516-517); passes declarationCommit only when it differs from base; the candidate binding check and ownership check are unchanged. Line 432 read, course key and stored record shapes are untouched.
- REPAIRS: CCA-REVIEW-UNIT-REQUIRED text replaced (says no commit between base and candidate lists the unit; any base on the candidate history that already lists the feature manifest); new CCA-MANIFEST-READ entry naming the commit that first added the manifest and git log --diff-filter=A --format=%H -- specs/<id>/lifecycle.json (last line).
- lib/feature-package-registration.mjs: doc comment and next: text no longer say the unit commit is the base of the first review.
- scripts/critic-dispatch-preflight.test.mjs line 224: /base of the first review/u became /any base on the candidate history that already lists the feature manifest/u (outside the write-scope list, travels in the patch).
- lib/critic-generic-batch.mjs and its test: slice A content (optional declarationCommit), unchanged here.
- lib/critic-course-admission.test.mjs: 8 cases D165-PF75B (a)-(h) added; case (e) rewritten before implementation with the justification that the criterion is determinism of the introducing commit and an unchanged course key for a fixed base and candidate, not key equality across different candidates.

## Preimage SHA-256 at HEAD
- plugins/pipeline-core/lib/critic-course-admission.mjs: ec2f6feee7679ec83776513427c39b566318135c73da952f07f7462e0357c4a8
- plugins/pipeline-core/lib/critic-course-admission.test.mjs: a36aa1a0e6e8867bcb85be050b292139138f3b0d3022459a56c9002ddf876341
- plugins/pipeline-core/lib/critic-generic-batch.mjs: fa78dee5e74e4a0c90645f6165f38cf8ec9f5ac41ffe00adae36062b986b3b0b
- plugins/pipeline-core/lib/critic-generic-batch.test.mjs: 93b02120b36bb8afed4f964a54b8363ad35dddceeba68230517541c6dc63a10b
- plugins/pipeline-core/lib/feature-package-registration.mjs: bff7385366aacf063d15b66957c55d20b24e700247b94cf6a83df9d9baa16848
- plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs: b479ed64a3e8e6b02c40f828ac9699a9d9ec7195171331e40183a4f739655a13

## Counts (in the clone)
- Before production edit (HEAD + slice A): admission 27 tests, 22 pass, 5 fail ((b), (h), (d), (e), (g) red); CCA001-CCA019 pass.
- After: admission 27/27; critic-generic-batch 22/22; critic-dispatch-preflight 46/46; guard-maintenance-window-kernel-closure 11/11.
- No feature-package-registration test file exists.

## Proposed commit message
fix(critic): read a late review unit at the commit that introduced it

Trailers per GIT-03: `AI-Assisted: true`, `Dispatch: <ID> (goldfish)` (no co-author or session trailers).
