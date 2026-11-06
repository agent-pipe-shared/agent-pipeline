# C19J-W242: the second stop of a simultaneous pair lands its host commit, and a refused admission leaves no ready queue row

Closest accepted criterion: AC-108 (PRD and Spec unchanged). Held patch: `w242-the-second-stop-of-a-simultaneous-pair-lands-its-host-commit-and-a-refused-admission-leaves-no-ready-row.patch`, based on candidate 61a6dc5d516f26531f7145768be3927eafd7c766, developed in a clone; it changes only `plugins/pipeline-core/lib/` (4 files: 3 changed, 1 new test file).

## Found

**A. Second stop refuses `NGHF-COMMIT-EXCEPTION` / `native-managed-repository-drift`.** The cause is not an owner cached from the read phase. `withSourceOwnedNativeConcurrentCommit` (`native-goldfish-host-state.mjs`) inspected the repository, then opened the registry boundary on that object. `acquireRegistryLock` (`session-authority-registry.mjs` line 314) polls up to `SESSION_AUTHORITY_LOCK_WAIT_MS` (1500 ms) for a sibling that holds the lock. The sibling's host commit moves HEAD inside that lock, so the lock is acquired after the wait on a repository object that is already older than HEAD. Every use of the boundary re-validates its repository (`session-authority-registry.mjs` line 101 / 376), and the first scan raises `nativeManagedRepository` drift (`native-managed-authority-support.mjs` line 20) before the commit callback is entered, so the finalizer's catch (finalizer line 488) reports it as `NGHF-COMMIT-EXCEPTION`. The sequential in-process test of the existing suite (NGHS59) never waits for the lock, which is why it stayed green. Reproduced RED by two real stop processes (NGSP1).

Two more failures of the same class sat directly behind the first one, found by driving the pair for real:

1. The sibling is still finishing its post-commit writes (observation, record, terminal) outside the lock when the second stop gets the lock. For that moment its commit has no lineage proof (`native-concurrent-unowned-head`) and the producer namespace is ahead of its registry baseline (`native-goldfish:namespace-drift`).
2. After the second stop's commit landed on top, the first stop's own post-commit item checks and its two write boundaries ran on the repository it had inspected before: `item-check-candidate-or-contract` (`itemCheckSnapshot`) and the same stale boundary in `completeNativeGoldfishAuthority`.

**B. A refused admission leaves a ready row.** `prepareGovernedItemQueue` writes the row before the runner, role, base, scope and candidate-git checks, as the plan says, but a rollback already exists (`restoreWrittenQueueRows`, PF-55) and restores the plain case (NGSP3 and NGSP3B are GREEN on the original code). The rollback fails in two ways that are silent: (a) it is a whole-file compare-and-swap on the bytes it wrote, so any sibling admission that wrote the queue meanwhile (the 28/29 pair) answers `SQ-ROLLBACK-CHANGED` and the row stays (reproduced RED, NGSP4); (b) it waited at most 10 s for the registry lock, while a sibling admission holds it for a whole cycle on Windows, and only `GUARD-DISPATCH-SLOW` was counted as "row retained", so the refusal text never said the row stayed. Which of the two fired in gf-probe-28 is not observable from the record; both are closed.

## What it changes

