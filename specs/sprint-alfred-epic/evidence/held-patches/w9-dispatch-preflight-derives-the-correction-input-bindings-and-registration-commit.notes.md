# Held patch notes: D223 slice 3, the Critic dispatch preflight derives the bindings and the registration commit

Patch: `w9-dispatch-preflight-derives-the-correction-input-bindings-and-registration-commit.patch` (cumulative diff of the prepared clone against the stacked candidate in `scratch/agent-out/w15pre/cand.txt`, slices 1, 2 and 5 already applied).
Status: implementation complete, targeted delivery green; batch Critic, Full Verify, native runs and PO acceptance are pending and parent-owned.

## The chain, step by step (test: `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs`, cases named `W9 SLICE 3 ...`)

One temporary git repository per case, shaped like a consumer. Real entry points: the spawned CLIs (`critic-dispatch-preflight.mjs`, `critic-correction-input-bindings.mjs`, `dispatch-record-write.mjs`, `close-coordinator.mjs`, `session-critic-finalizer.mjs export`) or the exported function a CLI calls.

`CHAIN` (derived mode: the caller passes NO bindings file and NO registration commit):
1. Round 1, full: correction-free range; diagnostic registered and committed; preflight without `--registration-commit`; admission; finalizer writes the lineage (slice 1); the lineage is committed (the commit guard predicate runs at the real staged index for every later correction).
2. Correction commit; diagnostic registered and committed; the delta input file does NOT exist: `addCriticDeltaRequest` writes a path skeleton and refuses (`FPR-DELTA-INPUT-PATH`, `skeletonWritten`, `coordinatorJudgment`); the unchanged skeleton refuses again (`FPR-DELTA-INPUT-SHAPE`) and is byte-identical afterwards; the Coordinator fills the four judgment fields and the invariant lists; the verb succeeds and its files are committed.
3. Round 2, delta: preflight with `--delta-request` only (no registration commit, no bindings file). The echoed `coordinatorOnly.courseAdmission.registrationCommit` equals the commit the registration verbs produced; `correctionInputBindings` is `{ path: null, derived: true, digestSha256, bindings }`, its digest equals the derive verb's digest for the range and `bindings` equals the document the verb writes.
4. Admission, consumed result, finalizer (lineage written), residual acceptance of the minors (chat seam), lineage committed.
5. Round 3, effective FULL round (trust-boundary delta, RE-DELTA-FALLBACK-FULL): the range genesis..candidate contains project-state paths and, in the correction commit, `docs/HISTORY.md`, `docs/state-archive/2026-10.md` and `lib/command-history.mjs`. No bindings file, no registration commit. Admitted. `docs/HISTORY.md` and the archive file are `project-state record` exclusions with no calibration entry (the calibration lists only `docs/findings.md`); `lib/command-history.mjs` is a source path (variants 5 and 7).
6. Finalizer, addendum for the slice record, `close-coordinator plan-transition feature-close-prepared` plans and applies.

Negative variants (exact codes asserted):
- (1) a bindings file the caller passes for another range: `CDP-CORRECTION-INPUT-STALE`.
- (2) a rename from a source file onto `docs/HISTORY.md` (crosses classes): `CDP-CORRECTION-INPUT-REFUSED` (derivation refusal CCI-MIXED).
- (3) two commits qualify (the registration commit and a later evidence-only registration commit): the existing typed argument refusal `CDP-ARGUMENT` "An exact registration commit is required." extended with `reason` and `registrationCommitDerivation { status: "ambiguous", commits }`; nothing is guessed and the packet control root is unchanged; passing either commit explicitly is still honoured.
- (4) an existing delta input of the wrong shape: `FPR-DELTA-INPUT-SHAPE`, file bytes unchanged.
- (6) a range changing `docs/history-notes.md`: `CDP-HISTORY-IN-RANGE` with `paths`, `reason`, and the repair naming `criticFindingRecordPaths` in `project/pipeline.json` and its byte-equal mirror `.claude/pipeline.json`; the packet control root listing is unchanged (no packet, no reservation); the same range with the path listed in BOTH calibration mirrors (committed in the base) is admitted as a `finding-disposition record` exclusion.

