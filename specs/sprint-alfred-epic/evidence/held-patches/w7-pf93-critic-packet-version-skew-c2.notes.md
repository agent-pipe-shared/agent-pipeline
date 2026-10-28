# PF-93 c2: legacy Critic packet form (CHECKPOINT, production edits only, UNTESTED)

Candidate b37240974f6116ef59917d23d4b1bfe95296da32. Supersedes the c1 notes (w7-pf93-critic-packet-version-skew.notes.md) for state; the c1 option paragraph (B), a release command for a claimed packet, stays there as a PO decision and is not repeated.

## State
The patch (w7-pf93-critic-packet-version-skew-c2.patch, git diff --binary against the candidate, 3 files, +34/-6) holds PRODUCTION edits only. NO new test case was written, no RED run exists, no GREEN run exists. Deviation: the production edits were made before the RED cases (test-first order broken); the budget ran out before the cases were written. The patch must NOT be applied as a finished fix; it needs the cases and a GREEN run first. The apply check (driver check in clone2) was not run.

## Edits in the patch
1. scripts/critic-packet-preflight.mjs normalizeCoordinatorOnly: new branch before the current localDispatchEvidence branch. Exactly the old key set (no assurance) with the old canonical digest of the same object without snapshotId is normalized to assurance null with the new-formula snapshotId. Any other deviation falls through to the existing branch and stays CPP-COORDINATOR-BINDING.
2. Same file, inspectClaimedSessionAdmission: all digest checks use the raw packet; the returned packet is a view whose coordinatorOnly.localDispatchEvidence is the normalized one (skipped for historicalFreshReview packets).
3. scripts/check-critic-skip-coverage.mjs (~541-573): accepts the legacy exact key set and old digest (legacyForm = no own assurance key).
4. scripts/session-critic-finalizer.mjs prelaunch catch: keeps SCF-PRELAUNCH-ADMISSION, adds error.cause (typed upstream code matching /^[A-Z0-9-]+$/) and names it in the message ("admission cause: CODE"), so the CLI detail carries it.
5. lib/critic-generic-batch.mjs: not changed; (A4) not yet proven by a case.

## Baseline (clone2, unchanged candidate), whole session-critic-finalizer.test.mjs
39 tests, 38 pass, 1 fail. Pre-existing failure: "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose" (test line 231 deepEqual of the binding without assurance versus the real creator, which emits assurance null and the new snapshotId). Left untouched. Log: scratch/agent-out/w7cd/base.session-critic-finalizer.test.mjs.log (untracked scratch).

## NOT done
All RED/GREEN cases (legacy normalize, admit+finalize reaching the verdict, tampered forms, attested claim without the new form, cause in SCF-PRELAUNCH-ADMISSION, skip-coverage legacy acceptance, generic-batch admit of a legacy packet); patched whole-file runs of the four suites; patched failing-name sets; apply check; driver cleanup (both clones still exist under scratch/agent-out/w7cd).

## Proposed commit message
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (once the cases and GREEN exist)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. No file touched matches TP-1..TP-13. An independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Continuation card
Done: clones at candidate, baseline run, production edits, patch. Remaining: append the cases to the clone session-critic-finalizer.test.mjs (helper: wrap the real createLocalDispatchEvidenceBinding through deps.packetDependencies.createLocalDispatchEvidenceBindingFn, strip assurance, recompute snapshotId by sha256Canonical of the body), run RED against clone2-equivalent code, GREEN in clone, whole-file runs, regenerate patch, driver check, cleanup. Next step: node scratch/agent-out/w7cd/driver.mjs run red plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs after adding the cases.
