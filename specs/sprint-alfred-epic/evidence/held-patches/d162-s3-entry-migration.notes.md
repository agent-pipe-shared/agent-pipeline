# D162 S3 held patch: implementation entry refuses a legacy deferred adoption

Patch: `d162-s3-entry-migration.patch` (git diff against the stack commit; 6 files, 172 insertions, 88 deletions).
Apply after C29 item 14 (the 14 patches of `scratch/wave3/c29-order-14.txt`, in order). Independent of the D162 S2 patch.
Stack check: a fresh clone of the repository HEAD, the 14 C29 patches via `git apply --index`, then this patch: applies cleanly (exit 0).

## Behaviour

- `inspectArchitectureEntryReadiness`: a resolved `deferred` disposition returns `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED` with nextAction `ARCHITECTURE-ADOPTION-MIGRATION` (step 1 `architecture-measure.mjs --apply` only when architecture/map is missing; step 2 `architecture-adoption.mjs prepare --decision approved-scoped`; step 3 PO confirmation and `apply`). The check runs before the map, fitness-model and baseline checks. The deferral branch, the net-new ratchet and the deferred-only class-9 allowance are removed.
- `entry-gates`: an ok `deferred` disposition is denied with `GUARD-ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED` (constant added to `lib/guard/constants.mjs`). The other denial text names "approved-scoped or partial". The operator-hotfix-10 deferred allowance is removed; the greenfield pending allowance stays.
- `designToImplementationHandoverAction` (read only): offers reopen-design only for authority status `drifted` with nextAction `reopen-design`; nothing routes the new code. Unchanged.

## Preimage SHA-256 (stacked clone, after C29 item 14)

- plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs 4b5230c85d61ec8fb7a728f8d35c444702545850976434c0caf12318d938ae42
- plugins/pipeline-core/lib/architecture-entry-readiness.mjs 2c6958984a831f73b1c36d95f9e456db57c02da8e469cf8d0f3b6099bd982361
- plugins/pipeline-core/lib/architecture-entry-readiness.test.mjs a04e761e561dc77a7d53df2dd584ac7e55d273429dec5a0ce061e61275bfa7ac
- plugins/pipeline-core/lib/guard/constants.mjs b6b6e33c44594b7e3570f89e2258c580f774157c0f65fea56058767b911536ec
- plugins/pipeline-core/lib/guard/entry-gates.mjs 8f41c43a50a7f58a98493b84ace613c7993626ae812d73212a721b5f7f0d7003
- plugins/pipeline-core/lib/pins/brownfield-implementation-entry-demands-a-greenfield-design-block.test.mjs 437fc8e5d7ec4ba8fb903e99730dc03437b40019f436c1d64238869c824dbae9

## Counts (in the stacked clone, with the patch)

- brownfield pin: 14/14; guard-lifecycle-ready: 393 pass, 3 skipped (pre-existing), 0 fail of 396; architecture-entry-readiness: 36/36
- entry-gates-greenfield-pending 3/3; greenfield pending pin 7/7; architecture-adoption 44/44; architecture-fitness 58/58; kernel-closure 1/1; check-consumer-safe-paths 9/9
- New D162 S3 tests: (a)-(d) in the readiness file, (e) in guard-lifecycle-ready; RED before the production edits (4 of 5 failed, (d) the approved-scoped regression guard passed), GREEN after.

## Existing assertions changed (each commented D162 in the patch; no case deleted or skipped)

Subject is the retired deferral, expectation moved to the migration refusal:
- readiness test: the deferred fitness-observation case, the net-new case, and "a deferred architecture decision remains visible without changing lifecycle readiness" now expect `ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`.
- brownfield pin: "a not-required design result falls through to the adoption disposition", the net-new under deferral cases (state 1 and state 2) and "a deferred established project is NOT admitted" expect the migration code instead of `ARCHITECTURE-FITNESS-NOT-READY` or ready.
- brownfield pin "under a PO deferral the guard defers to the library entry verdict": the hotfix-10 allowance is retired, so a library "ready" no longer lifts the guard denial (now exit 2, `GUARD-ARCHITECTURE-FITNESS-NON-GREEN`); the blocked half is unchanged.
- guard-lifecycle-ready: "a valid architecture deferral does not let a missing physical map mint implementation authority" expects `GUARD-ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED`.

Subject is something else, only the fixture disposition switched deferred to approved-scoped (expectation kept):
- readiness test: the two checkpoint-debt cases and the descendant map repair case (the latter gets a passing `evaluateArchitectureFitness` stub because approved-scoped class 9 is unavailable without a signed record).
- brownfield pin: the `guardDeps` helper.
- guard-lifecycle-ready: the AC-7 rigor case.

## Proposed commit message

feat(architecture): refuse a legacy deferred adoption at implementation entry with a typed migration action

D162 S3. A deferred architecture adoption now blocks set-phase implementation with ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED (library) and GUARD-ARCHITECTURE-ADOPTION-MIGRATION-REQUIRED (guard), naming the measure, prepare and PO-confirmed apply steps. The deferral branch, net-new ratchet and the hotfix-10 allowance are retired.
