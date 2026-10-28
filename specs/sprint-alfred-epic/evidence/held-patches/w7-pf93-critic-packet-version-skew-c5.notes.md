# PF-93 c5: writer route for (2)+(7) and case (6) written; both still RED (CHECKPOINT)

Candidate 8bbf027d79c6289a7c34ce12d25fd3f042a84162. The c4 patch was applied in the clone only; this patch (4 files, +174/-6, against the candidate) is c4 plus the c5 test changes. Supersedes c1 to c4 patches and notes (the c1 option (B), a release command for a claimed packet, stays a PO decision in the c1 notes).

## Changes against c4 (session-critic-finalizer.test.mjs only)
- New helper legacyBindingFn: the current createLocalDispatchEvidenceBinding result minus assurance, snapshotId recomputed over the old key set. New imports: createLocalDispatchEvidenceBinding, evaluateRepositoryCriticSkipCoverage, CRITIC_REQUIRED_SCHEMA, CRITIC_TRIGGER_INPUT_SCHEMA, CRITIC_DISPOSITION_ADDENDUM_SCHEMA, criticDispositionAddendumPath, execFileSync.
- Case (2)+(7) now admits through the real writer (admitSessionCriticReview with deps.packetDependencies.createLocalDispatchEvidenceBindingFn = legacyBindingFn; the finalizer forwards packetDependencies, session-critic-finalizer.mjs line 386), asserts the stored packet has no assurance key, then finalizes.
- New case (6) "PF-93 (6) skip coverage accepts the pre-assurance binding exactly and refuses a tampered one" (real git fixture modeled on the existing historical-authored case in check-critic-skip-coverage.test.mjs).

## Runs (logs under scratch/agent-out/w7cd, untracked)
- Patched clone, whole session-critic-finalizer.test.mjs: exit 1. Failing set: pre-existing "private task snapshot binds uppercase delivered-v3 bytes ..."; "PF-93 (2)+(7)"; "PF-93 (6)". (1), (3), (4), (5) green. Log green.session-critic-finalizer.test.mjs.log.
- Baseline (clone2 = candidate production code plus the c5 test file): failing set pre-existing + (1), (2)+(7), (5), (6). Log base.session-critic-finalizer.test.mjs.log. (3), (4) pass in both (tampered forms already refused).
- (6) RED reason in the patched clone: the TEST FIXTURE fails before the assertions, createLocalDispatchEvidenceBinding throws LDE-CANDIDATE-BINDING "local dispatch evidence candidate is not admitted for this task" at legacyBindingFn. The v3 record I built in the test is not admitted at the candidate; the likely difference to the working fixture in check-critic-skip-coverage.test.mjs (line ~370) is not yet found (compare record fields, e.g. use that file's v3() helper and fixture layout exactly). Production behaviour of check-critic-skip-coverage.mjs is therefore still UNTESTED.
- (2)+(7) RED reason: not read (budget). Read the failure block of the green log; first hypothesis: the finalize-time binding comparison or the batch reservation still differs, or legacyBindingFn is rejected by the fixture the same way as in (6).
- Not run: critic-packet-preflight, critic-generic-batch and check-critic-skip-coverage whole files. Apply check in clone2 NOT run (clone2 test file was overwritten with the patched copy; restore with git checkout in clone2 first, then driver check). Clones were not cleaned up.

## Deviations
- Case (6) lives in session-critic-finalizer.test.mjs because it is the only test file in the write scope. No existing case weakened, skipped or deleted.

## Proposed commit message (only after (2)+(7) and (6) are green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after GREEN)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification observed: no file matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
