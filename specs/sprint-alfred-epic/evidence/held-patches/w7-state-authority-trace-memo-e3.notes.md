# w7-state-authority-trace-memo-e3

Stacked on scratch/agent-out/compose/bundle.patch (e1b, e1c, e2). Candidate 42659f0e3b3a667fd08f9e70ffa13e929fe7c438. Patch: w7-state-authority-trace-memo-e3.patch (7395 bytes).

## Cause
The memo counters (authorityMemoHits, authorityMemoMisses, authorityMemoSize) were visible only through nativeAuthorityStats(); the one-line AUTHORITY-TRACE could not show whether the memo helped. The recon note's premise held: pipeline-state.mjs `writeAuthorityTrace` builds the line from nativeAuthorityStats().

## Change
- plugins/pipeline-core/scripts/pipeline-state.mjs: `writeAuthorityTrace` now prints `buildAuthorityTrace(elapsedMs, outcome)`; the new exported pure function holds the old body and adds `authorityMemo: { hits, misses, size }` (integers, 0 when the backend reports none) before `outcome`. All existing keys and meanings unchanged. Schema string stays `pipeline.authority-trace.v1`: adding a key is compatible. Nothing is printed without PIPELINE_AUTHORITY_TRACE=1.
- plugins/pipeline-core/scripts/session-authority-repair.test.mjs: namespace import of pipeline-state.mjs (so a missing export is a per-case red, not a whole-file SyntaxError); cases SAS18 (spawned CLI trace line has authorityMemo with three integer keys, all 0 on Linux, existing keys present) and SAS19 (backend seam: one miss plus one hit, built trace shows hits 1, misses 1, size 1).
- harness/scripts/check-verify-case-completion.test.mjs: VCR01 pin for the repair suite 276 -> 288 (only that number; measured from the red run).

## RED / GREEN
- RED (clone, before production edit): repair test file exit 1, tests 40, pass 38, fail 2: SAS18 and SAS19 only (log w7df/logs/red.log).
- GREEN (clone): repair test file exit 0, tests 40, pass 40, fail 0.
- Baseline (clone2, stacked, unpatched): exit 0, tests 38, pass 38, fail 0. Failing-name sets both empty.
- check-verify-case-completion: first run red only on VCR01 (actual 288, expected 276); after the pin change exit 0, tests 32, pass 32.
- check-product-capability-inventory: exit 0, 30/30. generate-architecture-overview --check: exit 0.
- pipeline-state-external-push-ledger.test.mjs: exit 1 in BOTH the patched clone and the stacked baseline clone2 with the same failure, FAIL PSXL05 (SDC-AUTHORITY-UNAVAILABLE state-push-injected-route, Elapsed ~9 s). Pre-existing in this scratch-clone environment, not caused by this patch (identical on the baseline); not investigated further (budget). The Elephant earlier reported 1/1 on a fresh clone, so it may be an environment effect of the scratch HOME/TMPDIR.
- Apply check: `git apply --check` of the patch in clone2 (stacked baseline), see driver check output: exit 0.

## NOT done
- The ledger suite PSXL05 failure above is unexplained.
- No native Windows run; the memo is exercised via the fake spawn seam only.
- Full Verify, independent Critic review (parent-owned batch gate) and PO acceptance remain pending.

## Commit and flow
Proposed message: "feat(state): show the memo counters in the authority trace line". Operator flow: apply-diff (after bundle e1b, e1c, e2), git add -u with a path limit, --no-verify commit, stamp, install. Protected paths: none of the touched files match TP-1..TP-13 (the pipeline-state test patterns TP-5 cover harness/scripts/pipeline-state*.test.mjs, not the touched files).
