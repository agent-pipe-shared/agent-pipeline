# PF-93 c10: clause found, fixture and mutation paths fixed; final run NOT read (CHECKPOINT, NOT RELEASABLE)

Candidate a7d000729d5053aa3d636267c1a2620c43a8a3ce. Patch w7-pf93-critic-packet-version-skew-c10.patch (5 files, +244/-20) = c9 patch plus the changes below. Supersedes the c1 to c9 patches and notes. The c1 option (B) (a release command for a claimed packet) stays a PO decision.

## Clause found (probe, clone, whole finalizer file)
Only clause false in session-critic-finalizer.mjs lines 531-544 for case (2)+(7): `admitted.admission.courseSourceSha256 !== expectedCourse.courseSourceSha256` (c2). Candidate/base/commit/tree clauses were not probed: lines 506-508 test the same and passed (failure was at 544). The c9 hypothesis (b), prepared.packetDigest, sits at line 545 after the fail, so it cannot cause 544.

## Which side: the test fixture was inconsistent
resealReservationForLegacyPacket re-sealed the reservation sourceSha256 (embeds the legacy packet digest) but left session-admission.json courseSourceSha256 at the pre-rewrite value. The old creator derived both from the same legacy digest. Fix (test file only): the helper also rewrites session-admission.json courseSourceSha256 = reservation.sourceSha256. No assertion weakened, no production clause loosened.

## Next failure, then a production fix (draft side)
After the fixture fix, (2)+(7) failed at finalizer line 554 recordCandidateResult -> packetContext strict -> CPP-COORDINATOR-BINDING. packetContext returns the raw packet, so state/record digests stay consistent. Change in critic-packet-preflight.mjs: recordCandidateResult and consumeCandidatePacket call packetContext with `{ allowLegacyPreAssurance: true }`. This was applied after the last read log; its run was started but NOT read.

## Results read
- Clone2 baseline finalizer: 39 tests, 38 pass, 1 fail (pre-existing: private task snapshot binds uppercase delivered-v3 bytes without exporting record prose).
- Clone after fixture fix only: 47 tests, 45 pass, 2 fail = the pre-existing one + PF-93 (2)+(7). PF-93 (9) green now. Preflight, generic-batch, skip-coverage logs (green.*.log) were launched but not read before the preflight edit.
- Final run of all four files after the preflight edit: logs final.*.log in the scratch clone dir, NOT read (budget). Not verifiable by me.

## NOT done
- Reading the final logs; verifying CPP09/CPP15 pins still green after the preflight change; the apply check in clone2 (`driver check`); driver cleanup (both clones remain under scratch/agent-out/w7cd/).
- RED-first for the new cases not re-established (they existed in c9; (8) green by construction).
- Independent Critic review, Full Verify, PO acceptance: parent-owned, pending.

## Proposed commit message (only after green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification: no changed file matches TP-1..TP-13.