Seams (named, not hidden): the Critic model call (fixed verdict), the PO residual acceptance (chat mode writer), the Critic's own dispatch record, the guard adapter (the exported predicate the commit-msg hook calls; the hook adapter has its own real-commit case from slice 1), and the delta verb called as the exported function `register-feature-package.mjs` calls (the CLI also needs the project authority State, which a consumer fixture here does not carry). Nothing needing a real signature, a native host or a model call remains in the walk.

Which step was red first: all five positive/negative cases that needed derivation were red at round 1 of the original code (the preflight demanded `--registration-commit`); variant (4) passed on the original code (a pin, not a change). Red log: `scratch/agent-out/w15pre/red1.critic-course-consumer-chain-walk.test.mjs.log` (5 failed of 6).

## Production files changed, and why

- `plugins/pipeline-core/scripts/critic-dispatch-preflight.mjs` (guard kernel list): (A) with no bindings file, an in-memory derivation is returned as `{ path: null, derived: true, digestSha256, bindings }`; a given file is still compared and refused STALE; the derivation refusal stays REFUSED; REQUIRED can no longer occur. (D) `CDP-HISTORY-IN-RANGE` raised right after the derivation succeeds (before course admission, never deferrable by the D204 deferral). (B) `parseCriticDispatchPreflightArgs` derives the registration commit when no `--registration-commit` (and no `--accepted-contract`) is given; the result echoes `courseAdmission.registrationCommit`. No write API, no new import except the two exported helpers below; the GST33/D216-A closure pins in `critic-dispatch-preflight.test.mjs` stay green.
- `plugins/pipeline-core/lib/critic-correction-input-bindings.mjs` (guard kernel list): built-in convention set `docs/HISTORY.md` and `docs/state-archive/` as role `project-state record` (exports `PROJECT_STATE_CONVENTION_FILES`, `PROJECT_STATE_CONVENTION_DIRECTORIES`); `historyPathsInBindings(document)` = source paths whose basename matches `^history[^/]*\.(md|markdown|txt)$` case-insensitively. The `derive` verb itself never refuses a history path.
- `plugins/pipeline-core/lib/critic-course-admission.mjs` (guard kernel list): new export `deriveCriticCourseRegistrationCommit` (read-only; no new module, so no change to `NEVER_LIFTABLE_KERNEL_PATHS` or the threat model).
- `plugins/pipeline-core/lib/feature-package-registration.mjs`: `addCriticDeltaRequest` runs its input-independent checks (feature, lineage, correction commit) first, and for a missing input file writes the skeleton with flag `wx` and refuses.
- `plugins/pipeline-core/scripts/register-feature-package.mjs`: help text names the skeleton route.
- `harness/review-protocol.md` section 2.2: project-state record now names the convention set, the early report, the derived bindings.
- `plugins/pipeline-core/scripts/critic-dispatch-preflight.test.mjs`: two cases restated, `CCI preflight (2)` and `(5)` (intent: the range with project-state or retained paths is always bound; route changed from "refused REQUIRED" to "derived and reported"). Titles say so. Case count unchanged (89).
- `plugins/pipeline-core/lib/pins/critic-course-consumer-chain-walk.test.mjs`: six new cases and the walk options `derived`, `skeletonDelta`, `extraCorrectionFiles`, `listedExtra`, `duplicateDiagAtRound`; nothing existing was altered except new optional parameters.
- Unchanged though in scope: `scripts/critic-correction-input-bindings.mjs`, `lib/review-admission-read.mjs` (read to confirm; the rules needed are in the admission module), `skills/critic-review/SKILL.md`, `templates/prompts/critic-review.md`, `harness/scripts/check-verify-case-completion.test.mjs`.

## The exact rule for the derived registration commit

