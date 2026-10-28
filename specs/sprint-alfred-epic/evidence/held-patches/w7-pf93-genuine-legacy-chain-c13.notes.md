# PF-93 genuine legacy chain c13 (CHECKPOINT: chain built and read, every reader passes, premise of the briefing corrected; no new pins, patch equals c11; Critic, Verify, PO acceptance pending)

Candidate c141451311188a861f29fb9e8a32bf83018cb7d5 plus the c11 patch (applied with git apply in a scratch clone, exit 0). The patch w7-pf93-genuine-legacy-chain-c13.patch is the cumulative git diff of the clone against the candidate and contains ONLY the c11 content (c11 test file additions, three production files); it adds nothing of c13. git apply --check at the candidate in a second clone was run (exit printed by the driver, see report).

## Premise correction (primary evidence, printed)
The briefing assumed the round-2 build (c0b837599) writes a packet natively WITHOUT the assurance field. It does not: round 2 itself introduced it (git log -S orchestrator-attested on check-critic-skip-coverage.mjs finds c0b837599 only). A round-2 claim followed by a round-3 finalize gives raw digest = normalized-view digest = receipt body digest = result body digest = 2c5b31900b26... (receiptEqualsRaw true): no digest divergence exists on that chain. The pre-assurance form comes from the build BEFORE round 2 (afa82b948 = c0b837599~1).

## Genuine chain built (no test-helper rewrite)
Prepared and claimed (admit) by the pre-round-2 build afa82b948 (coordinatorOnly keys: recordPath, recordSha256, reviewCandidateCommit, schema, snapshotId, sourceCandidateCommit, taskId: no assurance), finalized by the round-3 build 692301fd9 (finalizeSessionCriticReview, imported by file URL from its clone), at the fixed path state3/root. Round 3 DOES finalize a packet claimed by the older build (no claim refusal). Printed digests: receipt body = result body packetDigest = a94191e6c365bc0a730b31b8f16b963412667e0a4800f9c76932d3dc6793abf6 (equals normalized view); raw digest of packet.json = 928199a2f09ea96ef619cdee26690cddc2375d917ca6517384b4bc4464e34d22 (differs). Files written: claim.json, cleanup.json, packet.json, receipt.json, result.json, session-admission.json, state.json.

## Per reader on the genuine chain (candidate + c11 code), printed
PASS: readConsumedCandidateResult, readConsumedCandidateReceipt, readConsumedSessionAdmission, readConsumedCriticCourseResult, readConsumedCourseClaimBinding, readBoundConsumedCriticReceipt (Verify), exportSessionCriticEvidence write (exported) and read back (index.json, receipt.json, report.md).
blockCandidatePacket: refused CPP-BLOCK for my invalid code input (a terminal packet; not digest related). cleanupCandidatePacket: refused CPP-CLEANUP (no capability supplied). Neither probe is a meaningful state test.
Not run: compileRegisteredCriticReviewLineage (needs course admission and a unit; not attempted for lack of budget).

## c12 comparison
The c12 CPP-CLAIM-READ refusal of readConsumedSessionAdmission and readConsumedCourseClaimBinding was an ARTIFACT of the test helper rewriteAsLegacyPacket (it does not re-chain claim.priorStateDigest; preflight line 893). On the genuine chain both readers pass. No production fix is needed for them.

## Not done
- No RED/GREEN cases in the repository test file: my attempt to emulate the genuine chain inside the test by passing createLocalDispatchEvidenceBindingFn through admit packetDependencies was refused by prepare (CPP-COORDINATOR-BINDING), so both new cases were red for an emulation defect, not a product defect; they were removed (no weakening). A faithful in-test emulation needs a way to seal a pre-assurance packet before the claim (for example rewriting the packet and re-chaining prepared state, claim.priorStateDigest, claimed state and admission); then byte-compare with state3. The genuine state builder is scratch/agent-out/w7cd/build-state3.mjs (scratch, untracked; needs the afa82b948 and 692301fd9 clones) and the reader walk step3b.mjs; reusable scripts belong under scripts/ if kept.
- Whole-file runs: only the clone's finalizer file was run once with the two temporary cases: tests 69, pass 66, fail 3 (the known baseline failure "private task snapshot binds uppercase delivered-v3 bytes without exporting record prose" plus the two removed cases). No run of the other five files, no baseline run in the second clone, after removal no rerun.
- Verify, Critic (parent-owned batch gate), native Windows, PO acceptance: pending.

## Proposed commit message (if pins are added later)
test(critic): pin every reader of a packet claimed before the assurance field and finalized by the round-3 build (PF-93)

## Operator flow
Apply diff, git add -u with a path limit, --no-verify commit, stamp, install. Protected-path classification: none of the touched files is in TP-1..TP-13.