- `withCurrentRepositoryBoundary(root, callback)` (new, state.mjs): inspects the repository, opens the boundary, inspects again with the lock held, and starts over (bounded, 8) when the lock was acquired after a wait that outlived the inspection. The callback runs only on a current repository and is never repeated. Used by `withSourceOwnedNativeConcurrentCommit`, by both write boundaries of `completeNativeGoldfishAuthority`, and by `rollbackGovernedItemQueue`. The lock-free scan before the item checks reads the repository as it is now (`nativeAuthorityScanCurrent`).
- `withSourceOwnedNativeConcurrentCommit` takes an optional `settle` budget (the finalizer passes the stop's wait budget and its injectable clock). Refusals raised before the callback ran for the two sibling-still-finishing cases (`native-concurrent-unowned-head` while another item pending state has no terminal yet; `*:namespace-drift`) release the lock and are looked at again until the budget ends; without `settle` they are raised at once, as before (the existing `native-concurrent-unowned-head` test is unchanged).
- A HEAD advance since the slice's candidate that changed a write-scope, check or dependency path is refused by name before anything else: `native-concurrent-advance-touches-scope` (NGSP2). A non-descendant or unproven advance keeps `native-concurrent-unowned-head`.
- The post-commit item checks of a stop run against that stop's own delivery commit (`inspectNativeGoldfishAuthorityTerminal` now returns `commit`); `itemCheckSnapshot` accepts a candidate that HEAD has moved past when its tree still matches and the bytes of every check path equal that commit's own bytes.
- Rollback: when the queue is no longer the bytes this admission wrote, only this admission's row is taken out again (`rollbackOwnQueueRow`): restored to its prior row when one existed, edges to it stripped, a shared critic row it created for itself removed, every row a sibling wrote kept, a row somebody changed since left and reported. The wait for the lock is the rollback window (`rollbackGovernedItemQueue(written, deadline)` through `retryPublishWhileLockHeld`). Every outcome that leaves the row (`refused`, `SQ-ROLLBACK-CHANGED`, `SQ-ROLLBACK-INVALID`) is counted and the refusal text names the repair (`slice-queue.mjs cancel`, or the routine heal). `written` carries `planDir`, `rowId` and `rowSha256` for this.

## Checks

New file `plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs`, 6 cases, all GREEN on the patched clone (`node scratch/agent-out/test-in.mjs scratch/agent-out/s-w242 plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs`: tests 6 pass 6 fail 0, run on the final state saved in the patch). RED against the original code before the first production edit: NGSP1 (`native-managed-repository-drift`), NGSP2 (`native-concurrent-unowned-head` instead of the named cause), NGSP4 (own row stays), evidence `scratch/agent-out/s-w242-red-stop-pair.log` (written by `capture-evidence.mjs`; its wrapped exit code reads 0 because the helper reports the child's own `exit 1` line in the log).

New case ids, all in `plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs`:

| id | what it holds |
|---|---|
| NGSP1 | two real stop processes of one reply, disjoint scopes, both land their host commits; the second on top of the first |
| NGSP2 | a sibling advance that changed this slice's own path is refused with `native-concurrent-advance-touches-scope` in the stop-failure detail |
| NGSP3 | refusal at candidate-git after the row write leaves the queue bytes unchanged; a successor with an overlapping scope is admitted |
| NGSP3B | the same at the role check |
| NGSP4 | a sibling row written between the row write and the rollback survives; the admission's own row is gone |
| NGSP5 | outcomes that leave a row (lock, changed, invalid) are counted; the rollback receives its window |

Registration: the file is NEW and is not run by Verify until it is added to `harness/verify-suites.json` (a protected path, TP-13; not touched here) and the case-completion list; it needs registration by the Coordinator.

Not yet run on the patched clone at the time of this checkpoint (the budget checkpoint fired first): the full existing suites `native-goldfish-host-state.test.mjs` (about 10 minutes), `native-goldfish-host-finalizer.test.mjs`, `native-goldfish-host-parallel-admission.test.mjs`, `native-goldfish-host-stop-read-scope.test.mjs`. They must be run one at a time before the patch is accepted.

## Not changed, not proven

- `prepareGovernedItemQueue` still writes the row first and `candidate-git` (line 315) stays a strict equality; moving it above the queue would turn `SQ-ITEM-CANDIDATE-DRIFT` (with its regenerate repair) into `NGHS-CANDIDATE-MISMATCH` for every advance, so the row is restored instead.
- `prepareGovernedItemQueue` and the other admission-side boundaries still open on a repository inspected before the lock wait. An admission that waits for a stop's commit has the same stale-boundary shape; it was not reproduced here and is left for the Coordinator to decide.
- Which of causes (a) and (b) fired in gf-probe-28 is not known; both are covered by tests only for (a) and for the counted outcome; the 10 s to rollback-window wait change has no timing test.
- The Windows `gf-probe-34` stop was not run; the Linux pair test is the only measurement. NGSP1 depends on two child processes reaching the commit lock together and is timing-shaped: if the first commit takes longer than the 1500 ms lock poll, the second stop retries on a fresh inspection and passes without exercising the rebind (it never fails because of this).
- A waiting second stop whose sibling never finishes its post-commit writes (a crashed sibling) waits the stop's settle budget and then refuses with the named cause (`native-concurrent-unowned-head` or `native-goldfish:namespace-drift`); the repair routes (heal, cancel) are unchanged.
- `plugins/pipeline-core/lib/session-authority-registry.mjs` and `session-authority-repair.mjs` are untouched.

## Completed by the Elephant after the Goldfish checkpoint

The Goldfish returned at its budget checkpoint before the existing suites ran. The Elephant ran them on the clone at f5fad28b9, one at a time: native-goldfish-host-finalizer 50/50, native-goldfish-host-stop-read-scope 6/6, native-goldfish-host-parallel-admission 7/7, native-goldfish-host-state 79/79; then re-saved the patch from the clone HEAD (apply --check exit 0) and ran the check test (2/2).
