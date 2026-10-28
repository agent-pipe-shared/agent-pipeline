# Held patch: neutral-only decision summary expectation in pipeline-state.test.mjs (slice W7-PIPELINE-STATE-NEUTRAL-ONLY-FIXTURE-C1-20261027)

Candidate 2fb8a2e889f1edeebf179964ea5ca936d6bcb368. Patch: `w7-pipeline-state-neutral-only-fixture.patch` (git diff --binary from Node, one file: `plugins/pipeline-core/scripts/pipeline-state.test.mjs`, +4/-2). Driver: `scratch/agent-out/w7ps/driver.mjs` (untracked scratch). All runs in `git clone --shared --no-checkout` clones detached at the candidate (clone = patched, clone2 = unchanged baseline).

Targeted delivery: PARTIAL. The slice's own stale expectation is fixed and the whole file now gets past it; the file still aborts at a LATER, different case (see "Later red"), which was deliberately not fixed.

## Cause (recon re-verified)

The loop case labels `neutral-only`, `legacy-only`, `matching-dual` (test lines 2180-2221) plan `src/change.mjs` and call `prepareCalibrationArchitectureFixture`, whose design fixture materializes module `application` with `ownedPaths: ["src/**"]`. The planned path is therefore owned. Production puts an owned path into `areas` and only unowned paths into `unresolvedPaths`. Re-verification by run: the baseline abort prints actual `areas = [{area:"application",status:"ready",decisions:[],findingCount:0}]` against expected `[]` (line 2218). I did not re-read the production lines 229-234 or the sibling test lines 407-431 cited by the recon; the run output itself confirms the actual shape. The `unresolvedPaths` expectation `[]` is inferred from the recon and the production reading; the patched run passed line 2219 (the file advanced past the whole loop), which confirms it.

## Changed lines (test file, loop body, original lines 2218-2219)

- `areas` expectation: `[]` becomes `[{ area: "application", status: "ready", decisions: [], findingCount: 0 }]`.
- `unresolvedPaths` expectation: `["src/change.mjs"]` becomes `[]`.
- Both assertion messages reworded so they no longer claim the path is unowned.
- Two comment lines added naming the sibling `lib/architecture-entry-readiness.test.mjs` (owned versus unowned planned path) as the pin of the shape.
- Case, inputs and every other assertion unchanged.

QG-04 justification: a fixture-premise update, not a weakening. The old text pinned the pre-fixture premise (unowned path); the fixture now materializes a design package that owns `src/**`, and production behaviour is the one the sibling test pins. The new expectation is stricter in shape (exact area entry, exact empty unresolvedPaths).

## RED and GREEN (whole file, `node plugins/pipeline-core/scripts/pipeline-state.test.mjs`; the reporter is not TAP, the file aborts on the first uncaught assertion)

| Run | Tree | Exit | Result |
|---|---|---|---|
| base (RED) | clone2, candidate unchanged | 1 | ERR_ASSERTION `deepStrictEqual` actual `[{area:application,...}]` expected `[]` at line 2218 (case `neutral-only`) |
| green | clone, patched | 1 | ERR_ASSERTION `false !== true`, message "the fixture must reach the calibration writer after architecture preflight", at patched line 2289 (original line 2287), case under the NVA-B-CALIBRATION-PARTIAL-IO comment (lines 2241-2293) |

Failing-name sets (the file has no named test reporter; the failing unit is the abort location): baseline = {`neutral-only` loop case}; patched = {partial-calibration-io block}. The three loop cases (`neutral-only`, `legacy-only`, `matching-dual`) all passed in the patched run, since the abort is later in the file. No count lines exist because the file aborts before any summary.

Logs written by the driver: `scratch/agent-out/w7ps/base.pipeline-state.test.mjs.log`, `scratch/agent-out/w7ps/green.pipeline-state.test.mjs.log` (untracked).

## Later red (not fixed, recorded)

Block "NVA-B-CALIBRATION-PARTIAL-IO" (original lines 2245-2293): `assert.equal(injected, true, "the fixture must reach the calibration writer after architecture preflight")` fails; `injected` stays false, so `set-phase --phase implementation` in the ordinary CLI never reached the first calibration write (`captured.result` was 2, so the preceding assertion at 2286 passed: the CLI refused, but not at the injected writer). Classification: not determined between FIXTURE (stale against a later production change in the set-phase precondition chain) and PRODUCTION; I did not capture `captured.lines` (no budget for an instrumented run). It is not the owned-path stale-premise family (nothing about owned paths; a different mechanism, refusal before the calibration writer), so per the briefing it is NOT fixed. Next step for a follow-up slice: run the block with `captured.lines` printed to see which refusal precedes the writer (the loop cases above commit the calibration baseline and reach the writer successfully, so compare that block's setup with them).

Everything after that block (the NVA-CF-VERIFYDEADLOCK block onward) was NOT REACHED in either tree.

## Apply check

`node scratch/agent-out/w7ps/driver.mjs check` runs `git apply --check` of the patch in clone2 at the candidate: exit 0.

## harness/scripts/pipeline-state.test.mjs

Named only, not read, not run, not edited: a different file (TP-5 protected). The recon reports that the composed verify note says it aborts identically; unverified by me.

## Protected-path classification observed

`plugins/pipeline-core/scripts/pipeline-state.test.mjs` is not matched by TP-1..TP-13 (TP-5 matches only `harness/scripts/pipeline-state.test.mjs`). No guard refusal occurred; all edits happened in the clone via the Node driver.

## Not done

- The later partial-calibration-io red is not fixed or diagnosed beyond the above.
- Blocks after it never ran.
- No production file touched. No commit, no dispatch record (host commits).
- Independent Critic review stays a parent-owned batch gate; Full Verify and PO acceptance pending.

## Proposed commit message

`test(pipeline-state): expect the owned planned path area in the neutral-only decision summary`

## Operator flow

Apply the patch diff in the repository (`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pipeline-state-neutral-only-fixture.patch`), `git add -u -- plugins/pipeline-core/scripts/pipeline-state.test.mjs`, commit with `--no-verify` using the message above, then stamp and install per the usual operator steps.
