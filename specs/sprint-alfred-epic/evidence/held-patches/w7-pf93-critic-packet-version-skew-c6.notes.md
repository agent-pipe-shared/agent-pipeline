# PF-93 c6: case (6) repaired and green; case (2)+(7) still RED with a named cause (CHECKPOINT)

Candidate a0bccc215cd9e23c1a96bcf17d792f2a9eaf5cfe. The c5 patch was applied in the clone only; the c6 patch (4 files, +177/-6, against the candidate) is c5 plus two test fixes in session-critic-finalizer.test.mjs. It supersedes the c1 to c5 patches and notes. The c1 option (B), a release command for a claimed packet, stays a PO decision in the c1 notes.

## Changes against c5 (session-critic-finalizer.test.mjs only)
- Case (6): legacyBindingFn is now called BEFORE the disposition addendum is written, as the existing "ignored historical dispatch records bind through the consumed private snapshot only" case does. With the addendum present, evaluateReviewAdmission does not admit the candidate and createLocalDispatchEvidenceBinding throws LDE-CANDIDATE-BINDING. Not a production defect. GREEN now.
- Case (2)+(7): the c5 premise was wrong. The current writer (prepareCandidatePacket, critic-packet-preflight.mjs line 545) runs normalizeCoordinatorOnly, which rewrites a pre-assurance binding to the current form, so a packet written through the real writer never holds the legacy form (the stored assurance key is present, which is the assertion that failed with true !== false). The case now admits through the real writer and then re-seals the packet as legacy with rewriteAsLegacyPacket (the digest chain is re-sealed).

## State of case (2)+(7): RED, cause read
After the rewrite the finalizer fails with CGB-RESERVATION (GenericCriticBatchError "Generic Critic batch is unavailable or refused"). The failure comes from retainedReservation (critic-generic-batch.mjs line 559) via readReservedAdmission (line 583), called from session-critic-finalizer.mjs line 528. The batch reservation retains the original packet digest, so re-sealing the packet makes it mismatch. The recon lines are model output; I read these stack frames from the log, not the reservation code itself.
Next step: either re-seal the reservation file too (find what retainedReservation compares, in critic-generic-batch.mjs around lines 540-585), or build the legacy packet by passing a creator that emits the legacy form through a path that skips normalizeCoordinatorOnly (not available at the writer). Not done.

## Runs (logs under scratch/agent-out/w7cd, untracked)
- Patched clone, whole session-critic-finalizer.test.mjs (log green.session-critic-finalizer.test.mjs.log): pass 43, fail 2. The failures are the pre-existing "private task snapshot binds uppercase delivered-v3 bytes ..." and PF-93 (2)+(7). PF-93 (1), (3), (4), (5), (6) are GREEN.
- Baseline (clone2 at the unchanged candidate): run started in the background (log base.*.log for the four whole files). I did not read it before the budget checkpoint, so the baseline failing-name sets and the whole-file runs of critic-packet-preflight, critic-generic-batch and check-critic-skip-coverage are NOT reported here: not verifiable by me.
- Case RED-before evidence for the new cases against the unchanged production code: the c5 notes record (1), (2)+(7), (5), (6) red in the baseline; I did not rerun that.
- Apply check: driver check (git apply --check in clone2 at the candidate) exit 0 for the c6 patch.

## Not done
- (2)+(7) green; baseline versus patched failing-name comparison; the three other whole files; driver cleanup (clones left in scratch/agent-out/w7cd, untracked).
- Independent Critic review stays a parent-owned batch gate. Full Verify and PO acceptance stay pending. The patch is NOT yet releasable with a red (2)+(7): either fix it or apply without that case.

## Proposed commit message (only after (2)+(7) is green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification observed: no file matches TP-1..TP-13.

## Deviations
Cases live in session-critic-finalizer.test.mjs, the only test file in the write scope. No existing case weakened, skipped or deleted.
