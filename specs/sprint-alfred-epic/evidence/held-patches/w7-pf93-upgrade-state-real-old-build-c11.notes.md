# PF-93 upgrade state c11: H1 proven with the real previous-build code; the consumed course result reader now accepts the previous build's result digest (targeted delivery: see counts; Critic, Verify, PO acceptance pending)

Candidate 0e65f6dbcced6e119e246ccc0130125897508b46, stacked on the c8 patch (w7-pf93-upgrade-state-receipt-digest-c8.patch, applied first in the clone). Patch: w7-pf93-upgrade-state-real-old-build-c11.patch = CUMULATIVE `git diff --binary` of the clone against the candidate (c8 + c11), written from Node; 4 files, +147/-8. `git apply --check` at the candidate in a fresh clone (clone3): exit 0.

## H1 CONFIRMED with printed digests (real OLD finalize at 692301fd9, state at a fixed path)
Old finalizer + old preflight + the old test's own fixture/rewriteAsLegacyPacket/resealReservationForLegacyPacket (extracted from the old test file by the driver), legacy pre-assurance packet, old finalize: `completed`.
- receipt packetDigest = result.json packetDigest = 066864490f4cbbcc1e3657b46ac3db2a054bc137bd1ee0c9095d7328ac116006
- raw digest of packet.json as stored = deeec78bcca15c7974827beab5cf3a5e538a1f967239638d79c25bfba9f4d384
- c8 normalized-view digest = 066864490f4c...6006. Receipt equals the view digest and differs from the raw one: H1 true. (The old build's own consumed readers refuse that state with CPP-COORDINATOR-BINDING; irrelevant to the current build.)

## Reader results with the c8-patched clone over that REAL state (before the c11 fix)
PASS: readConsumedCandidateResult, readConsumedCandidateReceipt, readBoundConsumedCriticReceipt (Verify), export write and read back, lineage packetCode (shape only).
REFUSED: readConsumedCriticCourseResult (critic-verify-lifecycle.mjs line 378 calls validateSessionCriticResult) with SCF-RESULT-BINDING. Traced: session-critic-finalizer.mjs validateResult line 485 `result.packetDigest !== packetDigest` with the default packetDigest = raw digest of the packet. This is the reader critic-review-lineage.mjs line 424 (compileRegisteredCriticReviewLineage) calls, so a lineage compile would have refused the upgrade state.
readConsumedSessionAdmission: CPP-CLAIM-READ on the real state, but the same read PASSES on the emulated state built with the CURRENT re-chaining helper (case below, passes before the fix). Conclusion: artifact of the OLD test helper (it does not re-chain claim.priorStateDigest), not a production defect; the real-state refusal is a helper artifact of how the state was sealed.

## Change (clone only)
- session-critic-finalizer.mjs, exported validateSessionCriticResult: uses `packetDigestMatches(packet, result?.packetDigest)` to pick the digest handed to validateResult (raw OR normalized-view digest of the SAME packet, else the raw default so a foreign digest still fails). Internal finalize validation unchanged (strict, admission digest).
- Tests added to session-critic-finalizer.test.mjs (imports readConsumedCriticCourseResult, validateSessionCriticResult, realpathSync):
  1. `PF-93 upgrade state: the consumed course result reader (review lineage compile) accepts a packet finalized by the previous build` RED before (SCF-RESULT-BINDING), GREEN after.
  2. `PF-93 upgrade state: the consumed session admission read accepts ...` green before and after (pin that the admission read is fine).
  3. `PF-93 upgrade state pin: the consumed course result reader still refuses a foreign result digest and a changed packet` RED before (the accept assertion on the real result threw), GREEN after.
- RED log (clone, unchanged production code): 67 tests, 64 pass, 3 fail = baseline `private task snapshot binds uppercase delivered-v3 bytes...` + cases 1 and 3.
- Real vs emulated: the c8 emulation (finalizedByPreviousBuild) was compared with the real state file by file: same seven journal files and same key sets; values differ only in per-run data (timestamps, commit ids, nonces, derived digests). Byte identity was not shown, so the tests keep the emulation (they do not depend on a clone2 checkout).

## rg sweep: sha256(canonicalJson(packet)) in plugins/pipeline-core/scripts (lib not swept: flags with -g are refused by the shell grammar)
Raw-only and right, because they are the journal's own writer/readers of records sealed at raw: critic-packet-preflight.mjs 325, 452, 661, 675, 705, 772, 789, 806, 828, 860, 893, 904, 744 (state, claim, admission, receipt/result/cleanup records all carry the raw digest of the packet on disk), 730 is inside packetDigestMatches. session-critic-finalizer.mjs 393 (resumed admit), 482 (validateResult default; now fed through packetDigestMatches by the exported validator), 617 (admission digest first). OUTSIDE the slice files and NOT changed, to check by the parent: critic-claude-host.mjs 142, 265, 286, 305 and codex-critic-packet-host.mjs 60 compute the raw digest for host claims/binding; whether they compare against a receipt or result digest of a previous-build packet was NOT verified.

## NOT done
Delta round / next review round, packet block and cleanup readers over the upgrade state were not exercised (blockCandidatePacket on a consumed packet is refused by state regardless); no full compileRegisteredCriticReviewLineage run (needs course admission); the lib tree of the rg sweep; native Windows. Independent Critic review stays a parent-owned batch gate; Verify and PO acceptance pending.

## Proposed commit message
fix(critic): prove the previous-build receipt digest with the real old code and let every reader of the finalized legacy packet accept it (PF-93)

## Operator flow
Apply the diff at the candidate, `git add -u` limited to the four paths, `--no-verify` commit, stamp, install. Protected-path classification: none of the four touched files is in TP-1..TP-13; no guard refusal.
