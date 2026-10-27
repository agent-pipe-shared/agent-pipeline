# W7-MAINREF-ANCESTOR-C1-20261027 - Slice M held patch

Patch: `w7-mainref-ancestor.patch` (git diff --binary against candidate fa6cb7f99ea071b789c38d16aaef0c74e996ef04; two files). Status: targeted delivery green; independent Critic review, Full Verify and PO acceptance stay parent-owned and pending.

## Cause
`reviewUnitSource` in `plugins/pipeline-core/lib/critic-generic-batch.mjs` (recon cited :295-303, re-verified at :296-303) refused with CGB-MAIN-INTEGRATION unless `deliveryBoundary.mainRef` equalled the primary checkout's `symbolic-ref HEAD`. A unit naming `refs/heads/feat/<branch>` therefore failed whenever the primary checkout sat on main.

## Exact change
`critic-generic-batch.mjs` (line 298 replaced by 4 lines): compute `featOnMain` = mainRef is a string matching `^refs/heads/feat/\S+$` AND primaryRef is exactly `refs/heads/main`; refuse unless `mainRef === primaryRef || featOnMain` (the `primaryRef.startsWith("refs/heads/")` condition is kept). The existing ancestor check (`merge-base --is-ancestor <candidate> primaryRef`, line 302) is unchanged and now runs against main in the feat case.
`critic-generic-batch.test.mjs`: completionCaseIds extended by CGB023-CGB026; four new cases after the D165-PF75A cases:
- CGB023 feat/ mainRef, primary on main, candidate ancestor: accepted (declaration.mainRef returned).
- CGB024 feat/ mainRef, primary on unrelated branch `other`: CGB-MAIN-INTEGRATION.
- CGB025 feat/ mainRef, main reset to base (candidate not ancestor): CGB-MAIN-INTEGRATION.
- CGB026 mainRef in {refs/heads/release/x, refs/heads/featx, refs/heads/other, refs/tags/feat/x, refs/heads/feat/} with primary main: CGB-MAIN-INTEGRATION.
No existing case was changed, weakened or removed.

## ADR-style note
Relaxed: the equality between the unit's declared mainRef and the primary checkout's branch, in exactly one combination - declared ref under `refs/heads/feat/` while the primary checkout is on `refs/heads/main`. Why: a review unit is committed on the feature branch and names that branch as its delivery boundary; the primary checkout is on main, so equality can never hold and the consumer push is blocked (pipeline.consumer-push-blocked-by-late-review-unit). Why safe: the integration guarantee ("reviewed work is reachable from the integrated line") is carried by the ancestor test, which is unchanged and is evaluated against the primary branch (main), so work not integrated into main is still refused; the relaxation only widens which declared ref names are accepted, not which commits. A feat/ name cannot be used to claim an arbitrary line because the primary must be exactly main. Still refused (CGB-MAIN-INTEGRATION): primary on any other branch with a mismatching mainRef; candidate not an ancestor of the primary branch; mainRef outside `refs/heads/feat/` (release/, other branches, tags, bare `refs/heads/feat/`, `featx`) when it differs from the primary ref. Residual risk: the feat/ name is not itself verified to exist or to point at the candidate; the parent Critic should judge whether that needs a further check.

## Evidence (machine-written logs under scratch/agent-out/w7c/, local only)
- RED (unchanged clone, with new cases): `node plugins/pipeline-core/lib/critic-generic-batch.test.mjs` exit 1, tests 26, pass 25, fail 1: CGB023 fails with CGB-MAIN-INTEGRATION. CGB024-CGB026 passed already against the old code (they pin refusals that must survive; only the accept case can be red).
- GREEN (patched clone): same command exit 0, tests 26, pass 26, fail 0.
- Baseline (clone2, unchanged at candidate): exit 0, tests 22, pass 22, fail 0.
- Failing-name sets: baseline empty, patched empty; no pre-existing failure. Only difference is the four added cases.
- Apply check in clone2 at the candidate: `git apply --check` exit 0.

## NOT done
No Critic review, no Full Verify, no native-host run, no change to push-prepare remedy (Slice R). The repository tree under plugins/ was not edited.

## Protected-path classification observed
The test file and critic-generic-batch.mjs match none of TP-1..TP-13 in agent-obligations §2; recon says critic-generic-batch.mjs is in the never-liftable kernel closure, hence delivery as a held patch.

## Proposed commit message
fix(critic): accept a feat/ review-unit mainRef when the primary checkout is on main and the candidate is its ancestor (Slice M)

## Operator flow
1. `git apply specs/sprint-alfred-epic/evidence/held-patches/w7-mainref-ancestor.patch`
2. `git add -u -- plugins/pipeline-core/lib/critic-generic-batch.mjs plugins/pipeline-core/lib/critic-generic-batch.test.mjs`
3. Commit with `--no-verify` using the message above (message file, provenance trailers).
4. Stamp, then install.
