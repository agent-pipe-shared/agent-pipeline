# PF-93 c4: helper fixed, 4 of 5 cases green, case (2)+(7) still RED (CHECKPOINT)

Candidate a79923a9df3e72cf934b858e8f5b4781555d72d1. Supersedes the c1 to c3 patches and notes for state (the c1 option (B), a release command for a claimed packet, stays a PO decision in the c1 notes).

## State
Patch w7-pf93-critic-packet-version-skew-c4.patch (4 files, +120/-6): the c2 production draft plus the five PF-93 cases, plus ONE helper line changed against c3. Not a finished fix: case (2)+(7) is red, case (6) is not written.

## Cause of the c3 failure (proved)
readJson in critic-packet-preflight.mjs (line 215) refuses a stored file whose mode has any group or other bit (mode & 0o077). The c3 helper rewriteAsLegacyPacket rewrote packet/state/claim/session-admission with plain writeFileSync (mode 0644) after rmSync, so every read failed with CPP-RECORD. The digest chain was already re-sealed correctly. Correction: the write now passes { mode: 0o600 } (one changed line in session-critic-finalizer.test.mjs, helper `write`).

## Runs (scratch clones, log files under scratch/agent-out/w7cd, untracked)
- RED (clone2 = candidate production code plus the c4 test file): 44 tests, 40 pass, 4 fail. Failing set: "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose" (pre-existing, line ~216), PF-93 (1), PF-93 (2)+(7), PF-93 (5). Log base-red.session-critic-finalizer.test.mjs.log.
- GREEN (clone = draft plus fixed helper): 44 tests, 42 pass, 2 fail. Failing set: the same pre-existing case, and PF-93 (2)+(7). (1), (3), (4), (5) are green. Log green.session-critic-finalizer.test.mjs.log.
- Baseline vs patched whole-file sets: baseline (c4 test file on unpatched code) fails pre-existing + (1), (2)+(7), (5); patched fails pre-existing + (2)+(7). Cases (3) and (4) pass in both, as expected (tampered forms are already refused as CPP-COORDINATOR-BINDING).
- Not run: the other three suites (critic-packet-preflight, critic-generic-batch, check-critic-skip-coverage tests), and case (6) is not written (budget).
- Apply check: see the driver check line in the report (git apply --check in clone2 at the candidate).

## Why (2)+(7) is still red (diagnosed, not fixed)
finalizeSessionCriticReview fails in critic-generic-batch.mjs retainedReservation (line ~559) with CGB-RESERVATION: the generic batch reservation, written at admit time, stores packetDigest and claimSha256 of the ORIGINAL packet; the helper rewrites the packet afterwards, so the reservation no longer matches. The test route that fixes this is the one the briefing preferred: do not rewrite files. Pass deps with packetDependencies.createLocalDispatchEvidenceBindingFn returning the legacy binding (old key set without assurance, snapshotId = sha256Canonical of the body) into admitSessionCriticReview for the fixture, so the real writer produces packet, state, claim, admission and the batch reservation consistently; then finalize under the draft. (admitSessionCriticReview takes the preflight deps at critic-packet-preflight.mjs line ~509; verify that the finalizer forwards them.) Helper rewriting stays valid for (1), (3), (4), (5), which never touch the batch reservation.

## Deviations
- Helper route: file rewrite kept (one-line mode fix) instead of the preferred writer route, because it turns (1), (3), (4), (5) valid; (2)+(7) needs the writer route as above.
- No existing case weakened, skipped or deleted.

## Not done
Case (6) check-critic-skip-coverage legacy-form acceptance and tamper refusal (the draft change in check-critic-skip-coverage.mjs is untested); (2)+(7) green; three-suite sweep; release command option (B) stays a PO decision.

## Proposed commit message (only after (2)+(7) and (6) are green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after GREEN)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification observed: no file matches TP-1..TP-13. Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.
