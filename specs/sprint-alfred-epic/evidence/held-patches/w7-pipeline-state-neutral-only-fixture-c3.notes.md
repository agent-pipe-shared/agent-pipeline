# Held patch c3: calibration fixtures in pipeline-state.test.mjs (slice W7-PIPELINE-STATE-NEUTRAL-ONLY-FIXTURE-C3-C1-20261027)

Candidate fcb2cfbf8e5cc6b87fe160778b40dbfd1b298676. Patch: `w7-pipeline-state-neutral-only-fixture-c3.patch` (git diff --binary from Node; complete, INCLUDES c1 and c2; one file `plugins/pipeline-core/scripts/pipeline-state.test.mjs`, +14/-5 total). Driver `scratch/agent-out/w7pu/driver.mjs` (untracked scratch). Clones: `git clone --shared --no-checkout`, detached at the candidate; clone = patched, clone2 = unchanged baseline.

Targeted delivery: GREEN. The whole file now runs to the end (exit 0, line `pipeline-state.test.mjs (CB-1a): all checks passed`). Last block reached: the final one. No block left unreached.

## Whole-file results (reporter is not TAP; aborts on the first assertion, no counts)

| Run | Tree | Exit | Result |
|---|---|---|---|
| base | clone2, unchanged candidate | 1 | `deepStrictEqual` at line 2218, case `neutral-only` (areas actual `[application...]` vs expected `[]`) |
| c2 + block-3 start fix | clone | 1 | step 5 of NVA-CF-VERIFYDEADLOCK (line 2376, `2 !== 0`) |
| final | clone, c3 | 0 | `all checks passed` |

Failing-name sets: baseline = {neutral-only loop case}; patched = {} . Logs (untracked): `scratch/agent-out/w7pu/base.*.log`, `green.*.log`, `green2.*.log`. Note: because the file aborts on first failure, the baseline set cannot show later failures; the c2 notes record the staged progression.

## Block 3: NVA-CF-VERIFYDEADLOCK (two stale-fixture spots, both FIXTURE class)
Production site for both refusals: `architecture-entry-readiness.mjs` ~461-470 (ARCHITECTURE-FITNESS-NOT-READY, profile drift). The refusal code of the first spot was inferred from the identical stderr line before the abort and from the block-2 probe in c2; the second spot's refusal printed the same ARCHITECTURE-FITNESS-NOT-READY line (green.log, last stderr line before the abort).
- (a) Start of block: `prepareCalibrationArchitectureFixture(root)` ran before the calibration was written/committed. Change: build `calibration` first and pass `JSON.stringify(calibration, null, 2) + "\n"` (same bytes the block writes). 
- (b) Step 5 (idempotent replay): step 3 legitimately rewrites `project/pipeline.json` (set-phase --verify-command), changing bytes the adopted profile binds. Change: re-run `prepareCalibrationArchitectureFixture(root, <current project/pipeline.json bytes>)` before the replay. Classification caveat: arguably a PRODUCTION design question (the sanctioned verify-command write itself causes drift for later re-entry in a real project); I did not investigate or change production. The fixture re-adoption keeps every assertion intact and reaches the replay assertion through the current gate. Parent should decide whether the product behaviour is intended.
- QG-04: both are setup-order corrections with written comments; no assertion weakened, skipped or deleted.

## Changed lines
Total +14/-5 (c1 + c2 + block 3). Under the ~45 bound.

## Apply check
`node scratch/agent-out/w7pu/driver.mjs check`: `git apply --check` in clone2 at the candidate, exit 0.

## Protected-path classification
`plugins/pipeline-core/scripts/pipeline-state.test.mjs` matches none of TP-1..TP-13. No guard refusal; edits only in the clone.

## Not done
No production file touched; no commit, no dispatch record (host commits). Full Verify, independent batch Critic review and PO acceptance stay parent-owned and pending. The production question in (b) is open.

## Proposed commit message
`test(pipeline-state): align the calibration fixtures with the owned path and design stop contracts`

## Operator flow
`git apply specs/sprint-alfred-epic/evidence/held-patches/w7-pipeline-state-neutral-only-fixture-c3.patch` (not together with c1/c2; c3 includes them), `git add -u -- plugins/pipeline-core/scripts/pipeline-state.test.mjs`, commit with `--no-verify` and the message above, then stamp and install.
