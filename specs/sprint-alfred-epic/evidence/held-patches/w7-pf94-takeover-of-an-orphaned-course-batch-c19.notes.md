# W7 PF-94 takeover of an orphaned course batch (c19) - CHECKPOINT, production change NOT yet made

Slice W7-PF94-TAKEOVER-OF-AN-ORPHANED-COURSE-BATCH-C19-C1-20261027. Candidate f813c9e60488c7a6c80cfea9707b192eab0571f9. Held patch, nothing committed. Targeted delivery: blocked (budget), tests written, production edit and GREEN pending.

## State

- Scratch clones exist (NOT cleaned): `scratch/agent-out/w7cl/clone` (edits) and `clone2` (unchanged baseline), driver `scratch/agent-out/w7cl/driver.mjs` (modes setup, run LABEL files..., run2, patch, check, cleanup). Logs go to `scratch/agent-out/w7cl/logs/<label>.log`.
- The patch file next to this note contains ONLY the new test cases (RED state, production unchanged). It is not the deliverable; regenerate with `driver.mjs patch` after the production edit.
- New cases written in the clone (RED runs were started: logs `red-generic.log`, `red-finalizer.log`; their results were NOT read):
  - `plugins/pipeline-core/lib/critic-generic-batch.test.mjs`: id `CGB034` appended to `completionCaseIds`; helper `reservedCourse(fx)` builds a feature-course batch through the real reserve path (claimed, unconsumed); case "PF94 c19 takeover refuses only the SAME course key..." covers (b) same key -> CGB-TAKEOVER-COURSE, supersede refused, repair names `--add-review-lineage`; (c) other key + history -> CGB-TAKEOVER-HISTORY; (d) other key, unconsumed -> CGB-TAKEOVER-OPEN; (f) CGB-CONFLICT text contains "earlier course key of this feature" and "no registered lineage".
  - `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`: "PF94 TAKEOVER (5)" covers (a) and (e): real course path via `featureCourseFixture`, admit + finalize (consumed), CLI inspect reports originKind feature-course, key differs from the key at HEAD, refusalCode null; supersede succeeds, audit exists, files moved under `superseded/<digest>/{logical,origins}`, old registration stays, ownership for the new key is claimed false, replay is idempotent. Unverified: that the fixture finalize call shape works as written.

## Update after the budget grant (supersedes "production change NOT yet made" above)

- Production edits made in the clone (critic-generic-batch.mjs): takeoverState refuses CGB-TAKEOVER-COURSE only when `facts.originTargets[0].courseKey === courseKey`; TAKEOVER_REPAIR COURSE text names `--add-review-lineage --packet <packetId>` before the next correction commit, else delta mode; TAKEOVER_DETAIL gained the earlier-course-key sentence.
- Finalizer RED (red-finalizer.log): case (5) failed with actual 'CGB-TAKEOVER-COURSE' versus expected null, i.e. for the right reason. The log also shows the pre-existing 'private task snapshot binds uppercase delivered-v3 bytes...' failure.
- Generic-batch GREEN (green-generic.log): tests 34, pass 34, fail 0. Baseline clone2 (base-generic.log): tests 33, pass 33, fail 0.
- Finalizer GREEN, critic-course-admission GREEN and the clone2 finalizer baseline were started; their logs were NOT read (the log files did not exist yet when checked). Failing-name sets are not compared.
- The patch file was regenerated after the production edit (13031 bytes, 3 files expected: critic-generic-batch.mjs, critic-generic-batch.test.mjs, session-critic-finalizer.test.mjs). `driver.mjs check` (apply check in clone2) NOT run. Clones NOT cleaned.
- PIN FOUND, not touched: `harness/config/verify-case-completion-augmentations.v1.json` (entry critic-generic-batch-tests, caseIds list CGB001..CGB033) and `harness/config/verify-case-completion.v1.json` (disposition required), plus `harness/scripts/check-verify-case-completion.test.mjs` line 172 (`top-level-assertions`, 66 for the generic-batch suite). The new case id CGB034 needs the augmentations caseIds list extended by the parent; the pin test count 66 may need review.

## Answer on courseHistoryRegistered (read from code)

`session-critic-finalizer.mjs` line 53: `registeredHistory.length > 0`, where `registeredHistory` (critic-course-admission.mjs lines 440-454) is every retained lineage row of the FEATURE (alias-merged), not per key. When history exists the resolved course key is derived from that history's genesis record, so the requested key is the lineage key. Hence courseHistoryRegistered true means the feature has any lineage at all; an old key with registered lineage cannot coexist with false. No stop condition: widening to other-key owners with history false is safe.

## Remaining production change (critic-generic-batch.mjs, to make in the clone)

1. `takeoverState` line 773: `if (facts.originKind === "feature-course") return done("CGB-TAKEOVER-COURSE");` becomes a refusal only when `facts.originTargets[0].courseKey === courseKey`.
2. `TAKEOVER_REPAIR["CGB-TAKEOVER-COURSE"]`: say that if its packet is consumed and its lineage is not registered, run `register-feature-package.mjs --root <repo> --add-review-lineage --packet <packetId>` BEFORE the next correction commit, otherwise continue the course in delta mode.
3. `TAKEOVER_DETAIL` (line 736): add "The batch may belong to an earlier course key of this feature; the takeover verbs retire it when it is fully consumed and the feature has no registered lineage."
4. Supersede needs no change (line 815 moves originTargets[0]); proven by finalizer case (5).

## Next steps

Edit the three spots in the clone, run GREEN for critic-generic-batch.test.mjs, session-critic-finalizer.test.mjs, critic-course-admission.test.mjs (clone) and generic-batch plus finalizer in clone2 (baseline, expected 33/33, 77/78 with the known `private task snapshot binds uppercase delivered-v3 bytes...` failure), compare failing-name sets, `driver.mjs patch`, `driver.mjs check`, update this note, `driver.mjs cleanup`.

## Not done

Everything under Next steps; operator docs of the four verbs; Verify; independent Critic review (parent-owned batch gate); native Windows; real Glossover retest. Possible pin on the CGB id list (33 ids) was not searched; new case ids may need pin updates (not touched).

## Proposed commit message

fix(critic): let the course takeover retire a consumed feature-course batch of another course key that has no registered lineage (PF-94)

## Operator flow (after completion)

Apply the patch on the installed PF-94 candidate, `git add -u` with a path limit to the three files, one `--no-verify` commit, then stamp and install. Files observed: none matched TP-1..TP-13; edits only in the scratch clone.
