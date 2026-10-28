# D60 c4: Toolbox path verification (targeted delivery: green; Critic, Verify, PO acceptance pending)

Candidate c826e485f3353d540891c8ee3e63cb10245ffceb. Patch `w7-d60-toolbox-path-verification-c4.patch` is `git diff --binary` of the clone against the candidate (6 files, +602/-16): the c3 prereq (PF-93 readers c2, D60 c2, c3) plus this slice, generated after the last edit. Nothing under plugins/ was edited in the repository; the new cases and the one production line travel only in the patch.

## STEP 1 reader audit
- The "capability inventory ~136" file does not exist at the candidate (find in lib/: only a pin test and a reader-inputs json). The lib files that call the consumed-packet readers are critic-generic-batch.mjs, critic-verify-lifecycle.mjs and critic-review-lineage.mjs (parent measurement, confirmed by rg here).
- `consumedParent` (generic-batch 450-463): calls `readConsumedSessionAdmission` in a try/catch mapped to CGB-HELD, then compares packet digest, claim, preflight and course digests with the reservation. `readConsumedSessionAdmission` (critic-packet-preflight.mjs 862-) itself re-validates the packet form: claim record, session-admission schema and digests, double read-back, legacy pre-assurance allowed. It never reads the batch index.
- critic-verify-lifecycle.mjs (lines 22, 370, 438) and critic-review-lineage.mjs (lines 20, 423-428) read consumed packets only through `readConsumedCandidateResult` / `readConsumedCandidateReceipt` / `readConsumedSessionAdmission` (preflight), which re-validate the form; the lineage adds expected candidate/range bindings. Neither reads the generic batch index, so a republished index cannot influence them.
- Readers that do go through `boundIndex` (`registration` 343, `member` 360, readReservedGenericCriticBatchAdmission): the republished index is built only from a retained registration whose sha, fingerprint and registration-complete marker validate; `publishIndex` raises CGB-CONFLICT for any entry owned by another batch (never overwritten, now asserted); `member` still requires its member-complete marker (CGB-HELD), which republish does not create; a registration of another declared scope is compared by `registerBatch` (CGB-CONFLICT) and republish publishes only that registration's own ids. No case was found where a republished index makes a later reader accept something it should refuse.

## Cases (clone; RED run = pattern D60 against c3 production, counts tests 8 / pass 7 / fail 1)
- D60 c4 (a) held packet of a DIFFERENT candidate: registration refused CGB-HELD naming the packet id and "release"; admit of the other candidate throws. No RED: c3 behaves so already; the case pins it.
- D60 c4 (c) republish conflict: RED (second admit surfaced a plain generic-batch error from the preflight path, not CGB-CONFLICT). Fix: `resumeHeldGenericPacket` in session-critic-finalizer.mjs rethrows an error with code CGB-CONFLICT from `republishGenericCriticBatchIndex`. GREEN after; the foreign index entry is asserted byte-unchanged.
- D60 path (first admit fails after the claim, index lost, second admit resumes, finalize, consumed receipt read, consumed session admission read (the lineage reader input), export write, export read back; every step named via e2eStep): GREEN (no RED, c3 sufficed).
- D60 path release (held packet blocks another candidate with CGB-HELD, released through the real release CLI, then the admitted candidate's next admit succeeds): GREEN (no RED).
- D60 c4 (b) different task, same target: NOT built. A target shared across tasks exists only for signed-quality-import targets; an authored-delivery target embeds the task id, so a different task is never refused (retainedUnadoptedPacket matches taskId or the exact target). The fixture would need a signed import anchor; dropped per the coordinator's hint.
- critic-review-lineage.test.mjs: no case added; the lineage reader does not touch the batch index (audit above).

## Counts and failing-name sets (logs in scratch/agent-out/w7ce/, driver run)
- Patched clone, session-critic-finalizer.test.mjs: tests 61, pass 60, fail 1. Failing set = {`private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`}.
- Baseline clone2 at the candidate (no prereq), same file: tests 47, pass 46, fail 1. Failing set = the same single name (pre-existing, identical). Difference of 14 tests = c3 prereq cases plus the new ones.
- Patched clone: critic-generic-batch.test.mjs tests 33 pass 33 fail 0; critic-packet-preflight.test.mjs tests 17 pass 17 fail 0; critic-packet-release.test.mjs tests 5 pass 5 fail 0; critic-review-lineage.test.mjs tests 1 pass 1 fail 0 (inner 14/14 checks); check-critic-skip-coverage.test.mjs tests 48 pass 48 fail 0.
- Apply check: `git apply --check` of the patch in clone2 at the candidate, exit 0.
- The finalizer, generic-batch, preflight and release runs started after the CGB-CONFLICT edit and after the final test edit; the patch was generated after both.

## NOT done
Native Windows, Full Verify, independent Critic review (parent-owned batch gate), PO acceptance, case (b), a lineage-test case. Verify-suite registration: `critic-packet-release.test.mjs` needs registration in harness/verify-suites.json (TP-13 protected) and the case-completion configs; not mine.

## Proposed commit message
test(critic): verify the whole Toolbox held-packet path and the refusal cases against the final D60 patch

## Operator flow
git apply the patch (it supersedes the c3 patch), git add -u limited to the six patch paths plus git add of the two new release files, commit with --no-verify, stamp, install. Protected-path classification: none of the six files matches TP-1 to TP-13.
