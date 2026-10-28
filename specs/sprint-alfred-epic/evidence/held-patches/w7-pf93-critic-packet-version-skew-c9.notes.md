# PF-93 c9: narrowed draft run; one end-to-end case still red (CHECKPOINT, NOT RELEASABLE)

Candidate 159e71d0a7510e14e04802fa811dcfe776b17ece. Patch w7-pf93-critic-packet-version-skew-c9.patch (5 files, +235/-18) is the c8 patch plus: critic-generic-batch.mjs actualPacket passes `{ allowLegacyPreAssurance: true }` (second argument) when reading a CLAIMED packet, and two new cases in session-critic-finalizer.test.mjs. Supersedes the c1 to c8 patches and notes. The c1 option (B) (a release command for a claimed packet) stays a PO decision in the c1 notes.

## Results (clone = c8 patch applied; clone2 = unchanged candidate)
- Baseline (clone2): finalizer fails 1 (pre-existing "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose"); preflight 17/0; generic-batch 28/0; skip-coverage 48/0.
- c8 patch unchanged (clone, first run): preflight 17/0 (CPP09 and CPP15 green again: the narrowing is correct, no preflight pin touched); generic-batch 28/0; skip-coverage 48/0; finalizer fails 2: the pre-existing one plus PF-93 (2)+(7), refused with CGB-PHYSICAL.
- Cause of (2)+(7): critic-generic-batch.mjs actualPacket (line 500, claimed=true path used by readReservedAdmission/reserveAdmission) called inspectClaimedCandidatePacket on the strict default, so the legacy form was refused and surfaced as CGB-PHYSICAL (called from session-critic-finalizer.mjs line 528). Draft defect, not a test-fixture defect.
- With the actualPacket fix + new cases (clone, last whole run): preflight 17/0, generic-batch 28/0, skip-coverage 48/0; finalizer fails 3 = the pre-existing one, PF-93 (9) (my test expectation, fixed after the run, see below), and PF-93 (2)+(7), which now gets past CGB-PHYSICAL and fails at session-critic-finalizer.mjs line 544 with SCF-PRELAUNCH-BINDING.
- New case PF-93 (8) (strict claimed-packet read refuses the legacy form with CPP-COORDINATOR-BINDING): green. Both new cases were NOT seen RED against the pre-c8 code: the c8 narrowing already exists in the clone, so (8) is green by construction.
- PF-93 (9) failed on my wrong expectation: the plain inspectClaimedCandidatePacket returns the STORED form (no assurance key, old snapshotId); only inspectClaimedSessionAdmission re-reads it with assurance null. The test was corrected to expect the stored form (`{...body, snapshotId: sha256Canonical(body)}`) and the drift loop (extra key, wrong snapshotId, assurance null with old digest, attested with old digest) is unchanged. The corrected case was NOT re-run (budget).
- Apply check of the final patch in clone2 at the candidate: see the report (run last; exit code in the report).

## NOT done
- (2)+(7) still red at line 544 SCF-PRELAUNCH-BINDING; failing clause not identified. A per-clause probe was written and removed in the clone but never executed. Hypotheses to check first: (a) the clause comparing admitted.admission.courseSourceSha256 against genericCourseFor(reservation): the reservation was re-sealed from the raw stored packet digest, but the finalizer works on the normalized view from inspectClaimedSessionAdmission (line 519 also compares the current local binding, which carries assurance, against the stored legacy binding: that comparison would fail with SCF-LOCAL-DISPATCH-EVIDENCE, not 544, so it is not the first suspect); (b) `prepared.packetDigest = sha256(canonicalJson(packet))` uses the normalized packet, which differs from the stored digest. The probe lines: print the 11 clause booleans of lines 531-544 before the `if`.
- Corrected (9) and the final whole-file finalizer run were not re-run after the last test edit.
- Independent Critic review, Full Verify and PO acceptance remain parent-owned and pending.

## Proposed commit message (only after green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the slice paths, --no-verify commit, stamp, install. Protected-path classification: no changed file matches TP-1..TP-13.
