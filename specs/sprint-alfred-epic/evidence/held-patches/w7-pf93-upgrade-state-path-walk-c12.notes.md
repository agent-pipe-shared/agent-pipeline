# PF-93 upgrade state c12: path walk over the REAL old-build state (CHECKPOINT: walk done, no new refusal found, no patch produced; Critic, Verify, PO acceptance pending)

Candidate ee35f3071c5c583668214f5c37a80d3b69dd8ac4 plus the c11 patch (w7-pf93-upgrade-state-real-old-build-c11.patch, applied with git apply in a scratch clone; apply exit 0). Real old state rebuilt with the previous build (692301fd9) at a fixed scratch path with the c11 build-state driver. No production or test file was changed; there is NO c12 patch (nothing to put in it yet).

## Real state digests (printed)
receipt body = result body packetDigest = 115af2c65036... (normalized-view digest); raw digest of packet.json = 92ce86baa24c...; receiptEqualsView true, receiptEqualsRaw false.
Envelope packetDigest of state.json, claim.json, receipt.json, result.json, cleanup.json, session-admission.json = 92ce86baa24c... (RAW). Only receipt.body and result.body carry the view digest. The same holds in the c8 emulation (finalizedByPreviousBuild): envelopes raw, receipt/result body view.

## Per reader, against the REAL state (candidate clone with c11 patch)
- readConsumedCandidateResult, readConsumedCandidateReceipt: PASS.
- readConsumedCriticCourseResult (lineage compile line 424): PASS (c11 fix).
- readBoundConsumedCriticReceipt (Verify), export write and read back, lineage packetCode (shape): PASS.
- readConsumedSessionAdmission and readConsumedCourseClaimBinding (critic-verify-lifecycle.mjs 426; lineage line 428 calls it): REFUSED CPP-CLAIM-READ on the real state, PASS on the re-chained emulation (state2). Hypothesis (not proven): artifact of the old test helper rewriteAsLegacyPacket/resealReservation, which rewrites the packet after the claim was sealed so claim.priorStateDigest no longer chains to the prepared state (preflight line 893). The envelope digests are raw in both states, so the digest is not the cause. A genuine legacy packet produced by an older build end to end was NOT available, so this stays unproven.
- blockCandidatePacket: REFUSED CPP-BLOCK (terminal packet), by state, not by digest. cleanupCandidatePacket: REFUSED CPP-GIT (checkout already removed by the old finalize, cleanup.json already exists), not digest related.
- Generic batch rows (critic-generic-batch.mjs 453, 459, 576, 804): the previous build (692301fd9, lines 618 and 792) writes `packetDigest(observed.packet)` / `packetDigest(packet)` = RAW digest of the packet on disk; the current reader compares the raw digest of the packet read from disk (p.packet). Raw-only and consistent; no fix. Verified by code reading in the old clone, NOT by driving registerGenericCriticBatch with the old code (not done).
- Preflight lines 325, 452, 675, 705, 744, 806, 828, 860, 893, 904: read records whose envelope digest is raw in the real state: consistent. 730 is inside packetDigestMatches.
- Lineage line 442 sets consumedResult.packetDigest to receipt.packetDigest (view); only a shape check (core 501) reads it. Lineage references.packetSha256 is raw by design.
- Host files: critic-claude-host.mjs 142, 286, 305, 316, 324, 350, 360, 372 and codex-critic-packet-host.mjs 60, 97, 157, 208 compare digests of a prepared in-memory packet/dispatch/return of the CURRENT run; they never read a consumed receipt or result of a previous build. Not exercised.
- finalizer 115 (originGate) compares a source-return record to the query of the current finalize; 485 fixed in c11.
- critic-export-policy.mjs, portable-critic-export.mjs, verify-evidence-producer.mjs 249, critic-verify-lifecycle.mjs 114 and 269: compare receipt digests among themselves (all view in the upgrade state), consistent.

## NOT done
No RED/GREEN cases, no c12 patch, no whole-file runs of the six test files in clone/clone3 (budget checkpoint reached at ~call 32). The planned content of the patch would only be green pins (envelope raw / body view, readConsumedCourseClaimBinding accepts the upgrade state, block and cleanup refuse by state) in session-critic-finalizer.test.mjs, since no reader beyond c11 was found refusing. Not walked: a full compileRegisteredCriticReviewLineage run (needs course admission), delta round driven with old-code rows, native Windows. The open question is the CPP-CLAIM-READ hypothesis above: a real legacy state is the only proof. Independent Critic review stays a parent-owned batch gate; Verify and PO acceptance pending.

## Proposed commit message (if a pin-only patch is later produced)
fix(critic): every reader of a packet finalized by the previous build accepts its digests, proved over the real old state (PF-93)

## Operator flow
Apply diff, git add -u with a path limit, --no-verify commit, stamp, install. Protected-path classification: none of the touched files is in TP-1..TP-13.
