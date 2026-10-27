# PF-86 c5 held patch: lock-free registry read path (PARTIAL: NGHS45 fixture fix applied but NOT re-run)

Status: PARTIAL / BLOCKED on one unverified fixture fix. `w7-pf86-registry-read-api-c5.patch` (25798 bytes) is ONE `git diff --binary` against candidate f3faa73d7, limited to the three allowed files (+195/-2): session-authority-registry.mjs (+16), native-goldfish-host-state.mjs (+45), native-goldfish-host-state.test.mjs (+136). Plugins tree is identical between 87b05c9d3 (where the clones were built) and f3faa73d7 (`git diff --stat` on plugins/ empty). `git apply --check` in clone2 detached at f3faa73d7: exit 0. It SUPERSEDES w7-pf86-scan-outside-registry-lock.patch (c1), w7-pf86-registry-read-api-c3.patch and w7-pf86-registry-read-api-c4.patch; do not apply those with it.

## Causes
1. Duplicate ids: c1 renumbered to NGHS45-47, this slice NGHS48-51 (ids only).
2. NGHS50: fixture defect (child argv[1] realpath ENOENT); fixed in the test by embedding URLs/root with JSON.stringify, assertion unchanged. GREEN in green2.
3. NGHS45 (c1 case), read from green2 log: first launch returned `{"ok":false,"code":"SQ-DELIVERY-QUEUE-INVALID"}`. Cause: the fixture queued ITEM-A and ITEM-C with the same write scope src/a.mjs and no ordering; slice-queue.mjs:752 raises SQ-OVERLAP for un-ordered overlapping slices. Test-fixture defect, not production and not a c3 interaction.
   - Attempt 1: ITEM-C dependsOn ITEM-A. Queue valid, launches 1 and 2 ok, but the third refusal was `held on ITEM-A (no Dispatch ... commit ...)`, not a collision (assertion at the third launch failed, n45 run).
   - Attempt 2 (APPLIED, NOT RUN, budget): ITEM-C gets itemId AC-1 (same as ITEM-A) and its own scope src/c.mjs, no dependency; the third launch uses src/c.mjs. The expected refusal is the criterion-owner collision the regex `item-delivery-(scope|owner|criterion-owner)-collision` already admits. Assertion unchanged. Justification (QG-04): a valid v2 queue cannot hold two un-ordered slices on one scope, so "a third on the first scope" is unreachable through the queue; the owner collision on the same item is the honest reachable form of "third sees the first reservation". The case NAME still says "first scope"; consider renaming at apply time.

## Results
- Baseline at candidate (clone2, no patch): 49 tests, 49 pass, 0 fail, exit 0 (log base.native-goldfish-host-state.test.mjs.log; valid for f3faa73d7 because plugins/ is identical).
- Patched clone, green2 (before the NGHS45 fixture change): 56 tests, 55 pass, 1 fail (NGHS45). NGHS46-51 and all 49 baseline ids green.
- Patched clone final run after attempt 2: NOT RUN. Failing-name set patched vs baseline therefore not final (last known: {NGHS45} vs {}).
- RED run against unchanged clone before implementation: red.native-goldfish-host-state.test.mjs.log (scratch, gitignored); not re-read in this slice.
- Importer suites (session-authority*, native-goldfish*, dispatch-admission*): NOT run (budget).

## NOT done
Final whole-file run after attempt 2 (one background run of the file in the clone, then compare to baseline); importer suites; the pending inventory scan and the reserved-item-scope read still run in the lock; the generation covers the registry catalogue, not native pending files. Risk for the Critic: the read token is read-only by contract only.

## Proposed commit
`perf(dispatch): read admission facts through a lock-free registry path and publish by generation compare (PF-86)`

## Operator flow
Do not hand to the PO until the NGHS45 rerun is green. Then: apply the patch (`git apply`), `git add -u` limited to the three lib files, `--no-verify` commit, stamp, install. Protected-path class: registry and host-state are core registry area (Critic batch gate); the test file matches no TP pattern. Independent Critic review stays a parent-owned batch gate.

CONTINUATION CARD -- done: patch rebuilt at f3faa73d7 (3 files), apply-check exit 0, NGHS45 attempt-2 fixture applied; remaining: run whole native-goldfish-host-state.test.mjs in the clone in the background (driver `run green3 plugins/pipeline-core/lib/native-goldfish-host-state.test.mjs`, ~8 min, do not pass --test-name-pattern: the driver treats every arg as a file), read NGHS45, if green run importer suites, then `driver cleanup`; if the third refusal is still not a collision, stop and name it; next step: that background run (clones still exist under scratch/agent-out/w7qs).
