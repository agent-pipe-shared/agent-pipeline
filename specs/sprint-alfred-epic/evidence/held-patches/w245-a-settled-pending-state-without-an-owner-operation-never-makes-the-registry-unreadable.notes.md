# w245 - a pair's registry stays readable (native-item-scope-operation-unowned)

Closest accepted criterion: AC-108 (PRD and Spec unchanged). Slice C19K-W245-UNOWNED, built in a scratch clone at candidate 88ae6eb51 (19j); the patch is `w245-...unreadable.patch` next to this file.

## Found

Root cause, REPRODUCED (not inferred): `nativeAuthorityScan` (`plugins/pipeline-core/lib/native-goldfish-host-state.mjs`) created the owner operation of each pending state lazily, inside the same loop that checks that state. The receipt-lineage check of a state whose receipt is a `native-goldfish-host-observation.v3` (the second stop of a simultaneous pair, which lists the sibling's commit in `foreignCommits`) looks the sibling up with `effectiveNativePendingState(read, foreign)` (line 552 before the change), and that function throws `native-item-scope-operation-unowned` (line 630) when the sibling has no operation yet. Entries come in file-name order (the name is a hash), so whenever the receipt-bearing pending state sorted BEFORE its sibling's, the sibling's operation did not exist yet and the whole native-goldfish producer refused its reconcile. A process that had scanned before (the stops, in-process tests) already held the operations from the earlier scan, so only a fresh process (`session-authority-repair inspect`, heal, the registry initialization of the next admission) met it, and it met it in about every second pair.

This also explains the coordinator's evidence without any member being involved: the nine settled pending states (receipt-bearing ones among them) stayed in the common-dir while the registry was moved aside; a freshly initialized registry reconciles through the same scan and refused the same way. The members pruned, never released or missing in the registry (candidates in the briefing: w238 pruning, a member created by heal, a sibling released by its own stop) are not what raised the fault: with the registry members removed entirely (NGSP7) and the fix in place the registry reads.

## What it changes

One function, `nativeAuthorityScan`: the per-pending loop is split in two. The first loop validates each pending state and creates its operation (the code that was already there, unchanged: shape checks, retained-owner check, operation creation, pending-drift check). The second loop runs everything else (scope amendments, terminal, receipt lineage, checks, rechecks, integration, checkpoints) with every operation already present. `effectiveNativePendingState` and its `native-item-scope-operation-unowned` throw are byte-unchanged; no tolerance branch was added, so a pending state still cannot be used without an owner operation. The throw is now unreachable from the scan's own entries, because every pending state of the scan owns an operation before any state is checked against another one.

Automatic repair (PO requirement 2026-11-06): the on-disk state of a pair left by an older build is valid, only the read order failed; with the fix the registry reads, `session-authority-repair inspect` reports its reservations, and the ordinary heal (`routine-repair.mjs run heal`) retires the settled pending states as it already did (NGSP7 asserts at least four `retiredPending` rows). No new retire path and no refusal text were needed, because the refusal can no longer arise from the settled pending states of a pair.

## Checks

All in `plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs` (existing, registered file; no registration change):

- NGSP6 (RED before the change, GREEN after): after a pair whose second stop landed on its sibling's commit, a later process reads the registry, in either order of the two pending states. Observed RED: `native-goldfish ... reconcile-refused ... native-item-scope-operation-unowned` in order [1,0]; order [0,1] passed, so exactly one of the two orders reproduces. Uses sequential stops (enough to write a v3 receipt with `foreignCommits`).
- NGSP7 (GREEN): a real concurrent pair (child processes); the registry is removed and initialized anew while the settled pending states stay (as after a move-aside) and reads; a second pair over those leftovers; heal retires at least four settled pending states; the registry reads; a third pair after the heal; the registry reads. The pair order is chosen by the hashes, so this case is not by itself the deterministic reproduction (NGSP6 is).
- NGSP8 (GREEN): a receipt whose sibling pending state (and its authority records) is gone still refuses the read with `native-concurrent-receipt-lineage`, so the lineage check is not weakened.
- NGSP1 is restated in place (QG-04: extend, never weaken): its body moved into the helper `concurrentPair`, with the same assertions; `stopChild` now derives the first stop of a round from the tag (`t0`, `bt0`, ...), the behaviour for the original tags is unchanged. NGSP2 to NGSP5 untouched.

New case ids: NGSP6, NGSP7, NGSP8 (all in `native-goldfish-host-stop-pair.test.mjs`). No new test file, no harness registration touched.

Suites run in the scratch clone, one at a time, all exit 0: native-goldfish-host-stop-pair 9/9, native-goldfish-host-state 79/79, native-goldfish-host-parallel-admission 7/7, native-goldfish-host-finalizer 50/50, session-authority-registry-fewer-checks 8/8; the held patch's check test 2/2.

## Not changed, not proven

- Briefing case (3) "a LIVE pending state without an owner operation still refuses": no existing test pins `native-item-scope-operation-unowned`, and none can be written without exporting `effectiveNativePendingState`, which was not done. The statement is covered by construction (the throw is untouched and the fix only reorders creation) and by NGSP8 for the sibling lookup it guards.
- Edge, not fixed, not reproduced beyond NGSP8: a receipt that names a sibling whose pending file was retired while the receipt-bearing state was not still refuses `native-concurrent-receipt-lineage` (line 551, `foreign` undefined). `planSettledPending` retires settled pending states with their authority files; whether a retirement can ever split such a pair was not examined.
- The in-process variant of NGSP7 (a second pair in the process that ran the first, after a heal moved the pending files) hit `native-authority-missing-pending`: operations retained in memory outlived their moved files. Production hooks run one process per call, so this does not arise there; the case uses child processes to mirror that. Not changed.
- Windows was not run; the reproduction is Linux-only. The coordinator's Windows evidence fits the cause, which is path-independent.
- Test-first evidence file (`testFirst`) not written; NGSP6's RED output was observed in the dispatch session.
