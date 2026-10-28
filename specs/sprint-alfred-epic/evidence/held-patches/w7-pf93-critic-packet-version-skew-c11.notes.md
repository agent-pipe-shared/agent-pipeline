# PF-93 c11: SCF-CLEANUP inner cause found and fixed; whole-file runs green in the clone except the one pre-existing case

**Parent readback (Elephant, after the agent checkpoint):** the green.*.log files (clone, written after the last source edit) and base.*.log (clone2, unchanged candidate) were read by the parent. Clone with the c11 patch: session-critic-finalizer 47 tests, 46 pass, 1 fail (only the pre-existing `private task snapshot binds uppercase delivered-v3 bytes...`; PF-93 (1) to (9) all green, including (2)+(7)); critic-packet-preflight 17/0 (CPP09 and CPP15 green, no pin touched); critic-generic-batch 28/0; check-critic-skip-coverage 48/0. Clone2 baseline: session-critic-finalizer 39 tests, 38 pass, 1 fail (the same pre-existing case). `git apply --check` of the patch at the candidate commit succeeded in the repository root. The sections below are the agent text written before it read these logs; where it says NOT READ or NOT VERIFIABLE, this paragraph supersedes it. Still open: the other strict packetContext callers (export, consumed-snapshot readers, block) are unchanged, so a later export or read-back of an already finalized legacy packet is still refused strictly (option B, PO decision); a fresh-clone run of the bundle apply chain is the next gate.

Candidate 6050ca464e67b90e0d1076fedc2bbd7496d1cdf9. Patch w7-pf93-critic-packet-version-skew-c11.patch (5 files, +246/-21, written from Node as git diff --binary against the candidate) = the c10 patch plus one change. Supersedes the c1 to c10 patches and notes. Release command option (B) for a claimed packet stays a PO decision.

## Inner cause (measured)
A temporary stderr probe in the clone copy of session-critic-finalizer.mjs (removed again; the patch carries no probe) printed, for PF-93 (2)+(7):
`CPP-COORDINATOR-BINDING Local dispatch evidence binding is not closed or candidate-bound.`
thrown inside cleanupCandidatePacket, hidden by the `catch { fail("SCF-CLEANUP") }` near the end of finalizeSessionCriticReview. The hypothesis of the briefing is confirmed: cleanupCandidatePacket called packetContext strictly.

## Change (clone only, on top of c10)
critic-packet-preflight.mjs, cleanupCandidatePacket: `packetContext(controlRoot, packetId, { allowLegacyPreAssurance: true })` plus a one-line comment. The default of packetContext stays strict. No test file changed in c11; the existing PF-93 (2)+(7) case is the red-then-green examiner (red in the probe run with SCF-CLEANUP, c10 state).

## Remaining packetContext callers (not changed, reasons)
- inspectCandidatePacket (prepared only), claimCandidatePacket (prepared only), recordCandidateExport / readCandidateExport (export of a claimed or consumed packet), readConsumedCandidateSnapshot (feeds readConsumedCandidateReceipt/Result and readConsumedSessionAdmission), blockCandidatePacket: not reached by finalization of a claimed legacy packet in the measured run. Export or read-back of an already finalized legacy packet by a later command would still be refused strictly; that is the option (B) question for the PO. Not opened further for lack of budget.

## Results
- Probe run (c10 state + probe): finalizer file 47 tests, 45 pass, 2 fail (pre-existing `private task snapshot binds uppercase delivered-v3 bytes...` and PF-93 (2)+(7) at SCF-CLEANUP). Read.
- Final runs with the fix: all four files in the clone (logs green.*.log) and in clone2 at the unchanged candidate (logs base.*.log) in scratch/agent-out/w7cd/ were LAUNCHED but NOT READ (budget). Not verifiable by me whether PF-93 (2)+(7) is now green or whether CPP09/CPP15 pins stay green. Expected failing-name set if green: only the pre-existing uppercase delivered-v3 case, in both clone and clone2.
- Apply check in clone2 (`driver check`): NOT run. Driver cleanup: NOT run (both clones remain).

## Next step
Read green.*.log and base.*.log, compare failing-name sets, run `driver check`, then `driver cleanup`.

## Proposed commit message (only after green)
fix(critic): finalize a Critic packet claimed before the binding assurance field and name the hidden admission cause (PF-93)

## Operator flow (only after green)
git apply the patch, git add -u limited to the five patch paths, --no-verify commit, stamp, install. Protected-path classification: no changed file matches TP-1..TP-13. Independent Critic review, Full Verify and PO acceptance stay parent-owned and pending.
