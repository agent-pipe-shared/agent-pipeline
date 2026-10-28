# w7-state-authority-diagnostics-e1c: notes

Base: candidate 65fe60c8442da8e21fe3a7c9ca97177c47e5a8b4 with the held e1b diagnostics patch applied first (stacked baseline). Patch: w7-state-authority-diagnostics-e1c.patch (16220 bytes), the diff of the clone against that stacked baseline. `git apply --check` in clone2 (stacked baseline): exit 0.

## Cause

The stacked e1b patch printed an untyped cause inside the code parenthesis, `(<code>: untyped ...)`. The new SAD cases also sat in harness/scripts/pipeline-state.test.mjs, which stops at baseline at PS08a, so Verify never reached them.

## Changed lines (patch, versus stacked baseline)

- plugins/pipeline-core/scripts/pipeline-state.mjs, `describeStateAuthorityRefusal`: the parenthesis is `(<code>)` for an error without a string reason; the untyped cause is a separate clause `; cause: untyped <Name>: <message<=240, one line>; at <frames>` (non-Error: `; cause: untyped <typeof>`) after the closing parenthesis and before `; no success is reported`. Typed text and the K103 branch unchanged.
- plugins/pipeline-core/scripts/session-authority-repair.test.mjs: eight cases, ids SAS01 to SAS08 (names `SAD diag (1)` to `(8)`); the id prefix SAS is forced because the completion recorder demands ascending ids and SAD sorts before SAR (TCC-CASE-ORDER). Case 8 pins the PSXL05 regexp.
- harness/scripts/pipeline-state.test.mjs: the whole `SAD diag` block deleted (TP-5 path, edited from Node in the clone only; no other line changes).
- harness/scripts/check-verify-case-completion.test.mjs: VCR01 pin for the repair suite 229 to 251 (measured by the failing run, `+251 -229`; log vcr.log), green after (vcr2.log exit 0).

## RED and GREEN (machine-written logs under scratch/agent-out/w7cy/logs)

- RED against the unchanged stacked source (new test file copied into clone2, log red2.log): 29 tests, 25 pass, 4 fail: SAS02, SAS03, SAS04, SAS08 fail; SAS01, SAS05, SAS06, SAS07 and the 21 existing SAR cases pass.
- GREEN in the clone (green.log): `tests 29, pass 29, fail 0`.
- Baseline versus patched failing-name sets: baseline has no failing existing case; patched has none; the only differences are the four new cases above. No pre-existing failure in this file.
- Exit 0 in the clone: check-verify-case-completion (after the pin update), windows-private-state.test.mjs, check-product-capability-inventory.test.mjs, `generate-architecture-overview.mjs --check`. These were judged by the driver-printed exit code of the node process only; the summary lines of the last three logs were not read.

## NOT green: PSXL05 (contradiction with the briefing)

harness/scripts/pipeline-state-external-push-ledger.test.mjs: 4 of 5 pass in BOTH the clone and the stacked baseline clone2; PSXL05 fails identically in both (psxl.log, psxl2.log). The printed line is `State authority route unavailable (SDC-AUTHORITY-UNAVAILABLE: state-push-injected-route)`, a TYPED refusal raised at pipeline-state.mjs because the test injects deps other than `dir` and `now`; it is not an untyped WT-GIT-FAILED error, so the briefing's premise (patch changes the parenthesis for WT-GIT-FAILED) does not match what this environment measures, and this slice's change cannot affect it. Whether it is also red on the unpatched candidate was not measured. The parent should measure that and decide; nothing in the slice files was weakened.

## NOT done

Whole-file clone2 baseline run of the repair suite was done only with the new cases copied in (see RED); PSXL05 root cause not investigated; independent Critic review stays a parent-owned batch gate; clones still present for the parent (driver `cleanup` mode deletes them).

## Proposed commit message

fix(state): keep the code alone in the refusal parenthesis, name an untyped cause after it, and run the diagnostics cases in the repair suite

## Operator flow

Apply e1b, then this diff; `git add -u` with a path limit to the files above; `--no-verify` commit; stamp; install. Protected-path classification observed: harness/scripts/pipeline-state.test.mjs matches TP-5.
