# D60 c3: Toolbox state closure (CHECKPOINT: one case RED, a production fix is still needed)

Candidate 7f1451ef815990bcb228a9e42a4d0617d9302bf0. Patch: `w7-d60-toolbox-state-closure-c3.patch` (git diff --binary against the candidate, 6 files, +475/-16). It contains the D60 c2 patch (which contains the PF-93 c2 changes) plus two new cases in `session-critic-finalizer.test.mjs`. Nothing under plugins/ was edited in the repository. No production edit was made in this slice.

## Re-verified recon claims
- `resumeHeldGenericPacket` (finalizer ~344) is called first in admit; it finds the packet by `options.packetId` (directory exists check), not by scanning the control root.
- CGB-HELD is raised in `registerBatch` (generic-batch ~414) only when no logical/origins index hit exists and `retainedUnadoptedPacket` (~373) finds a 32-hex packet with the same taskId or the same target.
- Registration is a SEPARATE step (`register-batch` CLI) before admit. A packet can only exist for a batch that was fully registered, so the no-index-hit state cannot come from a crash inside one registerBatch run (order: registration.json, logical index, origins index via writeMember, registration-complete). It needs the index entries to be lost afterwards (store repair or removal) or a second registration with a different target and different logical ids for the same task. I reproduced it by removing `generic-batches/logical` and `generic-batches/origins` after a first admit failed after the claim.

## Cases added (finalizer test file)
- `D60 c3 (a)`: claimed packet of T/C (first admit failed after the claim), index entries removed. Asserts registration is refused CGB-HELD naming the packet, then that the second admit of the same request resumes.
- `D60 c3 (b)`: release verb through the real CLI (spawned script): receipt `released`, one audit record, packet directory moved, a following registration of the same candidate no longer meets CGB-HELD, second release is `already-released` with no second audit record.

## Results
- RED (clone2 = candidate with only the new test file, name pattern `D60 c3`): 2 fail. (a) fails at the CGB-HELD message assertion (unpatched message does not name the packet: GenericCriticBatchError thrown at registerBatch, code CGB-HELD; the second admit was not reached). (b) fails with `SCF-USAGE` (no release verb). Log: scratch/agent-out/w7ce/red.log (deleted at cleanup).
- GREEN in the patched clone, whole finalizer file: failing set = {`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose` (pre-existing), `D60 c3 (a)`}. `D60 c3 (b)` is GREEN. Counts line not captured in the printed tail; the failing-name set above is machine-extracted from the log (scratch/agent-out/w7ce/green.session-critic-finalizer.test.mjs.log).
- **D60 c3 (a) is RED in the patched clone with `CGB-MEMBER`**: the c2 resume path reaches `readReservedGenericCriticBatchAdmission` -> `retainedReservation` -> `member` -> `registration` -> `boundIndex` (generic-batch ~336, ~356, ~362, ~568, ~601), which requires the index entries. So the c2 pre-preflight resume does NOT resume a packet whose index is gone: the reproduced state is not fixed by c2. This is the STEP 2 finding.
- Baseline clone2 whole-file run and the other three focused suites (generic-batch, preflight, release) were NOT run in this slice (budget). Prior c2 numbers: release 5/5, generic-batch 33/33, preflight 17/17.
- Apply check: `git apply --check` in clone2 at the candidate, exit 0.

## Step 4 reader audit
NOT done (budget). Open: `plugins/pipeline-core/lib/capability-inventory` consumed-packet reader (~136) and `critic-generic-batch.mjs` `consumedParent` (455: `readConsumedSessionAdmission` inside try/catch mapping any failure to CGB-HELD, then packetDigest/claim/preflight bindings compared against the reservation; whether it re-validates the packet form itself was not examined).

## Next step (STEP 2 fix, needs production edit in the six files)
Make the resume independent of the index: in `resumeHeldGenericPacket` for a same-task, same-candidate packet whose index is missing, rebuild the reservation context by reading the registration directory named by `options.genericBatchRef` without `boundIndex`, or re-publish the logical/origins index entries from the retained registration (generic-batch `publishIndex`) before reading the reservation. Keep the different-task/candidate refusal with CGB-HELD naming packet and release verb. Case (a) is the acceptance test.

## Not done
Native Windows, Full Verify, independent Critic (parent-owned batch gate), PO acceptance, Verify-suite registration of `critic-packet-release.test.mjs` (`harness/verify-suites.json`, case-completion configs are not mine).

## Proposed commit message (only once (a) is green)
`fix(critic): reproduce the exact CGB-HELD state of a held packet and test the release verb end to end (Toolbox D60)`

## Operator flow
`git apply` the patch (instead of the c2 patch, it includes it); `git add -u` limited to the six paths plus `git add` of the two new release files; commit with `--no-verify`; stamp; install. Protected-path classification: none of the six files matches TP-1 to TP-13.
