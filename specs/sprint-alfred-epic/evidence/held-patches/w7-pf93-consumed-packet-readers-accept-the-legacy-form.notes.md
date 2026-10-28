# PF-93 follow-up: consumed legacy packet readers (CHECKPOINT: fix applied, two cases still red)

Candidate 7787d504e9586a8a9c44182c338326ca44094420. Patch w7-pf93-consumed-packet-readers-accept-the-legacy-form.patch (2 files, +82/-6, from Node); `git apply --check` in clone2 at the candidate: exit 0.

## Change
critic-packet-preflight.mjs: `{ allowLegacyPreAssurance: true }` passed to packetContext in recordCandidateExport, readCandidateExport, readConsumedCandidateSnapshot (feeds receipt/result reads), blockCandidatePacket, readConsumedSessionAdmission (second call). Strict by design: inspectCandidatePacket, claimCandidatePacket (prepared only), publishClaimedSessionAdmission (runs at admission, before any legacy form can exist on disk; keep the strict write), prepare, and the defaults of packetContext and normalizeCoordinatorOnly.

## Readers outside the preflight
critic-review-lineage.mjs 20, 423 (readConsumedCandidateResult, delta round); critic-verify-lifecycle.mjs 22, 59, 134, 370, 438 (receipt, result, session admission: Verify binding); critic-generic-batch.mjs 455 (readConsumedSessionAdmission); session-critic-finalizer.mjs 677 (export verb, receipt read); critic-claude-host.mjs 245, 318, 379 and codex-critic-packet-host.mjs 98, 188 (record/read export); harness/scripts/check-product-capability-inventory.mjs 136 (receipt read). None re-validates the packet form itself; all route through the preflight fix. check-critic-skip-coverage.mjs has no caller.

## Results (logs in scratch/agent-out/w7cd, read)
- RED (clone, before the fix, three cases): 50 tests, 46 pass, 4 fail = uppercase delivered-v3 (pre-existing) + (a) export, (b) receipt/result, (c) admission.
- Cases (d) block and (e) export write were added AFTER the production edit (deviation from test-first for these two; no RED run against the unchanged code).
- GREEN, clone, finalizer file: red set remaining = uppercase delivered-v3 (pre-existing), (a) export, (c) session admission read. (b), (d), (e) pass. (c) fails with CPP-CLAIM-READ "Consumed journal claim binding differs" at readConsumedSessionAdmission (preflight line ~885): the test fixture rewriteAsLegacyPacket does not re-seal claim.priorStateDigest, so this is likely a fixture gap, not a production defect (unconfirmed). (a): cause not read (budget).
- Clone, other suites: critic-packet-preflight 17/17 (CPP09, CPP15 green), critic-generic-batch 33/33, check-critic-skip-coverage 48/48.
- Baseline clone2 (unchanged): only uppercase delivered-v3 fails.

## NOT done
Cause of (a) and decision on (c) (re-seal the fixture claim.priorStateDigest or confirm a production gap); clean finalizer run; driver cleanup (clones remain). Critic, Full Verify, PO acceptance stay parent-owned.

## Proposed commit message
fix(critic): read a consumed legacy Critic packet back so export, delta round and Verify binding work after finalization (PF-93)
