# W7 D195 held patch: a check may name a registered consumer Verify command id

Candidate 8c4591333e4dace3ab09db3418205bcc9201e2dc. Held patch, nothing applied or committed. Targeted delivery: green for the focused suites below; Full Verify, batch Critic and PO acceptance stay pending.

## Contract as built
Additive command form `{id, path, command, dependencies}` next to the unchanged `.test` form `{id, path, dependencies}`.
- `command` is a command id registered in the project calibration under `verifyImpact` (baseline or an area); `path` is the calibration file (`resolveAuthorityArtifactPath('calibration').relPath`).
- Rule 1: the calibration path is in dependencies and NOT in allowedPaths; every allowed path is a dependency (`assertBindingInvariants`, new code `DBG-CHECK-COMMAND-PATH-WRITABLE`; also refused when passed as `--path`).
- Rule 2: a delivery whose changed paths include the calibration of a command check is refused at first delivery (`executeGovernedItemDeliveryChecks` gets an optional `baseCommit`; `completeNativeGoldfishAuthority` passes `pending.binding.candidateCommit`; refusal reason `native-item-check-source-amendment-required`) and at recheck (the existing line-1414 route already covers it because the check path is the calibration).
- Rule 3: the host re-reads `readConsumerVerifyConfiguration(primaryRoot)` at execution time, selects the entry by id (fault `item-check-command-unregistered`), spawns exactly `entry.command` with shell true, same cwd, env, timeout and maxBuffer; the result row carries `commandId` and `command` instead of `executable`/`args`. The existing before/after snapshot covers path and dependencies, so the calibration digest binds the run.
- Admission: `binding --check command:<id>` and a package `check: "command:<id>"` (unknown id: `DBG-CHECK-COMMAND-UNKNOWN` with a repair naming `verifyImpact.baseline` and committing the calibration). Hand-off readiness scans `command:<id>` tokens in the Spec; an unregistered or unreadable one is `PLR-HANDOFF-CHECK-UNREGISTERED` (new code plus repair entry); ready checks get `{command, state:'registered'}` only when such tokens exist.
- Validator (`validateItemDeliveryBriefing`): exact 3-key `.test` form, or exact 4-key form with a VERIFY_ID-shaped `command`, a normalized `path` that is also in dependencies.
- Host-state lines `spawnSync(process.execPath,['--test',...` and the `native-item-check-source-amendment-required` line are byte-identical (the command branch sits before them); the source-regex pin passes unchanged.

## Changed files (clone, travel in the patch; line counts from the patch stat)
- `plugins/pipeline-core/scripts/dispatch-briefing.mjs` (+44/-?): flag form, refusals, invariants branch, check object, drift repair text, help line.
- `plugins/pipeline-core/lib/native-goldfish-host-return.mjs` (+12): `validCheckForm`.
- `plugins/pipeline-core/lib/plan-handoff-readiness.mjs` (+20): COMMAND_TOKEN, code, repair, entries.
- `plugins/pipeline-core/lib/native-goldfish-host-state.mjs` (+23): command branch, `baseCommit` diff refusal, call site.
- `plugins/pipeline-core/lib/dispatch-briefing-build.mjs` (+4, clone-only scope extension granted by the Elephant): `namedPackagePaths` skips the existence check for a `command:` check.
- Tests appended at the end of each file: `dispatch-briefing.test.mjs` (5 cases incl. the package route), `native-goldfish-host-return.test.mjs` (NGHR09), `native-goldfish-host-state.test.mjs` (NGHS54-57 plus helper `commandCheckHarness`, real calibration), `pipeline-state.test.mjs` (hand-off case R7; this is the suite that tests `inspectPlanDeliveryHandoff`).

## RED to GREEN
- RED on the candidate code (red1 logs): dispatch-briefing 3 command cases, NGHR09, NGHS54-57 (R7 run was contaminated by the in-flight edit; its RED is shown by the revert proof).
- GREEN in the clone: dispatch-briefing 107 pass / 0 fail (log c1b), host-return 9/0, host-state 62/0 (NGHS54-57 pass), pipeline-state R7 PASS and the R1-R6 line, regression 3/0, agy-item-delivery 6/0, slice-queue 40/0, source-regex pin 30/0, first-item host-commit pin 8/0, governed-check-child pin 2/0, finalizer 27/0.
- One fixture change after RED: the "calibration as --path" case injects `calibrationRelPath: () => "project/pipeline.json"` (a bare fixture root resolves another default calibration path); hermeticity, not a weaker assertion.

## Clone versus clone2 failing-name sets (compare.mjs, finished logs)
Failing only in the clone: none (after the c1b rerun of dispatch-briefing). Both trees: `three-runner-happy-path-with-two-po-approvals.test.mjs` 22 tests, 18 pass, 3 fail, identical failing names (baseline failures, not caused by this patch). In the first c1 log dispatch-briefing showed 1 failing case, which is the fixture-path case fixed before c1b.

## Revert proof (production files reverted to the candidate, new-case suites run, then restored byte-equal)
- dispatch-briefing: 103 pass / 4 fail, the 4 failing are exactly the new command cases (3 binding cases plus the package-route case); the `.test`-form case still passes.
- host-return: NGHR09 fails.
- host-state: 58 pass / 4 fail, exactly NGHS54-57. pipeline-state: R7 FAILS (PASS line absent, aggregate assertion names R7).
- After the proof the production files were restored byte-equal; the final `driver patch` reproduced the same 40391-byte patch, apply-check exit 0 on clone2.

## Not verified
A real non-Node consumer run; Windows. `repository.candidate` at the finalizer call site containing the host commit was not shown live; if it did not, the first-delivery diff is a no-op, but the calibration is not in allowedPaths and so cannot appear in a valid return (`changedPaths` must be a subset of allowedPaths) and the recheck route refuses it. `COMMAND_TOKEN` can match prose `command:word` in a governed Spec; the three-runner pin fixture is unaffected.

CONTINUATION CARD -- done: everything above; remaining: nothing in scope beyond the host-state and pipeline-state revert line; next step: Elephant applies the bundle in the PO ceremony.
