# W7 PF-94 c19b - origins assertion, CGB034 registration, VCR01 pin (CHECKPOINT: GREEN runs not read)

Slice W7-PF94-TAKEOVER-OF-AN-ORPHANED-COURSE-BATCH-C19B-C1-20261027. Candidate 9222882fe6c0b7a843b93ed1ac78b0f272afe282. Held patch, nothing committed. Targeted delivery: blocked (budget) - patch written and apply-checked, GREEN counts not read.

## Increment (stacked on the c19 patch; 2 files in the patch after the Elephant dropped the augmentation hunk, see item 2)

1. `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`, case PF94 TAKEOVER (5): the assertion `readdirSync(origins).length === 0` was replaced by: exactly one origins file remains, and its name is not among the files moved under `superseded/<digest>/origins`; one comment names the delivery-target entry. Superseded origins count 1 and every other assertion are kept.
   - Cause re-verified in the clone: `critic-generic-batch.mjs` publishes an origins entry for the packet's delivery target (`targetForPacket`, lines 393 and 869-870); supersede moves the work-id entries and `originTargets[0]` only (line 815). The delivery-target entry therefore legitimately stays; it only blocks a reserve with the SAME delivery target, which a fresh course after correction commits does not have. The criterion (a fresh course may admit) is still asserted by the unchanged `assertFeatureCriticReviewUnitOwnership(...).claimed === false` line. The change corrects an over-strict expectation; it does not weaken the check that the feature-course origin was retired (now asserted by name).
   - RED (clone, unchanged): `logs/red-final.log`: tests 79, pass 77, fail 2: the known `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose` and case (5) at the origins length assertion (`1 !== 0`). The remaining file name was not printed (deviation: the edit was made before the RED log was read; the RED value 1 confirms the count).
2. `harness/config/verify-case-completion-augmentations.v1.json`: **DROPPED from the patch by the Elephant** after the Goldfish checkpoint. The Goldfish measured that the entry critic-generic-batch-tests lists only CGB001..CGB011 (the briefing wrongly said CGB001..CGB033, a claim inherited from the c19 report) and extended it to CGB034. That widening would make Verify demand completion dispositions for 23 existing cases that the policy never required, which this fix does not need. The completion policy is a subset of the ids the test file declares (33 ids against 11 before this change, passing), so CGB034 needs no entry. The patch therefore carries two files.
3. `harness/scripts/check-verify-case-completion.test.mjs` line 172: pin of critic-generic-batch-tests 66 -> 74. RED (clone before edit, `logs/red-case.log`): only VCR01 red, actual 74 versus expected 66. Only that number changed.

## Runs

- Patch: `git diff --binary` of clone vs index, 3962 bytes. `driver.mjs check` (git apply --check in clone2 baseline = c19 stacked): exit 0.
- Started, results NOT read: `scratch/agent-out/w7cm/logs/green-final.log` (clone finalizer, expect 79 tests, 78 pass, 1 fail = the known private-task-snapshot case), `base-final.log` (clone2 baseline finalizer, expect case (5) red there plus the known failure). Failing-name sets not compared.
- NOT run: clone check-verify-case-completion.test.mjs after the pin edit, critic-generic-batch.test.mjs (34/34 measured in c19; unchanged here), augmentation policy tests, clone2 case-completion.
- Clones NOT cleaned: run `node scratch/agent-out/w7cm/driver.mjs cleanup` after reading logs. Do not clean w7cl.

## Protected paths

None of the three files matches TP-1..TP-13 (edits were made in the scratch clone only).

## Not done

Reading the GREEN logs, the remaining runs above, operator docs, Verify, independent Critic review (parent-owned batch gate), native Windows, real Glossover retest.

## Proposed commit message

test(critic): correct the origins assertion of the orphaned-course takeover case, register CGB034 and update the VCR01 pin of critic-generic-batch-tests (PF-94)

## Operator flow

Apply AFTER the c19 patch: `git apply` this patch, `git add -u` limited to the three files, one `--no-verify` commit, then stamp and install. Set it as the next held-patch in the bundle after c19.
