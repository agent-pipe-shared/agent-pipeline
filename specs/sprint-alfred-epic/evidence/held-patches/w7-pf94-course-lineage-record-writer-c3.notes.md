# W7 PF-94 c3: CCA049 green; failing-round fixture built; case (g) still RED (needs diagnostic evidence for the correction candidate)

Slice W7-PF94-COURSE-LINEAGE-RECORD-WRITER-C3-C1-20261027. Candidate c8648cbbb609d55ef5db333f1375144a168cf4a9, stacked on the c16 and c2 patches.
Patch: w7-pf94-course-lineage-record-writer-c3.patch = INCREMENT (git diff --binary, clone worktree vs index; baseline = candidate + c16 + c2). `git apply --check` in clone2: exit 0. Targeted delivery: blocked (partial; case (g) red, named).

## Cause of CCA049 (measured)
The preflight of the course:false fixture returned CGB-CONFLICT (critic-dispatch-preflight.mjs lines 345-369 reads the feature course; critic-generic-batch.mjs featureOwnership lines 735-745 refuses a unit whose work ids a non-V2 generic batch owns). A feature spec plus a changed lifecycle.json therefore cannot be preflighted once a generic batch exists, and session-critic-finalizer.mjs genericBatchFor (line 225) refuses a genericBatchRef with a course admission (SCF-GENERIC-BATCH-FEATURE). The upgrade state (a round admitted before the course rule) is reproduced by computing the packet-ready preflight BEFORE the batch is registered, with the course context (needed for registrationCommit), stripping coordinatorOnly.courseAdmission to null, and replaying it via deps.preflightCriticDispatchFn for admit and finalize.

## Changes (2 files, in the patch)
- lib/critic-course-admission.test.mjs: consumedCourseRoundFixture non-course branch (preflightBeforeBatch + replay dep, new import of preflightCriticDispatch); new option `failing` (documented in a comment above the helper: verdict pass false with one major finding, spec_ref AC-1); new case "PF94 LINEAGE (g)" (CCA050).
- lib/feature-package-registration.mjs (addCriticReviewLineage, before the generic compile refusal): compile code CGB-CONFLICT now returns FPR-LINEAGE-NO-COURSE-CLAIM with the takeover repair text, because the claim reader accepts any claimed packet, so the old check never fired for a generic-batch round.
Justification tying to criterion: the case (d) assertion (code and three repair words) is unchanged; only the fixture and the verb behaviour changed.

## RED / GREEN and counts
- Whole critic-course-admission.test.mjs in the patched clone, last run: tests 52, pass 51, fail 1. The one failure is CCA050 (case g). CCA049 is GREEN (single-case runs were red before the verb change with FPR-LINEAGE-COMPILE/CGB-CONFLICT).
- Baseline per the briefing (candidate + c16 + c2): tests 51, pass 50, fail 1 (CCA049). Failing-name sets: baseline {CCA049}; patched {CCA050 (new)}.
- NOT run: whole file in clone2 (patched vs baseline compare), critic-review-lineage.test.mjs, critic-diagnostic-evidence.test.mjs, the pin test.

## Case (g) state (printed)
Request with the correction commit as candidate, baseCommit = the round candidate, registrationCommit = the correction commit, mode delta: decision `{"status":"unavailable","code":"CCA-DETERMINISTIC-UNAVAILABLE"}`. With baseCommit = the original base it was `CCA-PARENT`. So the parent lineage is read once base = parent candidate; the next gate is diagnostic evidence for the new candidate. Next step: in the fixture, produce a diagnostic for the correction commit (produceCriticDiagnostic), commit it, register it in the manifest (as the existing fixture does), then read the delta admission and expect CCA-DELTA-REQUIRED; the assertion that the written lineage record carries an open finding is in the case and not yet reached.

## Answer on the synthesized lineage (partial, from the code read)
addCriticReviewLineage synthesizes one package `feature-package` with all packet.diffPaths and one integration edge `feature-delivery`, coverage complete:true with the review unit's criterionIds (feature-package-registration.mjs lines 539-540). The lineage builder (critic-review-lineage.mjs lines 433-439) projects findings from the real consumed result, so findings are real; packages, edges and coverage.complete are NOT derived from the packet or review unit (a multi-package feature or a round that did not cover every criterion would be mis-stated as complete). Not verified against a real failing round; the record shape for the failing round was not reached.

## NOT done
Case (g) green, clone2 and sibling suite runs, delta request writer (next slice), end-to-end pin, operator docs, Verify registration, Verify run, independent Critic (parent-owned batch gate), native Windows. Clones left in scratch/agent-out/w7ci (cleanup not run).

## Proposed commit message
feat(critic): cover the claim-less upgrade state and a failing course round when registering a lineage record (PF-94)

## Operator flow
Apply AFTER the c16 patch and the c2 patch: apply-diff, `git add -u` with a path limit, `--no-verify` commit, stamp, install. No protected path is touched by this increment (command-catalogue.mjs belongs to c2). Independent Critic review stays a parent-owned batch gate.
