# D61 c9: sanctioned inspect and recover verbs for an abandoned generic-batch transaction lock (targeted delivery: green; Critic, Verify, PO acceptance pending)

Candidate f9d89d55c45f6b2aebc9502737f2faec2434119c. Patch `w7-d61-empty-store-recovery-verbs-c9.patch` is the CUMULATIVE `git diff --binary` of the clone against the candidate: the c11 prerequisite (critic-verify-lifecycle.mjs, critic-packet-preflight.mjs, finalizer and its test) plus this slice (5 files, +288/-13). `git apply --check` in clone2 at the candidate: exit 0 (generated after the last edit). Nothing under plugins/ was edited in the repository.

## Cause
After an aborted registration the generic batch store keeps `transaction.lock`. `inspectGenericCriticBatchRecovery` and `recoverGenericCriticBatchEmptyStore` existed in `critic-generic-batch.mjs` but no CLI verb called them, and the CGB-HELD refusal named no command.

## Real state (real code, killed child)
The test starts a CHILD node process running the real `registerGenericCriticBatch`; it parks inside the transaction right after the transaction itself wrote `owner.json` (before any index entry) and is SIGKILLed. Registration then answers CGB-HELD (text now names `inspect-batch-recovery` and `recover-batch`); inspect says `empty-store-held`; recover with the inspected digest releases (owner judged gone); admit succeeds. Live owner: CGB-RECOVERY-OWNER-LIVE.

## Previous build 692301fd9 (the consumer's lock): proved
The same killed-child holder was driven with the PREVIOUS build's critic-generic-batch.mjs (clone3), the CURRENT verbs then ran: its lock DOES carry owner.json (keys schema, platform, hostId, machineId, bootId, pidNamespace, pid, processStart, nonce, identical to the current record), inspect says `empty-store-held`, recover answers `released`. A throwaway case printed this (log green2.*, lines "D61PREV ..."); it was removed from the patch because it needs a second checkout. So the second explicit PO route was NOT implemented: not needed. A lock from a build older than the owner-record code (no owner.json) ends in CGB-RECOVERY-OWNER-UNPROVEN (pinned by the ownerless case); nothing in the evidence shows such a lock exists.

## Changes (in the patch)
- critic-generic-batch.mjs: new `HELD_LOCK_DETAIL`; the three transaction-lock CGB-HELD sites (mkdir EEXIST, in-process active transaction, `unlocked`) carry it, naming both verbs with usage.
- session-critic-finalizer.mjs: imports the two recovery functions; export `SESSION_CRITIC_BATCH_RECOVERY_REQUEST_SCHEMA`; verbs `inspect-batch-recovery --root R` (read-only) and `recover-batch --root R --request F` (request `{schema, digestSha256}`), before `release`. A partial store stays CGB-RECOVERY-PARTIAL; it needs manual inspection, nothing is deleted.
- session-critic-finalizer.test.mjs: `spawn` import; helper `abandonedRegistrationHolder(fx, moduleUrl?)`, `runBatchRecoveryVerb`, `recoveredStore`; four D61 cases.

## RED/GREEN
- RED (unchanged production, whole file): the two first D61 cases failed (missing verbs; SCF-USAGE instead of CGB-RECOVERY-OWNER-LIVE). Log red.*.
- GREEN: four D61 cases pass: killed-child recovery then admit; path after recovery (admit, finalize, consumed receipt read, export write and read back); block of an admitted packet over the recovered store; live owner / stale digest / non-empty store / ownerless lock all refused typed.
- Counts: patched clone session-critic-finalizer.test.mjs: tests 71, pass 70, fail 1 (log green3.*). Baseline clone2 at the candidate: tests 61, pass 60, fail 1 (log base.*). Failing set in both = {private task snapshot binds uppercase delivered-v3 bytes without exporting record prose} (pre-existing, identical). critic-generic-batch.test.mjs: tests 33 pass 33 fail 0 in clone and clone2. The patched file run was repeated after the last edit; the patch was generated after it.

## Path after recovery, per step
admit, finalize, consumed receipt read, export write and read-back, block: pass (cases above). Not reachable as a verb: "cleanup" of a packet has no separate finalizer verb besides `release`; the release-after-recovery combination was not added as a case.

## NOT done
Release verb over the recovered store, Verify registration (no new test file), Full Verify, independent Critic review (parent-owned batch gate), native Windows, PO acceptance. The patch contains the c11 files because it is cumulative.

## Commit message
fix(critic): give an abandoned generic-batch transaction lock sanctioned inspect and recover verbs and name them in the CGB-HELD refusal (Toolbox D61)

## Operator flow
git apply the patch (supersedes c11), `git add -u` limited to the five plugin paths, commit with --no-verify, stamp, install. Protected-path classification: none of the touched files matches TP-1 to TP-13.
