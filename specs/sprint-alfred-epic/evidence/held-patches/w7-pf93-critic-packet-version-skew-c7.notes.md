# PF-93 c7: reservation re-seal works; (2)+(7) now fails one step later; two preflight cases newly red (CHECKPOINT)

Candidate 56e45c3776835350fba6f088dfca7b2907df0219. The patch (w7-pf93-critic-packet-version-skew-c7.patch, 4 files, +196/-6) is the c6 patch plus one test helper and one call in session-critic-finalizer.test.mjs. It supersedes the c1 to c6 patches and notes. The c1 option (B), a release command for a claimed packet, stays a PO decision in the c1 notes.

## Change against c6 (session-critic-finalizer.test.mjs only)
- New helper resealReservationForLegacyPacket(fx, request): rewrites controlRoot/generic-batches/<batchId>/full-admission.json (mode 0o600, canonicalJson) with packetDigest, claimSha256 (both over the legacy-sealed files) and sourceSha256 = sha256Canonical({registration, member, full: null, parent: null, packetDigest}), the exact chain retainedReservation (critic-generic-batch.mjs lines 549-571) checks. Called in case (2)+(7) right after rewriteAsLegacyPacket. No production change: option (i)/(ii) not needed; the reservation check is not weakened.
- Result: CGB-RESERVATION is gone.

## State of case (2)+(7): still RED, next cause read
Failure is now SCF-PRELAUNCH-BINDING at session-critic-finalizer.mjs line 544 (the big binding condition 531-544; not narrowed to a single clause). Candidates to check next: the admitted route comparison (admittedRouteFor with the re-sealed packet), the admission courseSourceSha256/courseDecisionSha256 against genericCourseFor(reservation) (the reservation sourceSha256/decisionSha256 feed it; check that genericCourseFor uses fields I re-sealed), packet.request.sessionBinding, and the reference list. Not done.

## Runs (logs in scratch/agent-out/w7cd, untracked; clones left in place)
- Baseline clone2 at the unchanged candidate, whole files: session-critic-finalizer pass 38 fail 1; critic-packet-preflight pass 17 fail 0; critic-generic-batch pass 28 fail 0; check-critic-skip-coverage pass 48 fail 0. Baseline failing set: {session-critic-finalizer: "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose" (pre-existing, left alone)}.
- Patched clone, whole files: session-critic-finalizer pass 43 fail 2 (the pre-existing one + PF-93 (2)+(7)); critic-generic-batch pass 28 fail 0; check-critic-skip-coverage pass 48 fail 0; critic-packet-preflight pass 15 fail 2.
- NEW REGRESSION FOUND in the c6 production draft (not caused by c7): critic-packet-preflight.test.mjs "CPP09 binds an admissible closed Nova A5 lineage at claim and rejects a forged binding" and "CPP15 CPPA-3 a binding without the assurance key is refused as not closed" fail in the patched clone and pass in the baseline. The c6 notes did not report this because those files were not read. CPP15 pins the refusal of a binding without the assurance key, which the draft deliberately now normalizes; it needs either a justified update (ties to AC: pre-assurance binding is accepted exactly, tampered ones refused) or a narrowed draft. I did not read the failure bodies (budget); no existing case was changed.
- PF-93 (1), (3), (4), (5), (6) GREEN in the patched clone. RED-before for the new cases is not re-run here; the c5 notes record it.
- Apply check: driver check (git apply --check in clone2 at the candidate) exit 0 for the c7 patch.

## Not done
- (2)+(7) green; diagnosis of the two preflight regressions; driver cleanup (clones left untracked in scratch/agent-out/w7cd). Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending. The patch is NOT releasable: two preflight cases regress and (2)+(7) is red.

## Proposed commit message (only after green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification observed: no file matches TP-1..TP-13.

## Deviations
Cases live in session-critic-finalizer.test.mjs, the only test file in the write scope. No existing case weakened, skipped or deleted.
