# PF-86 c6 held patch: lock-free registry read path (COMPLETE, verified)

Status: targeted delivery green. `w7-pf86-registry-read-api-c6.patch` (25798 bytes) is ONE `git diff --binary` against candidate 247bf146168dd7a4821fbcc82c800cb086601be7, three files, +195/-2: session-authority-registry.mjs (+16), native-goldfish-host-state.mjs (+45), native-goldfish-host-state.test.mjs (+136). It SUPERSEDES c5 and the older c1 (scan-outside-registry-lock), c3 and c4 patches; never apply those with it. plugins/ is identical between f3faa73d7 (clone base) and 247bf1461 (`git diff --stat` empty), so the cumulative diff is valid at the candidate.

## Cause and change
Admission held the registry lock while scanning pending inventory and the queue. The patch adds a lock-free registry read path (read token, read-only by contract) and publishes by generation compare: facts read outside the lock are adopted only if registry generation, queue digest and candidate commit are unchanged at publish; otherwise they are re-read under the boundary. Pre-existing exports keep name and arity.

## Fixture fix (QG-04 justification)
NGHS45 (a case inherited from c1): a valid v2 queue cannot hold two un-ordered slices on one write scope (slice-queue SQ-OVERLAP), so "a third on the first scope" is unreachable through the queue. ITEM-C now has the same itemId as ITEM-A (AC-1) and its own scope src/c.mjs, no dependency; the third launch refuses with the criterion-owner collision, which the unchanged assertion regex already admits. Assertion not weakened. The case NAME still says "first scope"; consider renaming at apply time. NGHS50: child argv fixture defect fixed by embedding URLs/root with JSON.stringify, assertion unchanged.

## Results (machine-written logs under scratch/agent-out/w7qs, gitignored)
- RED (new cases against UNPATCHED production at the candidate, only the patched test file copied into clone2; log base-red): 56 tests, 49 pass, 7 fail = exactly NGHS45, 46, 47, 48, 49, 50, 51.
- GREEN (patched clone, whole native-goldfish-host-state.test.mjs, log green3): 56 tests, 56 pass, 0 fail; NGHS45-51 each green (NGHS45 14.4 s, NGHS48 5.0 s, NGHS49 8.5 s, NGHS50 4.8 s).
- Baseline vs patched failing-name sets (whole file): baseline at candidate without the new cases 49/49 pass, set {} ; patched {} . Identical.
- Importer suites, patched clone, all exit 0, 0 fail: session-authority-lock-wait (5/5), native-goldfish-host-commit-execution (6/6), native-goldfish-host-state-regression (3/3), native-goldfish-host-finalizer-regression (3/3), native-goldfish-host-finalizer (21/21), native-goldfish-host-return-regression (2/2), native-goldfish-host-return (8/8), native-goldfish-host-state-fanout (8/8). Since none failed, no clone2 baseline comparison was needed. Search was `-maxdepth 1` in lib; no dispatch-admission*.test.mjs file matched; subdirectories were not searched; other importers (non-prefixed names) not run.
- Apply check: `git apply --check` in clone2 detached at 247bf1461: exit 0.
- Importers ran concurrently with the whole-file run; no contention failure appeared.

## NOT done
The inventory scan of pending files and the reserved-item-scope read still run inside the lock; the generation covers the registry catalogue, not native pending files. Full Verify, independent Critic batch review and PO acceptance remain parent-owned and pending. Risk for the Critic: the read token is read-only by contract only, not enforced.

## Proposed commit
`perf(dispatch): read admission facts through a lock-free registry path and publish by generation compare (PF-86)`

## Operator flow
Apply the patch (`git apply`), `git add -u` limited to the three lib files, `--no-verify` commit, stamp, install. Protected-path class observed: registry and host-state are core registry area (Critic batch gate); the test file matches no TP-1..TP-13 pattern. The independent Critic review stays a parent-owned batch gate.
