# PF-93 readers c2: legacy consumed packet, end to end (targeted delivery: green; Critic, Verify, PO acceptance pending)

Candidate d9f8a4a34d0bec75145a41e8e1cf545cfdd10350. Patch w7-pf93-consumed-packet-readers-c2.patch (16136 bytes, from Node, `git diff --binary` of the clone against the candidate) = prereq patch (critic-packet-preflight.mjs, +11/-6) + this slice (session-critic-finalizer.mjs, session-critic-finalizer.test.mjs). `git apply --check` in clone2 at the candidate (no prereq): exit 0.

## Decisions for (a) and (c), with evidence
- (c) consumed session admission read: FIXTURE GAP. readConsumedSessionAdmission recomputes the prepared state record over the packet digest and requires claim.priorStateDigest to equal its hash; rewriteAsLegacyPacket changed the packet digest but kept the stale claim.priorStateDigest. Fix: the test helper now re-chains claim.priorStateDigest and state.priorStateDigest to the prepared record of the rewritten packet (as an old creator would have sealed it).
- (a) export after finalization: PRODUCTION GAP in session-critic-finalizer.mjs (one of the eight slice files). Run s1 showed SCF-EXPORT-UNCONSUMED at the digest check of exportSessionCriticEvidence. Cause: the finalizer digested the NORMALIZED view returned by inspectClaimedSessionAdmission (assurance null), so receipt.packetDigest != the digest of the raw on-disk packet that every consumed-packet reader recomputes. Fix: `prepared.packetDigest` takes `admitted.admission.packetDigest` (verified against the raw packet by the preflight; falls back to the old computation), and validateResult takes the digest as an optional third parameter (default unchanged). For non-legacy packets raw and normalized views are identical, so behaviour does not change.

## e2e test
`PF-93 e2e a pre-assurance packet survives the whole lifecycle, and a blocked one reads back`: claimed legacy, claimed session admission read, finalize, consumed receipt read, consumed result read, consumed session admission read, export write, export read back, then a second leg (own fixture: a registered generic batch stops after its first pass, CGB-PASS-STOPS) claim legacy, block, read state back. Every step names itself in its failure message. First run RED at the blocked leg only because of the shared fixture (my test defect, fixed by the second fixture; no assertion weakened).

## Reader audit (by file and line)
- critic-review-lineage.mjs line 20 import / 423: only calls the preflight readConsumedCandidateResult; no own form check: covered.
- critic-verify-lifecycle.mjs 22/59-68/134/370/438: only the preflight readers; line 68 recomputes the raw packet digest and compares it to the receipt digest, so it had the same mismatch as (a) and is fixed by the finalizer change; no edit needed in that file.
- critic-claude-host.mjs 245/318/379 and codex-critic-packet-host.mjs 98/188: work on the freshly prepared, claimed strict packet (prepare to claim), not on a legacy consumed one; they recompute raw digests; no change. Capability inventory 136 and generic batch 455 (readConsumedSessionAdmission): not opened this run; they call the preflight readers per the recon note, unverified by me.

## Results (logs in scratch/agent-out/w7cd, read)
- RED (clone with prereq, before fixes), log s1: 52 tests, 49 pass, 3 fail = uppercase delivered-v3 (pre-existing), (a), (c).
- GREEN, log i (final state): finalizer file 53 tests, 52 pass, 1 fail = only `private task snapshot binds uppercase delivered-v3 bytes without exporting record prose`. (a), (b), (c), (d), (e) and the e2e case pass.
- Baseline clone2 (no prereq, no slice), log base: 47 tests, 46 pass, 1 fail = the same uppercase delivered-v3 case. Failing-name sets identical apart from the new cases.
- Clone, other suites (log h, before the test-only e2e fix, no source change since): critic-packet-preflight 17/17 (CPP09 and CPP15 green), critic-generic-batch 33/33, check-critic-skip-coverage 48/48, critic-review-lineage 14/14. clone2 was not run for these four files.

## NOT done
Capability inventory and generic batch 455 readers not opened; other four suites not run in clone2; clones remain under scratch/agent-out/w7cd (cleanup not run). Release command is slice D60; independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message
fix(critic): read a consumed legacy Critic packet back so export, lineage and block work after finalization (PF-93)

## Operator flow
Apply the diff, `git add -u` with a path limit (3 files), `--no-verify` commit, stamp, install. Protected-path classification: none of the touched files is in TP-1..TP-13; no guard refusal occurred.