Inputs: feature id (from the spec path), base commit, candidate commit, the delta request path if any. The possible commits are the commits after the candidate on the way to `HEAD` (`range(candidate, HEAD)`, at most 32). A commit qualifies when `readCriticCourseAdmission` called with it as `registrationCommit` returns `decision.status === "admitted"`. That one call applies every registration rule the admission has (transport of candidate..commit through evidence-only commits only, the registered diagnostic evidence of the candidate, the registered delta request when a path is given, the registered history). Exactly one qualifies: derived. None: nothing changes (no selectors: today's behaviour, candidate as registration commit; with `--delta-request`: today's `CDP-ARGUMENT`). More than one: refused `CDP-ARGUMENT` with the candidates listed; never the latest. It is derived at parse time (`parseCriticDispatchPreflightArgs`, the CLI and parse layer) so the explicit commit reaches admit, finalize and the reservation unchanged; a library caller of `preflightCriticDispatch` that passes a `courseContext` must still supply the commit (the closed-shape check is unchanged). Limits, stated: the derivation is skipped when `--accepted-contract` is given (that file is hashed at the registration commit during parsing, so the commit must be explicit), and a candidate-to-HEAD chain of more than 32 commits falls back silently to today's behaviour.

## Behaviour to be aware of

`writeDeltaInputSkeleton` creates the parent directories of the named input path before it writes the file (flag `wx`, never overwriting), for any absent repository-relative path the caller names; a mistyped path therefore creates a file and directories. This follows the briefing (the skeleton sits at the expected input path); the Coordinator may decide to constrain it to `scratch/`.

## Revert proof

Driver mode `revert` reverts all seven production files at once (it has no per-file mode), runs the named file, and restores them byte-equal; the result is recorded under Evidence below.

## Callers and the tests that pin them

- `preflightCriticDispatch` result (`correctionInputBindings` shape, `courseAdmission.registrationCommit`): `critic-dispatch-preflight.test.mjs` (89 green), `session-critic-finalizer.test.mjs`, walk pin. A given file keeps `{ path, digestSha256 }` byte for byte (CCI preflight (3)).
- `deriveCriticCourseRegistrationCommit`: only the parser; pinned by the walk (CHAIN, NEG 3).
- `addCriticDeltaRequest`: walk, `critic-course-admission.test.mjs` (PF94 DELTA (a)-(i), green; the absent-file case keeps its code `FPR-DELTA-INPUT-PATH`, which is why the skeleton refusal reuses that code and carries `skeletonWritten`).
- classification (`classify`): derive verb, preflight, finalizer; pinned by walk and CCI cases.

## Needs a change OUTSIDE the write scope (named, not made)

1. `plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs`, case `D1 walk (1) admit without the bindings field is refused and the detail names the derive command`: red by construction (admit without bindings is now admitted with derived bindings). Restate it like CCI preflight (2): admit succeeds and the packet binds the derived echo. This is the only failing name in that file (clone vs baseline compared from finished logs).
2. Doc parity: the canonical `templates/prompts/critic-review.md` (root) and its vendored copy `plugins/pipeline-core/templates/prompts/critic-review.md` must carry the SAME new sentence or `check-vendored-template-sync.test.mjs` and the pin `CCI canon names the project-state record role ...` go red; the root copy is outside this write scope, so neither copy was edited here. Text to apply to both, replacing "handover/state file and a `pipeline-handover*.md` file in the same directory;" by "handover/state file, a `pipeline-handover*.md` file in the same directory, and the built-in convention set `docs/HISTORY.md` and everything under `docs/state-archive/` (no calibration entry); the dispatch preflight refuses any other history-named markdown or text file in the range before a packet is reserved (CDP-HISTORY-IN-RANGE);". The reader-input manifest pins `harness/reader-review-protocol.md`, not `harness/review-protocol.md`; the `check-doc-contracts`, `check-critic-contract-citations`, `check-critic-fail-closed` and the CCI canon pins were run green with the protocol edit (see Evidence); any digest-pinned doc snapshot is a Coordinator assembly step.
3. `plugins/pipeline-core/skills/critic-review/SKILL.md` (not edited, as briefed): the operator note (about line 335) and the course steps (about lines 133, 174, 198) still say derive the bindings and pass them, and pass `--registration-commit`; both stay valid, but they should say "optional: the preflight derives both when omitted; a history-named file is refused with CDP-HISTORY-IN-RANGE; the delta input may be a skeleton the verb writes". Same sentence in `scripts/critic-diagnostic-evidence.mjs` line 42, `scripts/push-prepare.mjs` line 717 and `register-feature-package.mjs` help steps 6 and 8.
4. `session-critic-finalizer.mjs` `featureReservationFor` rebuilds the course input from `preflightInput.courseContext`; a JSON request file (`review.courseContext` with an explicit registration commit) is unaffected, but a request that omits the commit cannot be expressed (its validator requires the key). Follow-up: read the commit from `preflight.coordinatorOnly.courseAdmission.registrationCommit`, now echoed.

