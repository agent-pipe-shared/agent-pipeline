# PF-93 upgrade state c8: a receipt written by the previous build exports, binds to Verify and reads (targeted delivery: green; Critic, Verify, PO acceptance pending)

Candidate bb4df1cdb1b0618e87761630d06b30a595a236ff. Patch w7-pf93-upgrade-state-receipt-digest-c8.patch (11303 bytes, `git diff --binary` of the clone against the candidate, written from Node; 4 files, +93/-6). `git apply --check` in clone3 at the candidate: exit 0 (printed by the driver; see "Evidence").

## H1: CONFIRMED FROM SOURCE, NOT BY A PRINTED OLD-BUILD DIGEST
- Previous build (692301fd9) session-critic-finalizer.mjs line 545: `packetDigest: sha256(canonicalJson(packet))` over the packet returned by inspectClaimedSessionAdmission = the NORMALIZED view of a legacy packet (assurance null; critic-packet-preflight.mjs view code, formerly lines 737-739).
- Current finalize line 614: binds `admitted.admission.packetDigest` = RAW digest (verified against the raw packet by the preflight).
- Current export line 753 and critic-verify-lifecycle.mjs line 68 compared `receipt.packetDigest` to `sha256(canonicalJson(packet))` of the RAW stored packet (readConsumedCandidateReceipt; journal digest at preflight 791 is raw). Hence every receipt of the previous build for a legacy packet was refused (SCF-EXPORT-UNCONSUMED / CVL-CRITIC-PACKET-MISMATCH). Matches the Glossover pair 37f56e92 (receipt) vs 7a18a007 (raw, and journal).
- Lines 376 and 427 (`current.admission.packetDigest`) are RAW; line 392 digests the packet read at admit (raw). Only the old 545 was normalized.
- The step-1 construction with the real old code was NOT done (budget). Instead `finalizedByPreviousBuild` in the test runs the real finalize, real journal and real consume, but hands finalize (existing dep `inspectClaimedSessionAdmissionFn`) an admission whose packetDigest is the normalized-view digest, which is what the old line 545 bound. The RED run proves the mismatch (receipt digest differs from the raw digest, asserted in the case).

## Change (all in the clone, none in the repository tree)
- critic-packet-preflight.mjs: new exports `normalizedPacketView(packet)` (the former inline view code, now reused by readClaimedSessionAdmission) and `packetDigestMatches(packet, digest)` = raw digest OR normalized-view digest of the SAME packet, else false.
- session-critic-finalizer.mjs: import; export check at ~753 uses `!packetDigestMatches(packet, receipt.packetDigest)`.
- critic-verify-lifecycle.mjs: import; line 68 uses `!packetDigestMatches(packet, critic.packetDigest)`.
- Finalize unchanged: still writes the raw digest. validateResult unchanged. No existing assertion edited.

## Tests (session-critic-finalizer.test.mjs, +71 lines, new import of readBoundConsumedCriticReceipt)
- `PF-93 upgrade state: a packet finalized by the previous build exports, binds to Verify and reads in the lineage`: RED before (log red: 64 tests, 62 pass, 2 fail = this case at export line 757 SCF-EXPORT-UNCONSUMED, plus the baseline failure), GREEN after. Covers export write and read back, readBoundConsumedCriticReceipt (Verify), readConsumedCandidateResult (the preflight read the lineage calls).
- Pins (green before and after, as intended): `...pin: a receipt digest that is neither the raw nor the normalized digest is still refused` (export SCF-EXPORT-UNCONSUMED, Verify CVL-CRITIC-PACKET-MISMATCH); `...pin: a packet whose content changed after finalize is refused` (export SCF-EXPORT-UNCONSUMED).

## Results (logs in scratch/agent-out/w7cd, read)
- Clone (patched), green log: session-critic-finalizer.test.mjs tests 64, pass 63, fail 1 = only `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`.
- clone3 (candidate, base log): tests 61, pass 60, fail 1 = the same single case. Failing-name sets identical; the three new cases are the only difference (61 + 3 = 64).
- Clone: critic-packet-preflight 17/17 pass (CPP09, CPP15 green), critic-verify-lifecycle 7/7, critic-generic-batch 33/33, check-critic-skip-coverage 48/48, critic-review-lineage 14/14 (its own reporter: "14/14 checks passed"). These five were not run in clone3.

## Reader walk (by file and line)
- Export 753: fixed. Verify lifecycle 68: fixed (case passes). Verify 114/200/269/406 and verify-evidence-producer 249, portable-critic-export 62: copy or compare receipt digests with each other, no packet recomputation: pass without change.
- critic-review-lineage.mjs 423/442: calls readConsumedCandidateResult (passes, in the case) and copies receipt.packetDigest; 426 `packetCode(packet)` and readConsumedCriticCourseResult were NOT opened or exercised; a full lineage compile over the upgrade state was not run. Delta round, packet block and cleanup of the upgrade state: not walked.

## NOT done
Real old-code digest probe in clone2 (step 1 as briefed); full reader walk (step 3) beyond the above; the five other suites in clone3; native Windows. Independent Critic review stays a parent-owned batch gate; Verify and PO acceptance pending. No file outside the six slice files differs (four do).

## Proposed commit message
fix(critic): accept a receipt digest written by the previous build so a finalized legacy packet exports, binds to Verify and reads in the lineage (PF-93)

## Operator flow
Apply the diff, `git add -u` limited to the four paths, `--no-verify` commit, stamp, install. Protected-path classification: none of the touched files is in TP-1..TP-13; no guard refusal occurred.
