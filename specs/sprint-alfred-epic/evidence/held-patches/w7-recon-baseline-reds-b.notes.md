# Recon: baseline-red test files, family B (notes only, no patch)

Candidate 1c0d8068cea305d5649a589cfd71587bf0d8f42c; scratch clone (git clone --shared --no-checkout, detached at the candidate).
Each file run once with `node <file>` in the clone; logs written by the driver. Tool budget ended at call 40: some items are NOT REACHED.
The write-scope test file (windows-private-dacl-...test.mjs) was run once, untouched: 6/6 pass, exit 0. RED/GREEN DoD rows are not applicable to a notes-only recon.

## A. plugins/pipeline-core/scripts/pipeline-state.test.mjs (abort at line 2218, case `neutral-only`)

| Item | Finding |
|---|---|
| Class | FIXTURE (stale expectation); production is on-contract |
| Evidence | Test line 2191 plans `src/change.mjs`; line 2192 calls `prepareCalibrationArchitectureFixture` (test line 47-60) which calls `materializeArchitectureDesignFixture` (test line 57) with `sourcePath: "src/change.mjs"`. The fixture (`lib/architecture-design-test-fixture.mjs` lines 132, 173) writes module `application` with `ownedPaths: ["src/**"]`, so the planned path is OWNED. Production `inspectPlanningDecisionApplicability` (`lib/architecture-entry-readiness.mjs` lines 229-234) puts an owned path into `areas` and only unowned paths into `unresolvedPaths`; `summarizePlanningDecisionApplicability` (250-261) emits `{area,status,decisions:[],findingCount}`. Sibling `architecture-entry-readiness.test.mjs` lines 407-431 pins exactly this shape (owned -> area entry; unowned `docs/unowned-note.md` -> unresolvedPaths). The assertion message ("unowned planned path") describes a premise removed when the fixture started materializing a design package. |
| Smallest fix | Test-only, lines 2218-2219 of `plugins/pipeline-core/scripts/pipeline-state.test.mjs`: expect `areas` deepEqual `[{area:"application",status:"ready",decisions:[],findingCount:0}]` and `unresolvedPaths` deepEqual `[]` (line 2219 not reached by the run, so the second change is inferred from the production code); reword the messages. Justification for QG-04: a fixture-premise update, the behaviour is the one the sibling test pins. Not protected: TP-5 matches only `harness/scripts/pipeline-state.test.mjs`. |
| Confidence | High on class; medium that lines 2218-2219 are the only breakage after the abort (later loop items `legacy-only`, `matching-dual` and the rest of the file were never reached) |
| Not reached | `harness/scripts/pipeline-state.test.mjs` (TP-5 protected; the composed verify note says it aborts identically) was not run. |

## B. plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs

Exit non-zero. 39 checks; custom reporter (`ok N` / `not ok N`, not TAP-by-test-runner). 14 not ok:
7 production adapter gives a slow push guard its dedicated share; 8 Bash, apply_patch, Edit and Write each reach their intended guard family; 9 multiple Bash guard denials are aggregated into one Codex decision; 15 attended Human override admits only the exact next tool call and is then consumed; 16 ADR-0059 Decision 4 continuation names the configured mode's final step; 17 Pipeline Author Repair selects one exact source root; 18 local plugin-cache installation offers the HGO route; 19 a safe Bash local-plugin-install denial does not expose the original command; 20 a secret-bearing cross-repository denial never carries the secret; 21 override persistence failure remains a sanitized fail-closed denial; 22 Codex routes a documented Git override prefix to the Push-Gate command; 28 Codex adapter records a dispatched agent's receipt before its first absolute-path Write; 38 NVA-CROSSREPOGUIDANCE-1 ordinary in-root denial.

| Item | Finding |
|---|---|
| Class (read errors: 8, 9 and the ready-fixture consumers) | FIXTURE. `createReadyLifecycleFixture` fails at test line 306-308: `assert.equal(designStop.nextAction?.kind, currentDesignAuthoring ? "design-authoring-required" : "architecture-design-required")`. Actual `design-authoring-required`, expected `architecture-design-required`: the fixture's `currentDesignAuthoring` flag is false while the lifecycle now answers the design-authoring stop (intake diagnostic `intake_design_authoring_required`, "generated PRD and Spec still contain draft framing"). Stack: `readyLifecycleFixture` test line 392 -> `createReadyLifecycleFixture` line 306. Where `currentDesignAuthoring` is computed was NOT read. |
| Other names | Probably the same cause for the other names that use `readyLifecycleFixture` (15-22, 28, 38; the log lists them), but only the errors of 8 and 9 were read. Name 7 (slow push guard share) was NOT read: could be ORDER/timing/ENVIRONMENT. ENVIRONMENT variables in play: PATH is prefixed with a fixture `codex` binary (test line 42), `PIPELINE_CODEX_PRETOOL_TEST_FILTER`/`_SHARD` select the sharded workers; no environment variable was found causing a failure. |
| Smallest fix | Test-only, in `createReadyLifecycleFixture` near test line 306: derive the expected kind from the actual current behaviour (set `currentDesignAuthoring` true, or follow the design-authoring stop before the acknowledgement writer, as the sibling pipeline-state fixture does). Not in TP-1..TP-13. |
| Confidence | Medium on 8/9, low on the rest and on name 7 |

## C. "sanctioned-args-scripts" red from the composed verify note (lines 55-110 / line 61)

The note says "remaining reds (Q9 D55 in the library suite, codex-pretool-guard, sanctioned-args-scripts)". No test file of that name exists; `sanctioned-args-scripts.mjs` is a library module. All six importers (rg `sanctioned-args-scripts` in `*.test.mjs`) and `lib/guard/devplan-shell-sanctioned-recovery.test.mjs` were run once:

| File | Result |
|---|---|
| hooks/design-approval-command-admission.test.mjs | 13/13 pass |
| lib/guard/audit-pack-command-admission.test.mjs | 3/3 pass |
| lib/pins/catalogue-admit-prescribed-lifecycle-verbs.test.mjs | exit 1, 1 red: `D64 model-role bootstrap admits a host session and is a decision, not an admission: it stays refused here`, assertion strictEqual actual true expected false at test line 555 (via `withFixture` line 101) |
| lib/pins/denial-names-a-diagnosis-it-refuses.test.mjs | 13/13 pass |
| lib/pins/lifecycle-coordination-commands-refused-as-implementation-writes.test.mjs | exit 0 (1 skipped; stray `git` HEAD errors in fixture output) |
| lib/pins/preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt.test.mjs | pass (11 win32-only skipped) |
| lib/guard/devplan-shell-sanctioned-recovery.test.mjs | 36/36 pass |

Finding: the only red among the importers is `catalogue-admit-prescribed-lifecycle-verbs.test.mjs` D64 (this matches the "catalogue-admit D64 (1)" baseline red already named in the composed verify note line 97), so that is most likely the file meant. Class: not determined (assertion at test line 555: the model-role bootstrap command is now admitted where the test expects refusal; FIXTURE versus PRODUCTION undecided, the guard command catalogue was not read; a D-numbered decision on model-role bootstrap admission may have superseded the pin). Smallest fix: NOT REACHED. Confidence: medium on file identity, none on class.

## Not reached, overall
Class of D64; `currentDesignAuthoring` source and errors of names 7, 15-22, 28, 38 of the codex suite; pipeline-state loop items after `neutral-only`; `harness/scripts/pipeline-state.test.mjs`; no fix applied or run; no patch, no clone2.