## Pinned counts (VCR01, not edited)

`critic-dispatch-preflight-tests`: baseline actual 373, with this slice 378 (+5 top-level assertions from the two restated cases); pinned 352 (stale from earlier slices in the baseline too). `critic-course-admission-tests`: 334 both, unchanged by this slice. The walk pin is not in the registry list. VCR01 stays red in the baseline and here for the earlier slices; the Coordinator sets all numbers once.

## Evidence (machine-written logs under `scratch/agent-out/w15pre/`, driver `driver.mjs run LABEL FILE`, node `--test`; exit 0 unless stated)

- New cases RED on the original code: `red1.critic-course-consumer-chain-walk.test.mjs.log`, exit 1, 5 of 6 failed.
- New cases GREEN: `green2.critic-course-consumer-chain-walk.test.mjs.log`, pass 6 / fail 0. Whole walk pin, clone: `c1.` and `c4.critic-course-consumer-chain-walk.test.mjs.log`, pass 21 / fail 0; baseline `base1.`: pass 15 / fail 0.
- Revert proof (all seven production files reverted at once, driver `revert`): `revert.critic-course-consumer-chain-walk.test.mjs.log`, exit 1, five cases red (CHAIN, NEGATIVE 1, 2, 3, 6), NEGATIVE (4) green (a pin of existing behaviour); `restored byte-equal: true`.
- `critic-dispatch-preflight.test.mjs` (includes the GST33 and D216-A closure pins): `c3.` pass 89 / fail 0 (baseline `base1.` 89 / 0). Before the two restatements `c1.` showed exactly CCI (2) and (5) red.
- `critic-course-admission.test.mjs`: clone 82 / 0, baseline 82 / 0. `critic-diagnostic-evidence.test.mjs`: clone 18 / 0, baseline 18 / 0.
- `session-critic-finalizer.test.mjs`: clone 90 pass / 1 fail (`D1 walk (1)`), baseline 91 / 0; the single delta is the out-of-scope case named above.
- `project-onboarding-v3.test.mjs`: file-level failure identically in clone and baseline (pre-existing, same failing set).
- `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs`: 29 / 0 (`c7.`). CCI canon pin (`opus-critic-only-batched-for-architecture-and-security.test.mjs`), `check-vendored-template-sync`, `check-doc-contracts` (76 / 0), `check-critic-contract-citations`, `check-critic-fail-closed`: green with the final state (`c8.`, `c2.`).
- `check-verify-case-completion.test.mjs`: VCR01 red in clone and baseline (briefing-declared; see pinned counts).
- Patch: `driver.mjs patch` wrote the patch (8 files, 319 insertions, 32 deletions), `git apply --check` on the plain baseline clone exit 0.

## Not verified

Native host runs, a real consumer repository, real signatures, a real Critic model call, the CLI route of the delta verb with an authority State, Windows. Full Verify, batch Critic and PO acceptance are pending.
