# C19K-W246 held patch: a stop lands its host commit after any disjoint advance of HEAD

Closest accepted criterion: AC-108. PRD and Spec unchanged. The patch is relative to the w245 state (clone base plus w245).

## Found

- (A) The terminal prepare was handed a repository inspected before a sibling's host commit moved HEAD; its first read of it raised
  `native-managed-repository-drift` (`native-managed-authority-support.mjs:20`), refused as NGHF-AUTHORITY-RECOVERY at stage
  authority-terminal-prepare. `prepareNativeGoldfishAuthorityTerminal` (`native-goldfish-host-state.mjs`) had no rebind, unlike the commit (w242).
- (B) `nativeConcurrentPlan` (`native-goldfish-host-state.mjs`, the lineage loop) accepted a commit between the slice's base and HEAD only when a sibling's
  proven host commit; an ordinary commit on a disjoint path raised `native-concurrent-unowned-head` (NGHF-COMMIT-EXCEPTION).
  The receipt draft (`native-goldfish-host-observation.mjs`) had no shape for a commit on an advanced HEAD without a sibling proof.

## What it changes

- `prepareNativeGoldfishAuthorityTerminal` now loops (limit NATIVE_BOUNDARY_REBIND_LIMIT): on `native-managed-repository-drift` it re-inspects, and if the
  advance from the slice's base touches its write scope, check or dependency paths it refuses with `native-concurrent-advance-touches-scope`; otherwise it
  rebinds and repeats (nothing was written yet). The old body is `prepareNativeGoldfishAuthorityTerminalOnce`.
- The lineage loop accepts a linear commit with no sibling proof when it touches none of the slice's write scope, check or dependency paths
  (`candidateAdvancedDisjointly`, the existing helper); the mint input carries `scopePaths` for that. A commit touching them still refuses
  `native-concurrent-unowned-head`; sibling proofs and their parent checks are unchanged. A mix of unproven and proven commits is still refused.
- The receipt draft records an advance without sibling proofs as the existing typed `movedHead` evidence (admitted HEAD = parent).

- An unproven commit is accepted only when it also touches no path of a sibling still in flight (`siblingScopes`): it could be that sibling's host
  commit whose proof is not written yet, and is then refused as before so the settle loop waits and the receipt keeps its sibling lineage.

- Release race (the simultaneous Windows case): in `completeNativeGoldfishAuthority` the terminal advance and the release run while the sibling stop is still
  writing its own post-commit files. That surfaced as `domain-membership-race` (the registry directory listing changed under the read) or
  `native-authority-member-drift` (`reconcile`, this process's view of the sibling's operation stale). Cause inferred from the two reasons, not traced
  further. Both advance and release now go through `reread`: those two reasons only, up to NATIVE_BOUNDARY_REBIND_LIMIT attempts, a re-scan between them;
  any other reason, or the bound, still ends in the same named refusal. Assumption: those refusals leave no state, so a repeat is safe; not proven separately.

## Checks (final-state results are in the last section)

- Final state: stop-pair 12 of 12 green. The finalizer suite (native-goldfish-host-finalizer.test.mjs) was green (exit 0) on the state BEFORE the last
  siblingScopes edit only. NOT RUN at the final state: finalizer, native-goldfish-host-state.test.mjs (about 10 minutes), native-goldfish-host-parallel-admission.test.mjs,
  native-goldfish-host-stop-read-scope.test.mjs, native-goldfish-host-observation.test.mjs (the receipt draft changed). Budget ended first.
