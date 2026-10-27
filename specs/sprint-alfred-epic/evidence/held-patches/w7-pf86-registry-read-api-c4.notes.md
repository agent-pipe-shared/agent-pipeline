# PF-86 c4 held patch: lock-free registry read path (INTERIM, budget-stopped, final whole-file run NOT yet read)

Status: PARTIAL. `w7-pf86-registry-read-api-c4.patch` (25788 bytes, 3 files, +195/-2) is ONE `git diff --binary` of the final clone state against the candidate (plugin tree identical between 87b05c9d3 and 86b53e048, checked with git diff --stat on plugins/). It contains PF-86 c1 + c3 edits + the id renumbering together, so the PO applies a single patch to the candidate. It SUPERSEDES `w7-pf86-scan-outside-registry-lock.patch` (c1) and `w7-pf86-registry-read-api-c3.patch`; do not apply those with it. Apply check (`git apply --check` in clean clone2 at the candidate) was NOT run.

## Causes found
1. Duplicate ids (c3 finding, confirmed): c1 adds NGHS41-43 colliding with the candidate's NGHS41-43; fixed by renumbering c1 to NGHS45-47 and this slice to NGHS48-51 (ids only).
2. NGHS50 (diagnosed from the printed child stderr in the green log): NOT a held lock. The child, started with `node --input-type=module -e <script> <url> <url> <root>`, gets the first extra arg as `process.argv[1]`; `plugins/pipeline-core/scripts/model-family-approval-request.mjs:484` (imported transitively) runs `realpathSync(process.argv[1])` and throws ENOENT on `.../file:`. Fixture defect. Fix in the test only: the URLs and root are embedded in the script with JSON.stringify and no extra args are passed. Assertion unchanged (`child.stdout === "entered"`, status 0).
3. NGHS45 (c1's case) failed in the first whole-file run with `launch("ITEM-A").ok === false` and no reason shown. Cause NOT yet determined. The test now prints `JSON.stringify(launch result)` as the assertion message for the first two launches (diagnostics only, no weakening); the rerun log `scratch/agent-out/w7qs/green2.native-goldfish-host-state.test.mjs.log` (clone, gitignored scratch) will name it. Hypothesis: c1's own fixture (needs the candidate's host-state fixture shape) rather than the c3 wiring; compare with c1 alone before blaming c3.

## Results (whole file native-goldfish-host-state.test.mjs)
- Baseline at candidate (clone2, no patch): 56-case file not applicable; 49 tests, 49 pass, 0 fail (exit 0).
- Patched clone, first run (before NGHS50/NGHS45 diagnostics edits): 56 tests, 54 pass, 2 fail: NGHS45, NGHS50. NGHS46-49, NGHS51 and all 49 baseline ids green.
- Patched clone rerun after the edits above: STARTED in background (green2), result NOT read.
- Per-case RED before implementation: not observable in this attempt (registration failed on duplicate ids before any case ran).
- Other test files importing session-authority-registry (about 25 in plugins/pipeline-core/lib and scripts, listed via git grep): NOT run (more than five, briefing limit). Names for the Full Verify: session-authority-lock-wait.test.mjs, native-goldfish-host-finalizer*.test.mjs, slice-queue-related scripts.

## NOT done
Reading the green2 log (NGHS45 cause, NGHS50 verdict); apply check; clone cleanup (`node scratch/agent-out/w7qs/driver.mjs cleanup`). The pending inventory scan and the reserved-item-scope read still run in the lock; the generation covers the registry catalogue, not native pending files. Risk for the Critic: the read token is read-only by contract only.

## Proposed commit
`perf(dispatch): read admission facts through a lock-free registry path and publish by generation compare (PF-86)`

## Operator flow
Apply this single patch to the candidate (`git apply`), `git add -u` limited to the three lib files, `--no-verify` commit, stamp, install. Protected-path class: registry and host-state are core registry area (Critic batch gate); the test file matches no TP pattern. Independent Critic review stays a parent-owned batch gate. Do not hand this patch to the PO before green2 is read green.

CONTINUATION CARD -- done: patch rebuilt as one candidate diff, NGHS50 cause found and fixed in test, baseline 49/49 green; remaining: read green2 log (NGHS45 cause), fix if red, rewrite patch, `driver check` in clone2 (clone2 is at the candidate), cleanup; next step: read scratch/agent-out/w7qs/green2.native-goldfish-host-state.test.mjs.log tail.
