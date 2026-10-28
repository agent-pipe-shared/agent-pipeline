# W7 PF-94 course takeover of a non-course batch (c15) - GREEN for the briefed check; clone3 reproduction, path walk and generic-batch whole-file run still open

Slice W7-PF94-COURSE-TAKEOVER-OF-NON-COURSE-BATCH-C15-C1-20261027. Candidate 7e608953ce7f455c6a944392c351393f647bb771. Held patch, nothing committed. Targeted delivery: green for the briefed check (see the GREEN line below); the first checkpoint text "blocked, GREEN not run" is superseded.

## State

- Patch: `w7-pf94-course-takeover-of-non-course-batch-c15.patch` (3 files: `critic-generic-batch.mjs`, `session-critic-finalizer.mjs`, `session-critic-finalizer.test.mjs`; 228 insertions, 3 deletions). `git apply --check` in clone2 at the candidate: exit 0.
- RED (clone, new cases only, original production code): four new cases `PF94 TAKEOVER (1)` to `(4)` FAIL. Log tail: tests 78, pass 73, fail 5 (the 5th is the pre-existing failure below).
- Baseline (clone2, unchanged candidate): tests 74, pass 73, fail 1. The one failure is the known `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`; it fails identically in the RED set.
- GREEN (clone, patched, whole `session-critic-finalizer.test.mjs`): tests 78, pass 77, fail 1. All four `PF94 TAKEOVER (1)-(4)` cases pass; the single failure is the pre-existing `private task snapshot binds uppercase delivered-v3 bytes...`, failing identically in baseline (clone2: tests 74, pass 73, fail 1). Failing-name sets identical except the new cases (which now pass). The patch file was generated from this exact clone state and applies cleanly in clone2 (exit 0). Update: the "never executed" caveat of the first checkpoint is void. Targeted delivery: green for the briefed check.
- STEP 1 (reproduce with the upgrade-state clone3 at 692301fd9), STEP 3 (path after takeover) and the whole-file runs of `critic-generic-batch.test.mjs`: NOT DONE. Case (1) is the intended reproduction of the real state (it asserts the CGB-CONFLICT and that its text names both verbs) but the printed conflicting entry (index path, registration schema, originTargets) was not printed. The old-build registration schema was not compared; `registration()` accepts both v1 and v2 schemas, and the inspect output carries `registrationSchema` so that the difference is visible.

## Design as written

- `critic-generic-batch.mjs`: `inspectFeatureCourseTakeover` (read-only; facts: work ids, owning batchRef, registration schema, origin kind and targets, packet ids, allPacketsConsumed, courseHistoryRegistered, refusalCode, repair, digest) and `supersedeFeatureCourseTakeover` (reason first, then digest, then refusal; audit record `superseded/<digest>/audit.json` written first, then the logical and origin index files are RENAMED into `superseded/<digest>/{logical,origins}`, then `complete.json`; replay or resume finishes what the audit names). Nothing is deleted; old registration, packets, receipts and exports stay in place. Typed refusals: CGB-TAKEOVER-HISTORY, -OPEN, -COURSE, -STALE, -PARTIAL, plus -NONE (nothing owned) and -REASON (empty, over 256 chars, path separator or control char). Order: PARTIAL, COURSE, HISTORY, OPEN. The CGB-CONFLICT refusals in `featureOwnership` now carry a repair text naming both verbs.
- `session-critic-finalizer.mjs`: verbs `inspect-course-takeover` and `supersede-course-takeover` (`--root <repo> --request <file>`; request schemas `pipeline.session-critic-course-takeover-inspect-request.v1` with `featureId`, and `...-supersede-request.v1` with `featureId`, `digestSha256`, `reason`). The operator types only the feature id: base = first commit touching the manifest, candidate and registration = HEAD, course key from `resolveRegisteredCriticCourseIdentity`, work ids from the review unit read through `readCriticReviewUnit`. History is `registeredHistory.length > 0`.
- Known gaps: CGB-TAKEOVER-COURSE has no test (a feature-course-origin batch fixture is not cheap to build); "open" is judged from the batch reservations only (a held, unreserved packet of the batch target is not scanned); the course key derived at HEAD can differ from the key a later request computes, which matters only for the feature-course origin-index existence check; republish-index of the old batch would be refused CGB-CONFLICT once the course registers its own batch.

## Not done

Lineage record writer and delta request writer (separate slices); Verify registration (no new test file was added; cases live in the registered finalizer test); Verify run; independent Critic review (parent-owned batch gate); native Windows; the GREEN run; STEP 1 clone3; STEP 3; clone cleanup (clone, clone2 and `driver.mjs` under `scratch/agent-out/w7ch/` are left for the resume; `driver.mjs cleanup` deletes the clones).

## Protected-path classification observed

The edited files (`plugins/pipeline-core/lib/critic-generic-batch.mjs`, the finalizer script and its test) matched no TP-1..TP-13 pattern; edits happened only in the scratch clone.

## Proposed commit message

feat(critic): let a feature course take over the work ids of a consumed non-course batch with inspect and supersede verbs (PF-94)

## Operator flow (after a GREEN resume)

apply the diff in the repository, `git add -u` with a path limit to the three files, `--no-verify` commit, stamp, install. Then per feature: `inspect-course-takeover`, read `refusalCode` and `digestSha256`, `supersede-course-takeover` with that digest and a reason, then rerun round 1 on the course path.
