# Held patch c2: calibration fixtures in pipeline-state.test.mjs (slice W7-PIPELINE-STATE-NEUTRAL-ONLY-FIXTURE-C2-C1-20261027)

Candidate a6f92516450f35a17879b692ffb81183640be39a. Patch: `w7-pipeline-state-neutral-only-fixture-c2.patch` (git diff --binary from Node; complete, INCLUDES the c1 change; one file `plugins/pipeline-core/scripts/pipeline-state.test.mjs`, +8/-3 total). Driver: `scratch/agent-out/w7pt/driver.mjs` (untracked scratch). Clones: `git clone --shared --no-checkout`, detached at the candidate; clone = patched, clone2 = unchanged baseline.

Targeted delivery: PARTIAL. Two blocks fixed (the c1 loop cases and NVA-B-CALIBRATION-PARTIAL-IO); the file now aborts at the next block, NVA-CF-VERIFYDEADLOCK, which is not fixed (budget).

## Block 2: NVA-B-CALIBRATION-PARTIAL-IO

- Refusal captured with a throwaway probe copy (deleted; `captured` printed before the assertion): `{"result":2,"lines":["Error: set-phase implementation refused (ARCHITECTURE-FITNESS-NOT-READY); planning architecture fitness is blocked"]}`.
- Production site raising it: `plugins/pipeline-core/lib/architecture-entry-readiness.mjs` lines 461-470 (`blockingOverallStatus` not `pass`/`excepted`).
- Class: FIXTURE (stale against the profile-binding contract). `prepareCalibrationArchitectureFixture` (test lines 47-60, its own comment) says the adopted profile binds `project/pipeline.json`, so a caller that commits a calibration must pass the same bytes to the helper. The three loop cases do; the partial-IO block called the helper with no bytes and wrote/committed the calibration afterwards, which is profile drift. I inferred drift as the cause from that comment and the loop cases; I did not print the individual fitness outcomes, but the patched run passed the block, which confirms the fix.
- Change: build the `calibration` object first, then `prepareCalibrationArchitectureFixture(root, JSON.stringify(calibration, null, 2) + "\n")` (same bytes the block already writes afterwards), plus a 3-line QG-04 comment. Every assertion, the injected ENOSPC writer and the examiner semantics are unchanged.
- QG-04 justification: a fixture-order/setup correction so the case reaches the injected writer through the current gate; no assertion weakened.

## Block 1 (c1, carried): neutral-only/legacy-only/matching-dual
Owned planned path `src/change.mjs`: `areas` expectation becomes the `application` ready entry and `unresolvedPaths` becomes `[]` (see the c1 notes `w7-pipeline-state-neutral-only-fixture.notes.md`).

## Whole-file results (`node plugins/pipeline-core/scripts/pipeline-state.test.mjs`; reporter is not TAP, file aborts on first uncaught assertion, no counts)

| Run | Tree | Exit | Abort |
|---|---|---|---|
| base | clone2, unchanged candidate | 1 | `deepStrictEqual` at line 2218, case `neutral-only` (areas actual `[application...]` vs expected `[]`) |
| patched | clone, c1 + c2 | 1 | `assert.equal(code, 0)` "baseline-only verification must allow the approved plan to enter implementation", `2 !== 0`, at patched line 2330, block NVA-CF-VERIFYDEADLOCK |

Failing-name sets: baseline = {neutral-only loop case}; patched = {NVA-CF-VERIFYDEADLOCK baseline-only block}. Logs (untracked): `scratch/agent-out/w7pt/base.pipeline-state.test.mjs.log`, `scratch/agent-out/w7pt/green.pipeline-state.test.mjs.log`. The green log shows the stderr lines before the abort: `CVCT-GIT-READ` refusals belong to the intentional refusal cases at the top; the last line before the abort is `ARCHITECTURE-FITNESS-NOT-READY ... blocked` from the NVA-CF-VERIFYDEADLOCK block itself.

## Block 3 (NOT fixed): NVA-CF-VERIFYDEADLOCK (starts at original line ~2297; failing assertion at patched line 2330)
- Refusal code: ARCHITECTURE-FITNESS-NOT-READY, same production site (`architecture-entry-readiness.mjs` 461-470).
- Class: most likely FIXTURE, the same family as block 2 (a calibration seeded/committed after the architecture adoption without passing its bytes to `prepareCalibrationArchitectureFixture`). NOT confirmed: I did not read the block or print its outcomes (budget).
- Smallest fix to try: pass the seeded calibration bytes to `prepareCalibrationArchitectureFixture` in that block, as in block 2. Blocks after it were never reached; more red blocks may follow.

## Changed lines
Total 8 insertions, 3 deletions across both blocks (c1: +4/-2 net of comments; c2: block 2 adds the 3-line comment and moves one line). Well under the ~40 line bound.

## Apply check
`node scratch/agent-out/w7pt/driver.mjs check`: `git apply --check` of the patch in clone2 at the candidate, exit 0.

## Protected-path classification
`plugins/pipeline-core/scripts/pipeline-state.test.mjs` matches none of TP-1..TP-13 (TP-5 is `harness/scripts/pipeline-state.test.mjs`). No guard refusal; all edits were in the clone.

## Not done
- NVA-CF-VERIFYDEADLOCK and any later block (budget). No production file touched. No commit, no dispatch record (host commits). Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message
`test(pipeline-state): align the calibration fixtures with the owned path and design stop contracts`

## Operator flow
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pipeline-state-neutral-only-fixture-c2.patch` (do not also apply the c1 patch; c2 includes it), `git add -u -- plugins/pipeline-core/scripts/pipeline-state.test.mjs`, commit with `--no-verify` and the message above, then stamp and install.
