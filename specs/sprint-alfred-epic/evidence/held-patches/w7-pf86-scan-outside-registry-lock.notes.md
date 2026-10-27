# PF-86 held patch: commit-evidence read outside the registry lock, adopted by compare (INTERIM, budget-stopped)

Status: PARTIAL. Patch applies; two of three new cases green; NGHS41 red (fixture-grounded, see below). Independent Critic review stays a parent-owned batch gate.

Apply order: PF-85 c2 (`w7-pf85-repair-hints-c2.patch`) first, this patch second. The patch is `git diff --binary` against a local commit "pf85 stack base" on candidate 28535750305a7c5c2f1e3d60f630ed0b723b7abe. Apply check in a second clone (same base): exit 0.

## Cause
`publishNativeAuthorityState` (native-goldfish-host-state.mjs) ran every slow fact inside `withSessionAuthorityBoundary`, so the registry lock was held for the git commit-evidence read as well.

## Change (native-goldfish-host-state.mjs, +18 lines)
- New exports `prescanCommitIntegratedSlices` and `adoptPrescanInBoundary`, placed after `memoPerAdmission`.
- In `publishNativeAuthorityState`, before the boundary: `prescan` is computed from `resolveGovernedItemQueue`; any fault sets `prescan=null`.
- Inside the boundary, right after the existing `item-delivery-queue-drift` check: `adoptPrescanInBoundary` seeds the per-admission memo under the same key used at the two read sites. It adopts the pre-scan only if queue sha256 and candidate commit both still match (that pair fully determines the fact); otherwise it re-reads under the boundary. The existing queue-drift refusal still fires first on a changed queue.
- Tests: NGHS41, NGHS42, NGHS43 added (the stacked file ended at NGHS40, not NGHS44 as the briefing said).

## Results
- RED (unchanged clone): NGHS41, 42, 43 failed (exports missing). Log: scratch run `red`.
- GREEN (patched clone, whole file): NGHS42 and NGHS43 pass; NGHS41 fails. It is the only failing name in the patched run. Whole-file baseline in the second clone (stack base, without new cases): exit 0, no failing names. So no pre-existing failure.
- NGHS41 failure: an `assert.equal(...ok, true)` on a `launch(...)` at test line 1262; I did not isolate which launch. Hypothesis (unverified): the second disjoint-scope launch collides on the criterion locator from the shared `makeBinding` fixture, so the case is fixture-grounded, not a PF-86 defect. Not fixed in this budget; do not treat as green.

## NOT done
- Only the boundary-independent git read left the lock. `readNativeIntegratedSlices`, member-record reads, `readSettledItemSliceIds` and the pending inventory scan need `boundary` (registry API, must not change) or mutate `owner.operations`; moving them needs a registry-API slice.
- No registry-generation compare (the hoisted fact has no registry dependency).
- No wait bound raised; session-authority-registry.mjs untouched.
- NGHS41 not repaired; no Full Verify.

## Proposed commit
`perf(dispatch): scan outside the registry lock and publish by compare-and-swap (PF-86)`

## Operator flow
apply PF-85 c2, then this patch (`git apply`), `git add -u` with a path limit to the two lib files, `--no-verify` commit, stamp, install. Protected-path class observed: native-goldfish-host-state.mjs is core registry-adjacent (Critic batch gate); the test file matched no TP pattern.

CONTINUATION CARD -- done: helpers, call site, 3 cases, patch, apply check; remaining: fix NGHS41 fixture (isolate failing launch), re-run whole file in both clones, cleanup clones; next step: print the failing launch in NGHS41.