- The RED seen before the change was the first NGSP9 variant (late prepare released by a commit marker) and NGSP9B; the current NGSP9 variant (late prepare released
  by the early stop's finished result) was never run against the base, so its RED is an inference. NGSP9C was green before the change (guard case).
- Not added, still open: a receipt-shape assertion (foreignCommits names the first stop's commit) in NGSP1/NGSP9, and a registry readback after NGSP9B.

- `plugins/pipeline-core/lib/native-goldfish-host-stop-pair.test.mjs`: 12 of 12 green (NGSP1 to NGSP8 unchanged and green).
- The `stopChild` and `concurrentPair` test helpers gained a `staged` option (early and late stop); existing callers are unchanged.

## Final-state results (clone commit df39357)

- stop-pair: 13 of 13 green (NGSP9D simultaneous variant alone: 5 of 5 green; its RED against the base was not measured). NGSP1 and NGSP9D assert the later receipt names the earlier commit in foreignCommits; NGSP9B reads the registry after the commit.
- finalizer: exit 0 (green); parallel-admission: 7 of 7 green; stop-read-scope: 6 of 6 green.
- native-goldfish-host-state.test.mjs: 78 of 79 green, ONE RED: NGHS18 (existing case, line 790) commits `unowned.txt` (a disjoint path) on top of the base and asserts
  `withSourceOwnedNativeConcurrentCommit` refuses with `native-concurrent-unowned-head` ("HEAD ancestry alone cannot substitute for a genuine Source return").
  That is exactly the commit shape part (B) of the briefing says must now be ACCEPTED, so briefing and the existing case contradict each other. The case was NOT
  changed or weakened. Needs a coordinator decision (for example restating the case so its refused commit touches the slice's scope, check or dependency paths, or a
  narrower acceptance rule for (B)).
- No `native-goldfish-host-observation.test.mjs` file exists in the clone (the run printed only exit 1); no observation suite was run. The receipt change is covered by the stop-pair cases only.

## Completed by the Elephant after the Goldfish checkpoint (2026-11-06)

- NGHS18 decision (coordinator): restated in place (QG-04). Its unauthenticated foreign commit now touches the slice's own write scope (`src/change.mjs`) instead
  of the disjoint `unowned.txt`, and must still refuse; it now refuses by the more specific `native-concurrent-advance-touches-scope` (the rebind route names it
  before the lineage loop), asserted exactly. The disjoint shape is the new accepted behaviour and is pinned by NGSP9B. Nothing else in NGHS18 changed.
- Results at the final clone state (one at a time unless stated): native-goldfish-host-state 79/79; finalizer + stop-pair + finalizer-regression run together
  (node --test parallel) 66/67 once (NGSP7 at authority-terminal-release, `native-managed-unknown-native-entry`), then the same combination 3 of 3 green;
  NGSP7 alone 5 of 5 green on this state and 5 of 5 on the w245 state; the full stop-pair file alone 3 of 3 green; NGSP9D once more green; observation pins
  (consumer-spec-criterion, claude-background host commit) + parallel-admission + stop-read-scope 61/61. There is no observation unit suite of its own; the
  pins and the finalizer suite cover the receipt change.
- Open, not fixed: the one NGSP7 failure under parallel test load (`native-managed-unknown-native-entry` at the terminal release) did not recur in 3 combined and
  13 single runs; it is recorded, not explained. The paragraph below that says the simultaneous release race is not fixed predates the Goldfish's own fix
  (section "What it changes", release race) and is kept as its history.

## New case ids

- NGSP9D: the simultaneous variant (late prepare released when the early stop's host commit landed, while that stop still writes).

- NGSP9: a second stop whose terminal preparation holds a repository inspected before the first stop's host commit moved HEAD rebinds and lands its own host commit on top.
- NGSP9B: an ordinary commit on another path between base and stop does not stop the host commit.
- NGSP9C: an ordinary commit touching the slice's check path still refuses with a named stop-failure record and commits nothing.
- (Ids are lexicographically ordered as the completion registry demands, hence 9B and 9C rather than 10 and 11.) No harness registration file was edited.

## Not changed, not proven

- The simultaneous variant (the late stop's prepare running WHILE the early stop is still writing its post-commit observation, terminal and release) was
  tried and is NOT fixed: it passed the prepare but failed intermittently at stage authority-terminal-release (`domain-membership-race`,
  `native-authority-member-drift` from `reconcile`). The commit had landed in both stops. NGSP9 therefore starts the late prepare once the early stop has
  finished, which still reproduces the stale repository and the drift (RED before the change). This release-stage race needs its own item; the same
  `native-authority-member-drift` also showed twice in NGSP7 of the full-file run while NGSP7 alone and NGSP1 to NGSP8 together passed, so it may pre-exist;
  not measured against the w245 base.
- Not proven on Windows timing. Hooks and lib only; no routine-repair, slice-queue or hook entry file touched.
- `save-patch` reports apply --check against the repository fails (patch is relative to w245, which is itself a held patch): expected, not rebased.
