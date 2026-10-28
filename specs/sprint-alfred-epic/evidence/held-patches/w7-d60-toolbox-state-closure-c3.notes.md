# D60 c3: Toolbox state closure (case (a) and release CLI case green; reader audit and several full runs open)

Candidate 7f1451ef815990bcb228a9e42a4d0617d9302bf0. Patch: `w7-d60-toolbox-state-closure-c3.patch` (git diff --binary against the candidate, 6 files, +500/-16; contains D60 c2, PF-93 c2, the two c3 cases and the c3 production fix). Nothing under plugins/ was edited in the repository.

## Reproduced state and cause
- Registration (`register-batch`) is a separate step before admit, so the no-index-hit state cannot come from a crash inside one registerBatch run (order: registration.json, logical index, origins index via writeMember, registration-complete; generic-batch ~398-428). It needs the index entries lost afterwards, which the case reproduces by removing `generic-batches/logical` and `generic-batches/origins` after a first admit failed after the claim. Registration then raises CGB-HELD (generic-batch ~414, `retainedUnadoptedPacket` ~373 scans the control root).
- The c2 resume found the packet by directory but read the reservation through `readReservedGenericCriticBatchAdmission` -> `member` -> `registration` -> `boundIndex` (~336, ~356, ~362, ~568), which needs the index: second admit failed `CGB-MEMBER`. So c2 did not fix the reproduced state.

## Fix (STEP 2)
Chosen: re-publish the index from the retained registration (not "read without boundIndex"), because every later reader (member, retainedReservation, consumedParent paths) goes through `boundIndex`; one repair heals them all and leaves the readers strict.
- `critic-generic-batch.mjs`: new exported `republishGenericCriticBatchIndex({controlRoot, batchRef})` (inside the store transaction: reads registration.json, checks shape, registrationSha256, fingerprint, registration-complete, `ensureStore`, then `publishIndex` for each logical id and the origins target). `publishIndex` raises CGB-CONFLICT if another batch owns an entry, so a review unit is never taken from another batch.
- `session-critic-finalizer.mjs`: imports it from `../lib/critic-generic-batch.mjs` (the preflight module does not re-export it; the first attempt failed to load for that reason) and calls it in `resumeHeldGenericPacket` after the same-task, same-candidate checks; any failure returns null so the normal path (and CGB-HELD for a different task or candidate) is unchanged.
- Different-task/candidate refusal: unchanged code path (the resume returns null before the new call); no new case pins it beyond the c2 case D60 (b).

## Cases and results
- RED (clone2 = candidate plus only the new test file, pattern `D60 c3`): 2 fail. (a) failed at the CGB-HELD message assertion (unpatched message does not name the packet); (b) failed `SCF-USAGE` (no release verb).
- RED of (a) at the c3-draft base (before the fix): `CGB-MEMBER` from admit.
- GREEN, patched clone, whole `session-critic-finalizer.test.mjs`: failing set = {`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`} only. D60 c3 (a) and (b) green. Counts line not captured in the printed tail.
- Baseline clone2 whole finalizer file at the candidate: failing set = {`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`} (identical; pre-existing).
- Other suites in the patched clone, before the final `ensureStore` line was added to the new function (that line only runs inside the new function): generic-batch tests 33 pass 33 fail 0; preflight tests 17 pass 17 fail 0; release tests 5 pass 5 fail 0. NOT re-run after the last edit.
- Apply check: `git apply --check` in clone2 at the candidate, exit 0.

## STEP 4 reader audit
NOT done (budget). Open: `plugins/pipeline-core/lib/capability-inventory` consumed-packet reader (~136) and `consumedParent` in generic-batch (~455-463: `readConsumedSessionAdmission` in a try/catch mapping any failure to CGB-HELD, then packet digest, claim, preflight and course bindings compared to the reservation; whether it re-validates the packet form itself was not examined).

## Not done
Native Windows, Full Verify, independent Critic (parent-owned batch gate), PO acceptance, Verify-suite registration of `critic-packet-release.test.mjs` (`harness/verify-suites.json` and case-completion configs are not mine). No dedicated case for the different-candidate CGB-HELD refusal after the fix.

## Proposed commit message
`fix(critic): reproduce the exact CGB-HELD state of a held packet and test the release verb end to end (Toolbox D60)`

## Operator flow
`git apply` the patch (it replaces the c2 patch); `git add -u` limited to the six paths plus `git add` of the two new release files; commit with `--no-verify`; stamp; install. Protected-path classification: none of the six files matches TP-1 to TP-13. Independent Critic review stays a parent-owned batch gate.
