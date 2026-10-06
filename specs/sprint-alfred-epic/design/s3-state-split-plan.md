# S3 plan: splitting the state writer (`scripts/pipeline-state.mjs`)

Plan stage S3+R5 (state-writer part). Design analysis only; nothing in this file has been implemented. Base: branch
`feat/sprint-alfred` at `079efb2cd` (session-start snapshot; S2 package 1 already applied, `lib/guard/*` exists). The writer =
`plugins/pipeline-core/scripts/pipeline-state.mjs`, **12,377 lines** (`wc -l`), 430 named top-level declarations (296 `function`,
134 `const`), 51 `import` statements (lines 370-534, after a ~369-line header comment), 29 named exports, one depth-0 statement
(`if (isDirectRun) {` at 12375-12377).
All line numbers are **at `079efb2cd`**; every slice must address code **by declaration name**, never by line number (S2 R-11).
"inferred" marks a claim not read directly from code.

Method: `scratch/S3PLAN/analyze.mjs` and `analyze2.mjs` (throwaway helpers, not shipped) did a column-0 declaration scan, grouped the
declarations into 26 clusters by position, and measured cross-cluster references **by identifier** (so comments, strings and local
names that equal a top-level name are over-counted, see R-S3). Machine-written output: `scratch/S3PLAN/decls.out.txt` and
`scratch/S3PLAN/analyze2.out.txt` (scratch is ignored by git; the numbers that matter are reproduced here). Sizes below are code lines
(declaration start to end, leading comments excluded) unless marked "span".

Stage requirement (0.7 candidate plan, stage table row `S3+R5`): "state-writer split (facade + store + continuity + verbs +
PO-authority + feature-package + closed-evidence) with a `commands` table for the R1 catalogue; one `authority` record per submission;
`approved` removed as resting state (approve-plan = entry readiness + verify binding + phase flip); simplified design-course ledger
with `revise` | PB (writer)". As in S2: package 1 = pure move (this plan, sections 2-4); package 2 = the behaviour items (section 5).

## 1. Current structure

### 1.1 Responsibility clusters (line ranges, decl counts, sizes at `079efb2cd`)

| Cluster | Lines | Decls | Code lines | Content | Exports |
|---|---|---|---|---|---|
| H | 1-369 | - | 369 | shebang, SPDX, ~367-line header doc comment (the writer's contract text); imports 370-534 | - |
| C00a | 536-546 | 4 | 10 | `SCHEMA_ID`, `CONTINUITY_LOCK_*`, `ARCHITECTURE_IMPACT_VALUES` | 4 |
| C00b | 547-645 | 19 | 77 | recovery-bridge decision constants + `validateRecoveryBridgeDecision`, `recoveryBridgeDecisionDigest` (consumed outside, see 1.3) | 4 |
| C01 | 646-814 | 43 | 101 | constants and schema ids; `PIPELINE_STATE_COMMANDS` (709-734, preceded by a 62-line comment about the push threat model at 647-708); `PLUGIN_ROOT` (736) | 1 |
| C02 | 816-1006 | 7 | 176 | **store**: `projectDir`, `statePath`, `stateRelativePath`, `stateDirectory`, `readState`, `writeState` (118), `stateWriteSucceeded` | 3 |
| C03 | 1008-1136 | 9 | 80 | governance gate action + phase-marker/next-action doc sync (`statePhaseProjectionMarker`, `syncStatePhaseMarker`, `syncNextActionDocs`); refs no other cluster | 1 |
| C04 | 1138-1401 | 16 | 241 | **continuity lock + atomic write + request IO** (`acquireContinuityLock` 58, `atomicWriteContinuityState`, `publishExclusiveRecord`, `syncDirectory`, `readContinuityRequest`) | 4 |
| C05 | 1403-1711 | 9 | 278 | request/close validation and canonical JSON (`evaluateOptInDecisionReference`, `validateContinuityCloseRequest`, `exactObjectKeys`, `sha256Bytes`, `sameJson`, `canonicalJson`, `parseResultJsonStrict` 99) | 0 |
| C06 | 1713-2611 | 33 | 853 | **continuity result transactions**: sentinels, `validateFinalEntry`, `readResultAuthority`, splice/atomic write, `runFinalIntegrationTransaction` (104), `runCourseBriefTransaction` (75), `runCourseSelectionTransaction` (167) | 0 |
| C07 | 2613-2946 | 8 | 280 | `continuityTransition`, lifecycle event planners, `runContinuityCommand` (129) | 0 |
| C08 | 2948-3274 | 9 | 316 | **publication** (`runPublicationCommand` 195) | 0 |
| C09 | 3276-3318 | 3 | 39 | `parseFlags`, `parseExactFlags`, `parseAllowedOptionalFlags` (leaf, fan-in from 7 clusters) | 0 |
| C10 | 3320-3618 | 18 | 211 | legacy-v2 revocation recovery, gate-estimate flags, `classifyVerifyCommand`, calibration verify read/write, late-verify recovery (`isLateVerifyRecoveryLifecycle`, `buildLateVerifyRecoveryAction`), `isBlank` | 3 |
| C11 | 3620-4446 | 20 | 704 | push-approval inspection, plan profiles (`DRAFT_PLAN_PROFILES`, `inspectSelectedPlanProfile`), `inspectPlanLifecycle`, **`buildInspectNextAction` (3994-4446, 453 lines)** | 0 |
| C12 | 4448-4648 | 7 | 157 | external push proof (`verifyCriticalHumanProof` 90, `externalPathIsOutsideRoot`) | 1 |
| C13 | 4650-4818 | 7 | 163 | legacy continuity adoption, `readStateRaw` | 0 |
| C14 | 4822-5105 | 26 | 269 | result rebind (4822-4951) and case migration (4955-5105) | 0 |
| C15 | 5107-5664 | 26 | 488 | **authority revision** plan/apply/recover (`runAuthorityRevisionApplyCommand` 100, `...RecoverCommand` 129) | 1 |
| C16 | 5668-6272 | 32 | 565 | result bootstrap (5668-5978) and result close (5982-6272) | 0 |
| C17 | 6276-7820 | 45 | 1,399 | **PO authority**: rebind, acknowledge, decision plans/applies, rebind transaction IO (`runPoAuthorityRebindApply` 182, `runPoAuthorityAcknowledgeCommand` 178, `buildPoAuthorityAcknowledgePlan` 173, `runPoAuthorityDecisionCommand` 172) | 2 |
| C18 | 7822-8715 | 34 | 701 | **feature package**: read (7822-8011), rebind-mutable (8013-8081), write (8083-8715: apply, reconcile, recover) | 0 |
| C19 | 8717-9115 | 33 | 266 | plan-approval briefing, presentation, design-workflow approval, PRD-framing precondition | 3 |
| C20 | 9116-9708 | 10 | 568 | **closed evidence** restore (9123-9448) and repin (9450-9708) | 0 |
| C21 | 9710-9865 | 1 | 148 | `checkPoGateAuthority` | 1 |
| C22 | 9867-9993 | 9 | 125 | enrollment retirement/activation (`runEnrollmentRetirement` 67) | 0 |
| C23 | 9995-12366 | 1 | **2,372** | **`run`**: argv parse, 17 pre-switch routes (10004-10073), `readState` prelude (10075-10082), `switch (sub)` 10084-12366 with 25 inline verb cases | 1 |
| C24 | 12367-12377 | 1 | 10 | `isDirectRun` (12368-12374, `isDirectInvocation(import.meta.url)` at 12370) and the entry statement | 0 |

Totals: 430 declarations, 29 exports (4+4+1+3+1+4+3+1+1+2+3+1+1 by cluster above). `run` alone is 19.2 % of the file; C17 11.3 %.

### 1.2 Cross-cluster references (measured)

Fan-in leaders: C01 constants (referenced by 20 clusters), C05 canonical helpers (16), C02 store (15), C04 lock (15), C00a (10), C09 flags (7).
The identifier scan finds **one giant strongly connected component** over C00b+C02+C04+C05+C08+C10+C11+C12+C13+C16+C17+C18+C19+C21
(`analyze2.out.txt:29`). It is made of a small number of leaf-helper back-edges, each resolvable by moving the helper down (a relocation,
not a behaviour change):

| Back-edge (measured) | Helpers | Resolution |
|---|---|---|
| C04 -> C02 and C02 -> C04 | `projectDir`, `statePath`, `stateDirectory` (used by lock) vs `acquireContinuityLock`, `atomicWriteContinuityState` (used by `writeState`) | split paths (816-837) into a leaf `state-paths`; lock sits above it, `writeState` above the lock |
| C05 -> C04 | `safeRequestFile` (1371-1388) used by `evaluateOptInDecisionReference` | request module imports lock module (C04 below C05) |
| C00b -> C05, C10/C11/C13/C16/C17 -> C05 | `exactObjectKeys`, `sha256Bytes`, `sameJson`, `parseExpectedRevision`, `canonicalJson` | to leaf `primitives` |
| C10/C13/C14/C15/C16/C17/C18/C22 -> C10, C17 -> C10 | `isBlank` (3391), `canonicalIso` (6465), `safeIso` (592) | to leaf `primitives` |
| C08/C12/C18 -> C08 | `defaultGitCommonDir` (2948-2956); C11/C17/C18/C19 -> C11 `defaultGitCandidate`, `defaultGitHead` | to leaf `primitives` |
| C13 -> C16/C17/C18 | `readStateRaw` (4730-4742, uses `statePath`/`readState`) | to `store` |
| C16/C14/C18 -> C17 | `physicalRebindFile`, `writeRebindFile`, `restoreRebindFile` (6306, 6819, 6846) | to leaf `physical-files` |
| C18 -> C16 | bootstrap private-directory helpers (`ensureBootstrapPrivateDirectory` 5798, `readPrivateBootstrap` 5837, `writePrivateBootstrap` 5824, `bootstrapJournalMac` 5848) | to leaf `physical-files` |
| C17 -> C11 | `DRAFT_PLAN_PROFILES`, `inspectSelectedPlanProfile`, `validProfileChange*`, `committedGlobalChatHumanApproval`, `defaultGitCandidate` | C11 is **cut in two**: profile/push helpers (3620-3992) go below C17; `buildInspectNextAction` (3994-4446) goes above C17/C19/C21/C10 |
| C11 -> C17/C19/C21/C10 | `resolvePoRebindRunner`, `physicalRebindFile`, `describeFailedPostimagePredicates`, `validPlanPresentation`, `observeDesignWorkflowSignatureApproval`, `checkPoGateAuthority`, `readCalibrationVerifyStatus`, `buildLateVerifyRecoveryAction` | `inspect` module sits above them (these are `buildInspectNextAction`'s edges) |
| C08/C18 -> C12, C11 | `verifyCriticalHumanProof`, `criticalHumanProofPolicy` | `push-proof` (C12 + 3632-3703) below publication and feature-package |
| C02 -> C18 | `defaultFeaturePackageReconcileApproval <- writeState` | **inferred false positive**: `writeState` (875-992) most likely names it in a comment; `writeState` is *called by* that function (C18 -> C02). S3-01 token-level `graph` settles it |
| C02/C11/C15/C17/C18 -> C23 | the identifier `run` | **inferred** mostly the English word "run" in comments/strings (e.g. 10843 "run submit-plan first"); real re-entrant `run(...)` calls, if any, are in C15/C17/C18 handlers (injected through `deps`, inferred) and need a seam in the new `commands` module |

`run` (C23) itself references 22 other clusters (C10 13 names, C19 12, C11 10, C01 8, C18 6, ...): it is the integration point, the
reason it is split last. Unmeasured: edges *inside* C17 and C06 (see R-S3); `graph` in S3-01 settles them before any module slice.

### 1.3 Exported and imported surface (who imports what)

Named exports (29), all of which the facade must keep re-exporting so importers need no edit: `SCHEMA_ID`, `CONTINUITY_LOCK_SCHEMA_ID`,
`CONTINUITY_LOCK_STALE_MS`, `ARCHITECTURE_IMPACT_VALUES`, `RECOVERY_BRIDGE_DECISION_SCHEMA`, `RECOVERY_BRIDGE_ISSUANCE_CUTOFF`,
`recoveryBridgeDecisionDigest`, `validateRecoveryBridgeDecision`, `CLOSED_EVIDENCE_REPAIR_SCHEMA`, `projectDir`, `statePath`, `readState`,
`statePhaseProjectionMarker`, `continuityLockPath`, `acquireContinuityLock`, `releaseContinuityLock`, `atomicWriteContinuityState`,
`classifyVerifyCommand`, `isLateVerifyRecoveryLifecycle`, `buildLateVerifyRecoveryAction`, `externalPathIsOutsideRoot`,
`mergeAuthorityRevisionReceipt`, `PO_ACK_APPLY_CONFIRMATION_TOKEN`, `resolvePoRebindRunner`, `reconstructPlanApprovalBriefing`,
`PLAN_AUTHORITY_PRD_FRAMING_CODE`, `findPrdFramingPlaceholder`, `checkPoGateAuthority`, `run`. The entry (`isDirectRun`, 12368-12377) must stay
in the facade so `import.meta.url` still names `scripts/pipeline-state.mjs`.

`git grep -n -l "pipeline-state.mjs" -- plugins harness` lists **128 files** (hand-counted; includes the writer, the harness shim, 11
ADR/docs files and spawners that only name the path). Files with a real `import`/`import()` of it (`git grep -n -E "(from|import\() *[\"'][^\"']*pipeline-state\.mjs[\"']"`):

- **Production importers (11):** `harness/scripts/pipeline-state.mjs` (20-line shim: `export *` at :5, `import { run }` at :10; `plugins/.../phoenix-authority-revision.mjs:5` and `po-gate-authority.test` reach the writer through it),
  `harness/scripts/phoenix-recovery-bridge-decision-helper.mjs:14`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs:57`
  (`classifyVerifyCommand`, `readState`), `lib/guard/command-catalogue.mjs:9` (`readState`), `lib/guard/entry-gates.mjs:10` and
  `lib/guard/sanctioned-args-scripts.mjs:7` (`classifyVerifyCommand`), `scripts/check-state-phase-consistency.mjs:20` (`readState`,
  `statePhaseProjectionMarker`), `scripts/design-course-session.mjs:196` (dynamic `import()`, `readState` behind a `dependencies.readState` seam),
  `scripts/phoenix-authority-revision.mjs:5` (via the shim), `scripts/push-init.mjs:120` (`buildLateVerifyRecoveryAction`),
  `scripts/push-prepare.mjs:51` (`projectDir`, `readState`, `run`, `statePath`).
- **Test importers (38):** harness: `pipeline-state.test` (:34, protected, TP-5), `pipeline-state-decision-reference.test`,
  `pipeline-state-external-push-ledger.test`, `publication-state-authority.test`, `recovery-bridge-approval.test`; hooks:
  `antigravity-pretool-guard.test`, `design-course-command-admission.test`, `guard-push-checkpoint-approval.test`; lib:
  `plan-authority-staging-guard.test`, `po-gate-authority.test`, `project-onboarding-v3.test`; scripts (27): `pipeline-state.test`,
  `pipeline-state-{approve-announce,approve-push-argv-closure,close-audit,discard-feature,gate-action-event,inspect,inspection-contract,late-verify,lifecycle-event,observer-conformance,rebind-mutable,rebind-runner,reopen-design,result-bootstrap,result-case-migration,result-close,result-rebind,revocation}.test`,
  `check-evidence-drift.test`, `check-state-phase-consistency.test`, `critical-human-proof-gate.test`, `project-onboarding-e2e.test`,
  `push-init.test`, `push-prepare.test`, `push-release-flow-docs-contract.test`, `runtime-handover-writer.test`.
- Names imported by importers (visible on single-line imports): `run` (the bulk), `readState`, `statePath`, `projectDir`, `SCHEMA_ID`,
  `continuityLockPath`, `statePhaseProjectionMarker`, `classifyVerifyCommand`, `buildLateVerifyRecoveryAction`, `externalPathIsOutsideRoot`,
  `resolvePoRebindRunner`, `PO_ACK_APPLY_CONFIRMATION_TOKEN`, `PLAN_AUTHORITY_PRD_FRAMING_CODE`. Multi-line imports (4 files) were not expanded.
- Spawners (CLI path unchanged by the split): the writer is invoked as `node <plugin-root>/scripts/pipeline-state.mjs <verb>` by hooks/skills/docs and by its own next-action argv (see 3.2).

What the writer imports: ~40 `lib/*` modules (header lines 370-534; the largest groups: `continuity-state` 382-397, `plan-spec-state-v2` 438-458,
`publication-authority` 482-493), plus one script (`./po-human-approval.mjs` :515 `criticalPushScratchArtifactPaths`) and one sibling
(`./publication-close-journal.mjs` :519). Transitional dependency inversions for the S8 fitness baseline: today 4 guard files import the **writer**
(`hooks/guard-lifecycle-ready.mjs:57`, `lib/guard/{command-catalogue,entry-gates,sanctioned-args-scripts}.mjs`) for only `readState` and
`classifyVerifyCommand`; after the split these two live in leaf modules the guard can import without loading the writer (MP-2, see 5.4).

### 1.4 CLI verb table (every verb the argv parser accepts)

`PIPELINE_STATE_COMMANDS` (709-734) lists **72** verbs "so the help output and the unknown-command refusal can never disagree" (comment 704-708).
Measured by `analyze2.mjs`: **five routed verbs are missing from it** (S3PLAN2 correction: the first draft said three): `continuity-adoption-plan`, `continuity-adoption-apply` (routed at 10038, in
`CONTINUITY_SUBCOMMANDS` 764-765) `configure-verify` (case at 10302), `plan-legacy-v2-revocation-recovery` and `apply-legacy-v2-revocation-recovery` (cases at 11147 and 11197; neither spelling occurs in 709-734); every listed verb has a route. Accepted verbs = 72 + 5 = **77** (this table has 77 verb rows), plus `help`/`--help`/`-h`
(12345-12347). Dispatch order in `run` (9995): (1) routes **before** `readState` (verbs that carry their own authority/state), (2) `readState` prelude
(`malformed` -> exit 2, 10075-10082), (3) the `switch` (verbs that receive `base`/`existing`).

| Verb(s) | Route in `run` | Handler (current) | Handler location | Receives state? |
|---|---|---|---|---|
| `retire-enrollment`, `activate-enrollment` | 10004 | `runEnrollmentRetirement` | 9927-9993 | no (own) |
| `inspect-enrollment-retirement` | 10005 (inline 5 lines) | inline in `run` | 10005-10009 | no |
| `po-authority-rebind-plan/-apply` | 10011 | `runPoAuthorityRebindCommand` (+`runPoAuthorityRebindApply` 7639) | 7385-7430 | no (own) |
| `po-authority-acknowledge-plan/-apply` | 10020 | `runPoAuthorityAcknowledgeCommand` | 7206-7383 | no |
| `po-authority-decision-plan/-select/-apply` | 10029 | `runPoAuthorityDecisionCommand` | 7432-7603 | no |
| `continuity-adoption-plan/-apply` (unlisted) | 10038 | `runLegacyAdoptionCommand` | 4762-4818 | no |
| `continuity-result-close-plan/-apply` | 10041 | `runResultCloseCommand` | 6137-6272 | no |
| `continuity-result-bootstrap-plan/-apply` | 10044 | `runResultBootstrapCommand` | 5907-5978 | no |
| `continuity-result-rebind-plan/-apply` | 10047 | `runResultRebindCommand` | 4916-4951 | no |
| `continuity-result-case-migration-plan/-apply` | 10050 | `runResultCaseMigrationCommand` | 5098-5105 | no |
| `closed-evidence-restore-plan/-apply` | 10053 | `runClosedEvidenceRestoreCommand` | 9251-9448 | no |
| `closed-evidence-repin-plan/-apply` | 10056 | `runClosedEvidenceRepinCommand` | 9496-9708 | no |
| `continuity-authority-revision-plan/-apply/-recover` | 10059 (`AUTHORITY_REVISION_SUBCOMMANDS` 5107) | `runAuthorityRevisionCommand` | 5657-5664 | no |
| `continuity-init`, `-cas`, `-apply-native`, `-integrate-final`, `-dispose-failure`, `-record-course-brief`, `-select-course`, `-apply-decision`, `-clear-decision` | 10062 (`CONTINUITY_SUBCOMMANDS` 754) | `runContinuityCommand` | 2818-2946 | no |
| `publication-prepare/-approve/-authorize/-reconcile/-observe/-start-readback/-close/-rearm/-block` (9) | 10063 (`PUBLICATION_SUBCOMMANDS` 767) | `runPublicationCommand` | 3080-3274 | no |
| `feature-package-inspect/-status/-plan` | 10066 | `runFeaturePackageReadCommand` | 7908-8011 | no (read-only) |
| `feature-package-rebind-mutable` | 10069 | `runFeaturePackageRebindMutableCommand` | 8041-8081 | no |
| `feature-package-apply/-reconcile/-recover` | 10073 | `runFeaturePackageWriteCommand` | 8699-8715 | no |
| `set-feature` | case 10085-10190 (106) | inline | `run` | yes |
| `materialize-architecture` | 10191-10204 (14) | inline | `run` | yes |
| `set-phase` | 10205-10301 (97) | inline | `run` | yes |
| `configure-verify` (unlisted) | 10302-10338 (37) | inline | `run` | yes |
| `submit-plan` | 10339-10477 (139) | inline | `run` | yes |
| `cancel-submitted-plan` | 10478-10521 (44) | inline | `run` | yes |
| `cancel-mixed-plan-state` | 10522-10580 (59) | inline | `run` | yes |
| `present-plan` | 10581-10688 (108) | inline | `run` | yes |
| `reopen-design` | 10689-10725 (37) | inline | `run` | yes |
| `seal-plan-approval` | 10726-10773 (48) | inline | `run` | yes |
| `set-gate-estimate` | 10774-10815 (42) | inline | `run` | yes |
| `approve-plan` | 10816-11146 (**331**) | inline | `run` | yes |
| `plan-legacy-v2-revocation-recovery` | 11147-11196 (50) | inline | `run` | yes |
| `apply-legacy-v2-revocation-recovery` | 11197-11238 (42) | inline | `run` | yes |
| `revoke-plan` | 11239-11274 (36) | inline | `run` | yes |
| `bind-plan-spec` | 11275-11331 (57) | inline | `run` | yes |
| `approve-push` | 11332-11607 (**276**) | inline | `run` | yes |
| `materialize-push-threat-model` | 11608-11665 (58) | inline | `run` | yes |
| `prepare-push-subject` | 11666-11714 (49) | inline | `run` | yes |
| `close-feature` | 11715-11944 (**230**) | inline | `run` | yes |
| `discard-feature` | 11945-12086 (142) | inline | `run` | yes |
| `approve-deploy` | 12087-12215 (129) | inline | `run` | yes |
| `consume-deploy` | 12216-12252 (37) | inline | `run` | yes |
| `clear-deploy` | 12253-12305 (53) | inline | `run` | yes |
| `inspect` | 12306-12344 (39, calls `buildInspectNextAction` 3994) | inline | `run` | yes |
| `help`, `--help`, `-h`; `default` (unknown verb) | 12345-12366 | inline | `run` | no |

Case anatomy (`analyze2.out.txt:103-131`): **no case ends in `break`** (all return an exit code), **no case defines an inner function**, and the only
run-level locals a case reads are `dir`, `now`, `gitHead`, `gitCandidate`, `poGateAuthority`, `deps`, `flags`, `rest`, `base`, `existing`, `sub`, `argv`
(all `const`; defined 9996-10082). That is what makes 25 inline cases mechanically extractable into handler functions taking one context object (3.2).

## 2. Target modules (`plugins/pipeline-core/lib/state/`)

### 2.1 Principle and sizing

Package 1 is a **pure move**, as in S2. Declarations move byte-for-byte; the permitted textual changes are (a) a leading `export ` on a
declaration that gains a cross-module consumer, (b) the `import.meta.url` specifier depth at the four relative sites (736 `PLUGIN_ROOT`:
`".."` becomes `"../.."`; 4159, 4213, 4260: `./x.mjs` becomes `../../scripts/x.mjs`), (b2) the **21 bare** `fileURLToPath(import.meta.url)`
self-path sites (new transform, 3.2), (c) the computed import header, (d) the generated verb wrappers (new transform, 3.2). Three artefacts are
**new code, not moved code**: `command-table.mjs` (data), `commands.mjs` (the dispatcher, derived from `run`'s prelude 9995-10083 and its
`help`/`default` tail 12345-12366) and the 26 extracted verb handlers (the 25 `switch` cases plus the inline `inspect-enrollment-retirement`
route 10005-10009). Everything else is moved by the extractor and proven by `check` (section 4).

Sizes are **summed declaration spans** from `scratch/S3PLAN/decls.out.txt` (column "size"); they include blank and comment lines inside a
declaration, so they run 5-10 % above the "Code lines" column of 1.1 (measured: C21 156 span vs 148 code lines; C17 1,513 span vs 1,399).
Layer = dependency layer: a module may import only modules of a **strictly lower** layer (plus `lib/*`, `scripts/*` and node built-ins as
the monolith did). The named edges below are those measured in 1.2; every other edge is fixed by the token-level `graph` of S3-01 (R-S3).

### 2.2 Module table

| Layer | Module | Takes (clusters / declarations, by name) | ~Lines | May import (intra-state) |
|---|---|---|---|---|
| L0 | `constants.mjs` | C00a (536-545), `CONTINUITY_REQUEST_MAX_BYTES` (646), `PIPELINE_STATE_COMMANDS` (647-734, verbatim with its 62-line comment), constants 735-814 (`PLUGIN_ROOT`, `CONTINUITY_SUBCOMMANDS`, `PUBLICATION_SUBCOMMANDS`, `RESULT_APPEND_COLLECTIONS`, schema ids, lock tokens, `CLOSED_EVIDENCE_REPAIR_*`). Feature-specific constants stay with their owner (`PO_*` 6276-6302, `AUTHORITY_REVISION_*` 5107-5152, `FEATURE_PACKAGE_*` 7822-8129, `PLAN_APPROVAL_*`/`PLAN_PRESENTATION_*` 8717-8829, `GOVERNANCE_*` 1008-1009) | 190 | none |
| L0 | `primitives.mjs` | paths `projectDir`, `statePath`, `stateRelativePath`, `stateDirectory` (816-837); `parseExpectedRevision`, `exactObjectKeys`, `sha256Bytes`, `sameJson`, `canonicalJson` (1510-1611); `safeIso` (592), `isBlank` (3391), `canonicalIso` (6465), `isPlainRecord` (8764); `parseFlags`, `parseExactFlags`, `parseAllowedOptionalFlags` (3276-3318); git observers `defaultGitCommonDir` (2948), `defaultGitBinding` (2248), `defaultGitHead` (3620), `defaultGitCandidate` (3649) | 215 | `constants` |
| L0 | `command-table.mjs` | **new data**: one row per verb (2.5) | 110 | none (must stay import-free) |
| L1 | `continuity-lock.mjs` | C04 lock half 1138-1369: lock path/record/recovery guard, `acquireContinuityLock` (58), `releaseContinuityLock`, `atomicWriteContinuityState`, `publishExclusiveRecord`, `syncDirectory` | 230 | `primitives`, `constants` |
| L1 | `recovery-bridge.mjs` | C00b 547-645 minus `safeIso` (`validateRecoveryBridgeDecision`, `recoveryBridgeDecisionDigest`, the `RECOVERY_BRIDGE_*` constants) | 98 | `primitives`, `constants` |
| L1 | `phase-projection.mjs` | C03 1008-1136: governance gate action, `statePhaseProjectionMarker`, `syncStatePhaseMarker`, `syncNextActionDocs` | 130 | `primitives`, `constants` |
| L2 | `store.mjs` | `readState` (839), `writeState` (875, 118 lines), `stateWriteSucceeded`, and `readStateRaw` (4730, moved down from C13) | 180 | `primitives`, `continuity-lock`, `phase-projection` (inferred: whether `writeState` calls the C03 sync is not read) |
| L2 | `continuity-request.mjs` | `safeRequestFile`, `readContinuityRequest` (1371-1401, moved from the C04 request half), `evaluateOptInDecisionReference`, `hashBoundRepoFile`, `validateContinuityCloseRequest` (1403-1508), `parseResultJsonStrict` (1613-1711) | 235 | `primitives`, `constants`, `continuity-lock` |
| L2 | `physical-files.mjs` | `physicalRebindFile` (6306), `writeRebindFile` (6819), `restoreRebindFile` (6846), the six bootstrap private-directory helpers (5792-5848) | 115 | `primitives`, `continuity-lock` |
| L2 | `push-proof.mjs` | `inspectPushApproval` (3632), `criticalHumanProofPolicy` (3659), `committedGlobalChatHumanApproval` (3662), `boundRepositoryArtifact`, `resolvePushThreatModelArtifact` (3676-3703), all of C12 4448-4648 (`externalPathIsOutsideRoot`, `verifyCriticalHumanProof` 90 lines) | 255 | `primitives`, `constants`, `store` |
| L2 | `verify-binding.mjs` | 3395-3591: `UNCONFIGURED_VERIFY_MARKER`, `classifyVerifyCommand`, `readCalibrationVerifyStatus`, `readIdenticalCalibrationVerifyTwins`, `isLateVerifyRecoveryLifecycle`, `buildLateVerifyRecoveryAction`, `writeCalibrationVerifyCommand`, `prepareCalibrationVerifyWrite`. Guard-facing leaf (3 of the 29 exports) | 190 | `primitives`, `constants` (must not import `store` unless `graph` proves it unavoidable) |
| L2 | `plan-verb-support.mjs` | C10 head 3320-3389 (legacy-v2 revocation recovery helpers, gate-estimate flag parsers) and `projectV1LegacyApprovalForSpecBind` (3593) | 90 | `primitives`, `constants`, `store` |
| L2 | `po-gate-check.mjs` | C21 `checkPoGateAuthority` (9710-9865, 156 lines) | 156 | `primitives`, `constants` |
| L3 | `continuity-result.mjs` | C06 first half 1713-2141 (sentinels, `validateFinalEntry`, `readResultAuthority`, splice and atomic result write, `committedFinalStateMatches`) | 410 | `continuity-lock`, `continuity-request`, `store`, `primitives` |
| L3 | `publication.mjs` | C08 minus `defaultGitCommonDir`: 2958-3274 (`runPublicationCommand` 195) | 310 | `store`, `continuity-lock`, `push-proof`, `primitives` |
| L3 | `plan-profile.mjs` | C11 middle 3705-3978: `DRAFT_PLAN_PROFILES`, placeholders, `resolveLocalGitUserName`, `validProfileChange*`, `inspectSelectedPlanProfile`, draft defaults and receipt action, `mixedPlanRecoveryObservation` | 265 | `store`, `push-proof`, `primitives`, `constants` |
| L3 | `plan-approval.mjs` | C19 minus `isPlainRecord`: approval briefing, presentation, design-workflow approval, PRD-framing precondition (8717-9115). Exports `reconstructPlanApprovalBriefing`, `PLAN_AUTHORITY_PRD_FRAMING_CODE`, `findPrdFramingPlaceholder` | 375 | `store`, `push-proof`, `primitives`, `constants` |
| L3 | `po-authority-common.mjs` | C17 shared half: `PO_*` constants, rebind marker/validation helpers (6304-6463), rebind transaction IO and recovery (6852-6929), `resolvePoRebindRunner` (6931), `describeFailedPostimagePredicates` (7605) | 285 | `store`, `physical-files`, `plan-profile`, `primitives`, `constants` |
| L3 | `feature-package-read.mjs` | C18 read 7822-8011 and rebind-mutable 8013-8081 | 255 | `store`, `primitives`, `constants` |
| L3 | `enrollment-retirement.mjs` | C22 9867-9993 plus the extracted `inspect-enrollment-retirement` route (10005-10009) | 130 | `primitives`, `store` |
| L4 | `course-transactions.mjs` | C06 second half 2143-2611 minus `defaultGitBinding`: `runFinalIntegrationTransaction` (104), `runCourseBriefTransaction` (75), `runCourseSelectionTransaction` (167) | 445 | `continuity-result`, `continuity-lock`, `continuity-request`, `store` |
| L4 | `continuity-maintenance.mjs` | legacy adoption (4650-4818 minus `readStateRaw`), result rebind (4822-4951), result case migration (4955-5105) | 420 | `store`, `continuity-lock`, `continuity-result`, `physical-files` |
| L4 | `authority-revision.mjs` | C15 5107-5664 (exports `mergeAuthorityRevisionReceipt`) | 545 | `store`, `continuity-lock`, `continuity-result`, `primitives` |
| L4 | `result-lifecycle.mjs` | C16 minus the six helpers in `physical-files`: result bootstrap 5668-5978, result close 5982-6272 | 520 | `store`, `continuity-lock`, `continuity-result`, `physical-files` |
| L4 | `po-authority-rebind.mjs` | `buildPoAuthorityRebindPlan` (6469), `parsePoRebindApply`, `runPoAuthorityRebindCommand` (7385), `runPoAuthorityRebindApply` (182 lines) | 320 | `po-authority-common`, `store`, `physical-files`, `po-gate-check` |
| L4 | `po-authority-acknowledge.mjs` | `parsePoAcknowledgeFlags` (6731), `eligibleAcknowledgeContinuity`, `appendAcknowledgementMarker`, `buildPoAuthorityAcknowledgePlan` (173), `runPoAuthorityAcknowledgeCommand` (178) | 485 | same as rebind |
| L4 | `po-authority-decision.mjs` | `buildPoAuthorityDecisionPlan` (6547, 166), `parsePoDecisionSelection`, `parsePoDecisionApply`, `runPoAuthorityDecisionCommand` (172) | 355 | same as rebind |
| L4 | `feature-package-write.mjs` | C18 write 8083-8715: apply, reconcile, recover, `defaultFeaturePackageReconcileApproval` (130) | 620 | `store`, `feature-package-read`, `push-proof`, `primitives` |
| L4 | `closed-evidence.mjs` | C20 9123-9708 (restore 198-line and repin 213-line commands with their parsers) | 580 | `store`, `continuity-lock`, `primitives` |
| L5 | `continuity-commands.mjs` | C07 2613-2946: `continuityTransition`, lifecycle event planners, `runContinuityCommand` | 325 | `course-transactions`, `continuity-result`, `store`, `continuity-lock` |
| L5 | `inspect.mjs` | `inspectPlanLifecycle` (3980) + `buildInspectNextAction` (3994-4446, 453 lines) + the `inspect` verb handler (12306-12344) | 505 | `plan-profile`, `plan-approval`, `po-gate-check`, `po-authority-common`, `push-proof`, `verify-binding`, `physical-files`, `store` (the edges of 1.2 "C11 -> C17/C19/C21/C10") |
| L6 | `verbs-plan-submission.mjs` | cases `set-feature` (106), `submit-plan` (139), `cancel-submitted-plan` (44), `cancel-mixed-plan-state` (59), `present-plan` (108), `reopen-design` (37) | 495 | any lower layer |
| L6 | `verbs-plan-authority.mjs` | cases `seal-plan-approval` (48), `set-gate-estimate` (42), `approve-plan` (331), `plan-legacy-v2-revocation-recovery` (50), `apply-legacy-v2-revocation-recovery` (42), `revoke-plan` (36), `bind-plan-spec` (57) | 605 | any lower layer |
| L6 | `verbs-phase-push.mjs` | cases `materialize-architecture` (14), `set-phase` (97), `configure-verify` (37), `approve-push` (276), `materialize-push-threat-model` (58), `prepare-push-subject` (49) | 530 | any lower layer |
| L6 | `verbs-close-deploy.mjs` | cases `close-feature` (230), `discard-feature` (142), `approve-deploy` (129), `consume-deploy` (37), `clear-deploy` (53) | 590 | any lower layer |
| L7 | `commands.mjs` | **new, generated**: argv parse, the table-driven pre-state routes, the `readState` prelude, state-verb dispatch, `help`/unknown tail, and the exported `run` (2372 lines today) | 120 | everything below, `command-table` |
| L8 | **facade** `scripts/pipeline-state.mjs` | header comment 2-369 (verbatim), 29 re-exports, `isDirectRun` (12368-12374) and the entry statement (12375-12377) | **~425 (budget 500)** | `commands` and the re-export sources |

36 modules plus the facade; about 11.9k lines moved. The 37-file count is the price of a measured SCC (1.2): an S2-style budget of "no module
over about 700 lines" forces C17 (1,513 span) into four modules and `run` (2,372) into five, which layering then multiplies. Merge variants are
open question Q5.

### 2.3 How the cycle's back-edge leaf helpers move down

Each back-edge of 1.2 is a **relocation of a leaf helper** to a lower layer (never a behaviour change):

| Back-edge (1.2) | Helper(s) | Lands in |
|---|---|---|
| C04 <-> C02 | `projectDir`, `statePath`, `stateDirectory` | `primitives` (L0): lock (L1) and store (L2) both sit above it |
| C05 -> C04 | `safeRequestFile` (1371-1388) | `continuity-request` (it and `readContinuityRequest` leave C04; the lock module keeps only lock/atomic-write code, **inferred** that no lock function calls them) |
| C00b/C10/C11/C13/C16/C17 -> C05; -> C10; -> C17 | `exactObjectKeys`, `sha256Bytes`, `sameJson`, `parseExpectedRevision`, `canonicalJson`, `isBlank`, `canonicalIso`, `safeIso`, `isPlainRecord` | `primitives` |
| C08/C12/C18 -> C08; C11/C17/C18/C19 -> C11 | `defaultGitCommonDir`, `defaultGitHead`, `defaultGitCandidate` (and `defaultGitBinding` 2248, consumed by C06 and C08) | `primitives` |
| C13 -> C16/C17/C18 | `readStateRaw` | `store` |
| C16/C14/C18 -> C17 | `physicalRebindFile`, `writeRebindFile`, `restoreRebindFile` | `physical-files` |
| C18 -> C16 | `ensureBootstrapPrivateDirectory`, `readPrivateBootstrap`, `writePrivateBootstrap`, `bootstrapJournalMac` (+ the two helpers they call) | `physical-files` |
| C17 -> C11 | `DRAFT_PLAN_PROFILES`, `inspectSelectedPlanProfile`, `validProfileChange*`, `committedGlobalChatHumanApproval` | C11 is **cut in four**: push helpers 3632-3703 to `push-proof`, 3705-3978 to `plan-profile`, git defaults to `primitives`, `buildInspectNextAction` to `inspect` (L5) |
| C11 -> C17/C19/C21/C10 | `resolvePoRebindRunner`, `describeFailedPostimagePredicates` (7605), `physicalRebindFile`, `validPlanPresentation`, `observeDesignWorkflowSignatureApproval`, `checkPoGateAuthority`, `readCalibrationVerifyStatus`, `buildLateVerifyRecoveryAction` | all sit in L2-L3 modules **below** `inspect` (L5): `po-authority-common`, `physical-files`, `plan-approval`, `po-gate-check`, `verify-binding` |
| C08/C18 -> C12, C11 | `verifyCriticalHumanProof`, `criticalHumanProofPolicy` | `push-proof` (L2), below `publication` (L3) and `feature-package-write` (L4) |
| C02 -> C18 | `defaultFeaturePackageReconcileApproval` | **inferred false positive** (1.2). If `writeState` really called it, it would be an L2 -> L4 back-edge, resolvable only by injection; S3-01 settles it |
| C02/C11/C15/C17/C18 -> C23 | the identifier `run` | **measured false positive**: a token-level search for `run(` finds only the definition (9995) and the entry `process.exit(run())` (12376); no re-entrant call exists, so no seam is needed (it was "inferred" in 1.2; a value use such as `deps.run = run` was not searched) |

### 2.4 Facade and public surface

The facade keeps `import.meta.url` naming `scripts/pipeline-state.mjs` (entry statement 12375, `isDirectInvocation(import.meta.url)` at 12370) and
re-exports the **29 names** of 1.3 so the 11 production and 38 test importers and the `harness/scripts/pipeline-state.mjs` shim (`export *`) need
no edit: from `constants` 5 (`SCHEMA_ID`, `CONTINUITY_LOCK_SCHEMA_ID`, `CONTINUITY_LOCK_STALE_MS`, `ARCHITECTURE_IMPACT_VALUES`, `CLOSED_EVIDENCE_REPAIR_SCHEMA`),
`recovery-bridge` 4, `primitives` 2 (`projectDir`, `statePath`), `store` 1 (`readState`), `phase-projection` 1, `continuity-lock` 4, `verify-binding` 3,
`push-proof` 1 (`externalPathIsOutsideRoot`), `authority-revision` 1, `po-authority-common` 2, `plan-approval` 3, `po-gate-check` 1, `commands` 1 (`run`).
Facade size: 2-369 comment + about 35 re-export lines + imports and entry about 20 = **about 425 lines** (budget 500). That resolves the previous
draft's facade-budget worry (the old Q8): the generated dispatcher lives in `commands.mjs`, not in the facade.

Transitional dependency inversions (named for the S8 fitness baseline, as in S2 section 2): `lib/state/*` imports the sibling `scripts/po-human-approval.mjs`
(`criticalPushScratchArtifactPaths`, :515) and `scripts/publication-close-journal.mjs` (:519) and, through the relocated `new URL` sites, `scripts/design-course-session.mjs`
and `scripts/po-human-approval.mjs` (4159, 4213, 4260): lib-to-script edges that are hook/script-to-script today; plus the existing `lib/guard/*` to writer edges, removed by 5.4.

### 2.5 The `commands` table (feeds `lib/guard/command-catalogue.mjs`)

**Today** `command-catalogue.mjs` exports validators only (`isSanctionedLifecycleCommand` :198, `observedOnboardingCommandMatch` :213,
`isExactObservedOnboardingNextAction` :244, `isExactObservedInstalledPluginAttestationAction` :267, `isExactObservedRunnerPermissionsRepairAction` :332,
`isExactObservedRunnerPermissionsPlannerAction` :376, `isSanctionedGhReadOnlyDiagnostic` :452) and imports `readState` from the writer (:9). There is no data table;
the writer's verb shapes live in `lib/guard/sanctioned-args-scripts.mjs:337-438` (`sanctionedPipelineStateArgs`: `inspect`, `inspect-enrollment-retirement`,
`retire-enrollment`/`activate-enrollment`, `materialize-architecture`, `plan-legacy-v2-revocation-recovery`, `apply-legacy-v2-revocation-recovery` (always false, :366),
`reopen-design`, `cancel-submitted-plan`, `cancel-mixed-plan-state`, `submit-plan`, `approve-plan`, `approve-push`, `set-phase`, then `sanctionedPoAuthorityRebindArgs` :437). `PIPELINE_STATE_COMMANDS`
has no consumer outside the writer (`git grep`: definition 709, help 12353, unknown-verb refusal 12361). The table is therefore new data, shaped for R1.

**Proposed export** (`lib/state/command-table.mjs`, data only, **no import**, so the guard can load it without loading the writer):

```js
export const STATE_COMMANDS = Object.freeze([
  { verb: "set-phase", module: "verbs-phase-push", handler: "verbSetPhase", call: "ctx", route: "state", listed: true },
  // ... 77 rows
]);
```

Fields: `verb`; `module` (basename under `lib/state/`); `handler` (exported name); `call` (closed set, the call shapes `run` uses today:
`ctx` | `sub-rest` | `rest` | `sub-flags-ctx` | `sub-rest-ctx` | `sub-rest-ctx-git` | `sub-rest-po` | `sub-rest-deps`); `route` (`pre-state` = routed before the `readState`
prelude 10075-10082, `state` = receives `base`/`existing`); `listed` (member of `PIPELINE_STATE_COMMANDS` today). Package 2 adds `argv` (a closed-shape descriptor
replacing the if-chain at `sanctioned-args-scripts.mjs:337-438`) and `authority` (`agent` | `human-only`); `command-catalogue.mjs` and `sanctionedPipelineStateArgs` then read the table.
A conformance test in the contract suite pins: table verbs == handler-map keys of `commands.mjs`; every `module`/`handler` resolves; `listed:false` rows are exactly the five unlisted verbs below.

**Rows** (77 verbs; `*` = not in `PIPELINE_STATE_COMMANDS`, i.e. `listed:false`; **five** such verbs, not the three of the first draft):

| Verbs | Module | Handler | `call` |
|---|---|---|---|
| `retire-enrollment`, `activate-enrollment` | `enrollment-retirement` | `runEnrollmentRetirement` | `sub-rest` |
| `inspect-enrollment-retirement` | `enrollment-retirement` | `runInspectEnrollmentRetirement` (new, extracted from 10005-10009) | `rest` |
| `po-authority-rebind-plan/-apply` | `po-authority-rebind` | `runPoAuthorityRebindCommand` | `sub-rest-po` |
| `po-authority-acknowledge-plan/-apply` | `po-authority-acknowledge` | `runPoAuthorityAcknowledgeCommand` | `sub-rest-po` |
| `po-authority-decision-plan/-select/-apply` | `po-authority-decision` | `runPoAuthorityDecisionCommand` | `sub-rest-po` |
| `continuity-adoption-plan/-apply` `*` | `continuity-maintenance` | `runLegacyAdoptionCommand` | `sub-flags-ctx` |
| `continuity-result-close-plan/-apply`, `continuity-result-bootstrap-plan/-apply` | `result-lifecycle` | `runResultCloseCommand`, `runResultBootstrapCommand` | `sub-rest-ctx` |
| `continuity-result-rebind-plan/-apply`, `continuity-result-case-migration-plan/-apply` | `continuity-maintenance` | `runResultRebindCommand`, `runResultCaseMigrationCommand` | `sub-rest-ctx` |
| `closed-evidence-restore-plan/-apply`, `closed-evidence-repin-plan/-apply` | `closed-evidence` | `runClosedEvidenceRestoreCommand`, `runClosedEvidenceRepinCommand` | `sub-rest-ctx` |
| `continuity-authority-revision-plan/-apply/-recover` | `authority-revision` | `runAuthorityRevisionCommand` | `sub-rest-ctx-git` |
| 9 `continuity-*` (`init`, `cas`, `apply-native`, `integrate-final`, `dispose-failure`, `record-course-brief`, `select-course`, `apply-decision`, `clear-decision`) | `continuity-commands` | `runContinuityCommand` | `sub-flags-ctx` |
| 9 `publication-*` | `publication` | `runPublicationCommand` | `sub-flags-ctx` |
| `feature-package-inspect/-status/-plan` | `feature-package-read` | `runFeaturePackageReadCommand` | `sub-rest` |
| `feature-package-rebind-mutable` | `feature-package-read` | `runFeaturePackageRebindMutableCommand` | `rest` |
| `feature-package-apply/-reconcile/-recover` | `feature-package-write` | `runFeaturePackageWriteCommand` | `sub-rest-deps` |
| `set-feature`, `submit-plan`, `cancel-submitted-plan`, `cancel-mixed-plan-state`, `present-plan`, `reopen-design` | `verbs-plan-submission` | `verbSetFeature` ... (one `verb<PascalCase>` per case) | `ctx` |
| `seal-plan-approval`, `set-gate-estimate`, `approve-plan`, `plan-legacy-v2-revocation-recovery` `*`, `apply-legacy-v2-revocation-recovery` `*`, `revoke-plan`, `bind-plan-spec` | `verbs-plan-authority` | `verb<...>` | `ctx` |
| `materialize-architecture`, `set-phase`, `configure-verify` `*`, `approve-push`, `materialize-push-threat-model`, `prepare-push-subject` | `verbs-phase-push` | `verb<...>` | `ctx` |
| `close-feature`, `discard-feature`, `approve-deploy`, `consume-deploy`, `clear-deploy` | `verbs-close-deploy` | `verb<...>` | `ctx` |
| `inspect` | `inspect` | `verbInspect` | `ctx` |

`ctx` is the 12 run-level locals the cases read (measured, `analyze2.out.txt:103-131`): `argv`, `sub`, `rest`, `flags`, `deps`, `dir`, `now`, `gitHead`, `gitCandidate`,
`poGateAuthority`, `base`, `existing`; each wrapper opens with a single destructuring line and then carries the case body unchanged. The other `call` shapes
reproduce the argument lists of 10004-10073 exactly (e.g. `sub-rest-po` = `(sub, rest, { ...deps, dir, now, poGateAuthority, poGateProfile })` with the same
`poGateProfile` default). **Dispatch order is part of the contract and must not change in package 1**: (1) `pre-state` rows, (2) the `readState` prelude (a malformed
state exits 2 *before* `help` and before the unknown-verb refusal, 10075-10082, 12345-12366), (3) `state` rows, then `help`/unknown. Q13 asks whether package 2 should fix that quirk.

## 3. Slices

### 3.1 Extractor reuse: `harness/scripts/guard-split-map.mjs`

**Reusable unchanged** (all `file:line` at HEAD of this dispatch):
- Map-driven: `DEFAULT_MAP` :48 (`harness/guard-split-map.json`), `--map`/`--repo` :34-35 and :935/:945; the map schema `{ source, baseSha, moduleDir, facade, modules: { <name>: { layer } }, declarations }` (:37-38). A new `harness/state-split-map.json` therefore selects the writer with **no code change** for the plain moves.
- Lexer and unit model: template expressions lexed as code (:52-53, :85-90, :137, so the `import.meta.url` inside the template at 4260 is seen); top-level units `import`/`declaration`/`statement`/`reexport` (:349-365, :411-435); duplicate top-level names throw (:458); units must start at column 0 and not share a line (:377, :400). The writer has exactly one depth-0 statement (`if (isDirectRun) {`, decls.out.txt:6), which the extractor already routes to the facade (:39-40).
- Computed import header, transform (c): :624-659, relative specifiers rebased by `rewriteSpecifier` (:612-614), so the 51 imports (`../lib/x.mjs` becomes `../x.mjs` from `lib/state/`; `./po-human-approval.mjs` becomes `../../scripts/po-human-approval.mjs`).
- `check` (:727 schema), `graph` with SCC detection (:817, :867 schema), `export-surface`, `list`; shebang for the facade (:663); transform (a) export prefix; transform (b) :587-610 for 4 of the writer's 26 `import.meta.url` lines (736 `resolve(dirname(fileURLToPath(...)), "..")`; 4159, 4213, 4260 `new URL("./x.mjs", import.meta.url)`).

**Not reusable as is** (the S3-00 delta):
1. **Bare self-path sites (new transform b2).** The recogniser accepts exactly two shapes (:597 `new URL("<rel>", import.meta.url)`, :598 `resolve(dirname(fileURLToPath(import.meta.url)), "<rel>")`); any other `import.meta.url` makes `transformedBody` throw (:599-602) whenever source and target directories differ. The writer has **21 bare** `fileURLToPath(import.meta.url)` sites (measured by `rg`): 3507, 3997, 4033, 4063, 4101, 4137, 4196, 4326, 4355, 4368, 4784, 4922, 5099, 5912, 6155, 7262, 7376, 7425, 7462, 9330, 9559 (the earlier note listed 20 and left 5099 unread; 5099 is `const writer = fileURLToPath(import.meta.url);` inside one long line). They emit the writer's **own CLI path** into next-action argv (e.g. 4355 `argv: [fileURLToPath(import.meta.url), "set-phase", "--phase", "implementation"]`, 4784, 7376, 7425) or into `writer`/`scriptPath` locals; moved verbatim they would evaluate to `lib/state/<module>.mjs`, which is not the writer. Without b2 the extractor refuses (safe); with a naive "ignore" it would produce wrong paths **silently**. b2 rewrites `fileURLToPath(import.meta.url)` to `fileURLToPath(new URL("<posix.relative(moduleDir, facade)>", import.meta.url))` (= `"../../scripts/pipeline-state.mjs"`, the same relative computation as :655), enumerated in `check` like (b).
2. **`run` per-case extraction (verbs mode).** A declaration is atomic (:411-435); nothing emits part of a function. New map key `verbs: { "<case label>": { module, handler } }` plus a mode that tokenises `run`'s `switch (sub)` (10084-12366), emits `export function verb<Name>(ctx) { const { <12 locals> } = ctx; <body> }`, and in `check` proves (i) the bijection case labels <-> handlers (25 cases plus the inline route 10005-10009), (ii) body byte-equality after removing one fixed indentation prefix, (iii) `commands.mjs` is the regeneration of the table. It relies on three measured facts (1.4): every case is braced, none ends in `break`, none defines an inner function; the tool re-asserts them rather than assuming.
3. **Facade header comment.** `moduleHeader` (:661-668) writes shebang (:663), `// SPDX-License-Identifier: SUL-1.0` (:664) and `map.facadeHeader` (:665) only. The writer's ~367-line contract comment is attached to the first import (that unit measures 2-376, decls.out.txt:8; whether the extractor's tokenizer attaches it the same way is **inferred**), so the computed import header would drop it and could duplicate the SPDX line. Needed: a map flag that carries the first unit's leading comment verbatim into the facade, verified byte-for-byte by `check`.
4. **Guard-specific strings:** module header text (:666 "Guard module ... s2-guard-split-plan.md"), schema ids `pipeline.guard-split-check.v1` (:727) and `pipeline.guard-split-graph.v1` (:867), `DEFAULT_SOURCE` (:49), the file header (:2-41). Make them map parameters defaulting to today's values so the S2 tests stay green.

Recommendation: **generalise in place** (S3-00), do not copy a 1,000-line second extractor. Unverified until S3-00 runs: whether the writer trips :377/:400/:458 (the writer has minified lines such as 9953, but they sit inside function bodies; `list` settles it).

### 3.2 The two non-byte-identical steps and why they are provable

- **b2** (self-path): textual change is one token run per site; proof = enumeration in `check` + the runtime self-path assertion of section 4 item 6.
- **Verbs wrappers (d):** the textual change is the function frame, one destructuring line and a constant dedent; proof = bijection + normalised identity (above) + the CLI differential (section 4 item 5). `run` returns an exit code from every case; wrappers are called as `return verbX(ctx)` by `commands.mjs`, so control flow is preserved. This is the only step where a reviewer reads generated code; fallback if the proof is rejected: keep `run` verbatim in one `run.mjs` (2,372 lines) and defer extraction to package 2 (Q1 option B).

### 3.3 Waves and slices

Ground rules (S2 section 3, applied): the writer is frozen from S3-00 until package 1 is applied (any hotfix invalidates the verbatim check; re-run the extractor if one must land). All module slices write **new files only**, so write scopes are disjoint by construction; none touches the writer or a protected path; they land as ordinary Goldfish commits **before** the package is built. Until the package flips the facade, the live writer is the monolith, so a half-landed split cannot affect a running session.

| Slice | Wave | Content | Files written | Proof | Protected? | Size |
|---|---|---|---|---|---|---|
| S3-00 | W0 | extractor delta 3.1 (b2, verbs mode, header carry, parametrised strings) + tests | `harness/scripts/guard-split-map.mjs`, `harness/scripts/guard-split-map.test.mjs` | S2 suite stays green; new fixture cases | no | L (deep) |
| S3-01 | W0 | `harness/state-split-map.json` (declaration -> module from section 2, `verbs` table) and a `list` + `graph` run on the freeze base | map file | `graph` reports no cycle; settles every "inferred" edge in 1.2/2.3 (R-S3) | no | M (deep) |
| S3-10..12 | W1 | `constants`, `primitives`, `command-table` | `lib/state/constants.mjs`, `primitives.mjs`, `command-table.mjs` | `check`, `graph`; table rows == 77 verbs of 1.4 | no | S |
| S3-20..22 | W2 | `continuity-lock`, `recovery-bridge`, `phase-projection` | 3 files | `check`, `graph` | no | S |
| S3-30..36 | W3 | `store`, `continuity-request`, `physical-files`, `push-proof`, `verify-binding`, `plan-verb-support`, `po-gate-check` | 7 files | `check`, `graph` | no | M |
| S3-40..46 | W4 | `continuity-result`, `publication`, `plan-profile`, `plan-approval`, `po-authority-common`, `feature-package-read`, `enrollment-retirement` | 7 files | `check`, `graph` | no | M |
| S3-50..58 | W5 | `course-transactions`, `continuity-maintenance`, `authority-revision`, `result-lifecycle`, 3x `po-authority-*`, `feature-package-write`, `closed-evidence` | 9 files | `check`, `graph` | no | M |
| S3-60..61 | W6 | `continuity-commands`, `inspect` (module part) | 2 files | `check`, `graph` | no | M |
| S3-70..74 | W7 | four `verbs-*` modules (generated), `inspect` verb wrapper, `commands.mjs` (S3-74 last) | 5 files | verbs proof (bijection, normalised identity), `graph` | no | L (deep; the only non-byte-identical slices) |
| S3-80 | W8 | contract test `lib/state/state-split-contract.test.mjs` (facade <= 500 lines, 29-name surface equality, layer DAG from the map, table conformance, dispatch-order pins, no bare self-path left); kernel-closure check | test file; `lib/guard-maintenance-window.mjs` only if its kernel list names the writer (inferred, **not read**: `git grep -l` hit in the previous dispatch) | `guard-maintenance-window*.test.mjs` | no, to be confirmed | S-M |
| S3-90 | W9 | **package build** in `scratch/qp-s3/`: generated facade, `protected-baseline.json` extension, `verify.mjs` registration | package request only | Critic review before signing | **yes, ONE signed package** | M (deep) |
| S3-91 | W9 | equivalence run (section 4) on the exact candidate, WSL native clone, before the PO is asked to sign | evidence files under `specs/sprint-alfred-epic/evidence/` | all of section 4 | no | M |

Waves run in order; slices inside a wave run in parallel (disjoint new files). If the host-commit route is not proven for fan-out, one committing agent at a time applies (extraction is mechanical). Tier hint: S3-00, S3-01, S3-70..74, S3-90 deep; the rest are extractor runs plus a diff review.

**Signed package 1 (S3-90) contains only three protected edits:** (1) the facade `plugins/pipeline-core/scripts/pipeline-state.mjs`; (2) `plugins/pipeline-core/protected-baseline.json` extending `PB-SANCTIONED-WRITER`'s `pathPattern` (open question Q2); (3) `harness/scripts/verify.mjs` registering the contract suite (a `harness/verify-suites.json` entry only if `check-verify-suite-registration.mjs` demands one).

### 3.4 Protected-path status per target

| Target | Status (read from `plugins/pipeline-core/protected-baseline.json` and the TP table of `templates/prompts/agent-obligations.md`) |
|---|---|
| `scripts/pipeline-state.mjs` (facade) | **protected**: `PB-SANCTIONED-WRITER` (:42-46, class `sanctioned-writer`, pattern `plugins/pipeline-core/scripts/pipeline-state\.mjs$`) covers exactly this file |
| `lib/state/*.mjs` (36 new modules) | **no PB or TP pattern matches** (`PB-GUARD-HOOKS` :24-28 names only five hooks; `PB-CONTRACT-TESTS` :30-34 names only guard/protected-test-path suites). Without Q2 they would be unprotected authority code |
| `lib/state/state-split-contract.test.mjs` | not matched by `PB-CONTRACT-TESTS`; registration in `harness/scripts/verify.mjs` is **TP-3** (signed package) |
| `harness/scripts/guard-split-map.mjs`, its test, `harness/state-split-map.json` | unprotected |
| `harness/scripts/pipeline-state.mjs` (20-line shim, `export *`) | unprotected, unchanged |
| `plugins/pipeline-core/scripts/pipeline-state-*.test.mjs` (the 18 satellite suites named in 1.3) | **not TP-5**: TP-5 is `(?:plugins/pipeline-core/hooks/guard-push(?:-v2)?\|harness/scripts/pipeline-state)\.test\.mjs$`, which needs the literal `harness/scripts/pipeline-state.test.mjs` and the two push hooks. Ordinary editable files; fixes still follow the test-only-dispatch-first rule (QG-04) |
| `harness/scripts/pipeline-state.test.mjs` (PS06a0 at :1156-1157) | **TP-5 protected**: `guard-testpath` refuses Edit/Write; needing an edit is a stop condition for a Goldfish (agent-obligations section 2). The route (human override vs author repair vs signed package) is for the Elephant/PO to select with `repair-map.mjs` (not run here); see Q9 |

Observed at HEAD: `PB-GUARD-HOOKS` has **no** `lib/guard` alternative (:24-28), although S2's Q1 recommended extending it; whether S2 decided otherwise is not determined here, so Q2 must follow whatever S2 decided.

## 4. Equivalence strategy

All of it is evidence that the exact candidate is unchanged in behaviour; none of it is model prose. Package 1 only; package 2 is a deliberate behaviour change (section 5) and has its own tests.

1. **Verbatim proof (static, per slice and at the end).** `guard-split-map.mjs check --map harness/state-split-map.json --base <freeze-sha>`: every one of the 430 declarations of the base blob (296 functions, 134 constants; `run` is covered by item 2) appears exactly once across facade + modules, byte-identical after the whitelist, whose sites are enumerated: 4 transform-(b) sites (736, 4159, 4213, 4260), **21 transform-(b2) sites**, the facade-only site 12370 unchanged, plus the `export ` prefixes. Output machine-written under `evidence/`.
2. **Verbs proof.** Bijection of the 25 cases and the inline route to handlers; per-body byte equality after one fixed dedent; `commands.mjs` regenerated from the table and compared byte-for-byte.
3. **Import-surface snapshot.** `export-surface` for the base blob, the candidate facade and the `harness/scripts/pipeline-state.mjs` shim (`export *`): the same **29 names** with the same `typeof`.
4. **Existing suites before and after on the exact candidate.** Every importer of 1.3: the 38 test importers (incl. the protected `harness/scripts/pipeline-state.test.mjs`, run unmodified) plus the guard suites reaching `readState`/`classifyVerifyCommand`. Run A: candidate HEAD with the modules present and the monolith still the live writer. Run B: the staged facade applied. Compare per-test names and statuses from a machine-written result file (the reporter invocation is fixed by S3-91; it must write the file itself). Required: identical name set, identical statuses, zero new failures. Four suites are red at the baseline (5.5), so the criterion is "identical to A", not "green".
5. **CLI differential (new script `harness/scripts/pipeline-state-differential.mjs`, modelled on `harness/scripts/guard-grammar-differential.mjs`).** It materialises the base writer from `git show <base>:plugins/pipeline-core/scripts/pipeline-state.mjs` into a private temp directory (relative specifiers and `import.meta.url` rewritten to the live location, as the S2 differential does) and runs a corpus through both: all 77 verbs plus `help`/`--help`/`-h` and an unknown verb, each over three state conditions (absent, valid, malformed) in temp project roots, with the `deps` seam of `run` (9995-10000: `dir`, `now`, `gitHead`, `gitCandidate`, `poGateAuthority`) injected so output is deterministic. Compared: exit code, stdout, stderr, resulting state bytes. Scope of the corpus is an S3-91 decision (**inferred**): argument-error paths for all 77 verbs (cheap, they exercise routing and the dispatch order of 2.5, including the malformed-state-before-help quirk) plus success paths for a named subset (`set-feature`, `submit-plan`, `approve-plan`, `set-phase`, `inspect`, `continuity-init`, `continuity-cas`); the remaining verbs rely on item 4.
6. **Self-path assertion.** For each b2 site, the observable next-action `argv[0]` equals the facade path: covered by the inspect suites (`pipeline-state-inspect.test`, `pipeline-state-inspection-contract.test`; **inferred** from their names) and pinned statically by the contract test (no bare `fileURLToPath(import.meta.url)` left under `lib/state/`; every `new URL(..., import.meta.url)` target exists).
7. **Startup cost.** The monolith is one file; the facade loads 36 modules (the ~40 `lib/*` imports are loaded today as well). Measure cold start of `node plugins/pipeline-core/scripts/pipeline-state.mjs help` and of the guard hot path (`hooks/guard-lifecycle-ready.mjs --runner claude` with a trivial allowed input; it imports the writer facade at :57), 20 runs before and after, on WSL and native Windows; gate: median regression <= 25 % (S2 R-5 precedent). Until 5.4 repoints the guard importers, **every PreToolUse loads all 36 modules**; mitigation if the gate fails: merge by layer (Q5) or pull the 5.4 repoint into package 1.
8. **Kernel closure and protected delta.** S3-80 tests before and after; `plugins/pipeline-core/scripts/check-protected-delta.mjs` on the integration branch to learn whether the new `lib/state/*` files are reported as protected delta once the Q2 pattern lands.
9. **Contract test** (S3-80): facade <= 500 lines, 29-name surface equality, layer DAG, table conformance, dispatch-order pins.

Where each runs:
- **WSL (native Linux clone, never a drive mount):** full Verify `--mode candidate`, items 1-9, the A/B comparison.
- **Native Windows (single test files only, never the full Verify; PO rule):** `guard-split-map.mjs check|graph|export-surface`, the contract test, the differential script, the startup timing, and individual satellite suites; nothing else.
- **macOS:** no host: untested; covered by the verbatim proof (platform branches move unchanged) and the PO host matrix.

## 5. Package-2 behaviour backlog (stage row S3+R5, after the flip)

Package 2 changes behaviour, so it cannot ride in package 1 without destroying the equivalence proof (S2 section 3 reasoning, applied). It is built **after** the flip as lane slices on the split modules, signed once (the writer facade stays `PB-SANCTIONED-WRITER`, and new `lib/state/*` files are covered if Q2 is accepted). Each item starts with a **test-only dispatch** (QG-04: the implementing Goldfish never writes the test for its own fix). Every claim below is anchored at the base line numbers of section 1; `lib/plan-spec-state-v2.mjs` (the state shape behind `submitPlan`/`approveSubmittedPlan`/`enterPlanImplementation`, imported at 438-458) was **not read** and is the main unmeasured dependency of 5.1/5.2.

### 5.1 One `authority` record per submission

Measured today: the PO-gate authority (`checkPoGateAuthority`, 9710-9865: `planPath`, `planSha256`, `specPath`, `specSha256`, key reference) is **re-derived and re-compared three times**: `submit-plan` (10339-10477) resolves it (10357), passes `poGateAuthority: authority.value` into the submission (10425) and compares `nextAuthority.value` with it again at 10456 (a commit-time check, inferred by analogy with 11097-11127); `seal-plan-approval` (10726-10773) compares it field by field against the stored submission (10734-10737); `approve-plan` (10816-11146) resolves it again (10846-10863), compares the package sources (10911-10914), passes `authority.value` into `approveSubmittedPlan` (11075) and checks equality once more in `beforeCommit` (11097-11127). Target: **one** `authority` record written at submission (hash-bound, the value `checkPoGateAuthority` returned) that later verbs verify instead of re-deriving. A separate, already existing record is `continuity.authority.{prd,spec}`, replaced by the authority-revision writer (5111-5113), which is not the same object.
Lands in: `verbs-plan-submission` (`submit-plan`, `present-plan`), `verbs-plan-authority` (`seal-plan-approval`, `approve-plan`, `bind-plan-spec`), `po-gate-check`, `plan-approval` (`observeDesignWorkflowSignatureApproval` 8900 takes `authority`), plus `lib/plan-spec-state-v2.mjs` (inferred, not read).

### 5.2 `approved` removed as a resting state (approve-plan = entry readiness + verify binding + phase flip)

Measured today: the lifecycle is `draft -> awaiting-approval -> approved -> implementing` (comment 3706); `approve-plan` ends at `lifecycle="approved"` and prints that implementation writes stay refused until `set-phase --phase implementation` ("approval and implementation-start are separate deliberate acts", 11134-11135). The implementation branch of `set-phase` (10205-10294) is exactly the three parts of the target: **entry readiness** (`inspectSelectedPlanProfile` 10212; `inspectArchitectureEntryReadiness`, imported at 426, called at 10231, refusal at 10241), **verify binding** (`--verify-command` or `readCalibrationVerifyStatus`, 10252-10264; `writeCalibrationVerifyCommand` via `afterValidation`, 10276), and the **phase flip** (`enterPlanImplementation`, 10267, inside the `writeState` transaction). Target: `approve-plan` performs all three in one `writeState` transaction together with `approveSubmittedPlan`, so `awaiting-approval` leads directly to `implementing`.
Touch points by module: `verbs-plan-authority` (`approve-plan` absorbs the branch and needs `--verify-command` intake), `verbs-phase-push` (`set-phase implementation` becomes an idempotent replay or disappears, Q12), `verify-binding` (`classifyVerifyCommand`, `readCalibrationVerifyStatus`, `writeCalibrationVerifyCommand`, `prepareCalibrationVerifyWrite`), `inspect` (the `approved` branch 4312-4349 and the `expected.statuses` lists that name `approved`, 4223, 4271, 4349), `plan-profile` (status set `draft/awaiting-approval/approved/implementing` at 7056), `phase-projection` (the `source: "approved"` labels at 1029 and 1038, check only), `lib/plan-spec-state-v2.mjs` (`derivePlanLifecycle`, 445, used at 3503, 3846, 3988, 4860, 4984, 5718, 6066, 7055, 7072, 7177, 9953, 9975, 10218, 10308, 10593, 10840; plus the two transitions). Interplay with the guard ready-gate and `lib/guard/entry-gates.mjs` (the 0.7 plan's PF-1/8/12 and PF-10/11 items) is **inferred**, not read. Existing persisted states in `approved` need a typed migration (S7 hint) and a decision on what `approve-plan` does for them: Q6.

### 5.3 Simplified design-course ledger with `revise`

Measured today: result-append collections `decisionBriefs`, `courseDecisionIntents`, `courseDecisionReceipts`, `finalIntegrations` (`RESULT_APPEND_COLLECTIONS`, 748-753); transactions `runFinalIntegrationTransaction` (2143-2246), `runCourseBriefTransaction` (2284-2358), `runCourseSelectionTransaction` (2445-2611); verbs `continuity-record-course-brief`, `-select-course`, `-apply-decision`, `-clear-decision` through `runContinuityCommand` (2818-2946, set 754-766); plus `reopen-design` (10689-10725) and the importer `scripts/design-course-session.mjs:196`; guard admission suite `hooks/design-course-command-admission.test.mjs`. **What "simplified" removes and what `revise` does are not specified in the inputs** (the requirement is one clause): Q11. Lands in `course-transactions`, `continuity-result` (collections, `validateCourseArtifacts` 1809), `continuity-commands`, `command-table` (new row), `verbs-plan-submission` (`reopen-design` interplay), and the importer script.

### 5.4 Guard dependency inversion (MP-2) and R1 consumption

Four guard files import the writer today, for two names only: `hooks/guard-lifecycle-ready.mjs:57` (`classifyVerifyCommand`, `readState`; **PB-protected**), `lib/guard/command-catalogue.mjs:9` (`readState as readDesignCourseState`, re-read this dispatch), `lib/guard/entry-gates.mjs:10` and `lib/guard/sanctioned-args-scripts.mjs:7` (`classifyVerifyCommand`; importer lines from 1.3). After package 1 both names live in guard-facing leaves (`store`, `verify-binding`). Plan: repoint the three `lib/guard/*` importers (not PB-protected at HEAD) as ordinary commits right after W3 and before the flip, repoint the hook (:57) in the signed package that is open anyway (Q4), and let `command-catalogue.mjs` and `sanctionedPipelineStateArgs` (`sanctioned-args-scripts.mjs:337-438`) read `STATE_COMMANDS` (2.5) so the 14 hard-coded verb shapes become table data (R1). Until the hook is repointed every PreToolUse loads all 36 modules (section 4 item 7).

### 5.5 Red suites mapped to target modules

Red status is taken from the dispatch brief (Elephant baseline); **no test was run in this dispatch**, so *why* each is red is not measured.

| Suite | Location (titles re-read) | Target module(s) |
|---|---|---|
| approve-announce | `plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs:148` "approve-plan success output announces the required set-phase --phase implementation step" (pins the two-step flow printed at 11135) | `verbs-plan-authority` (`approve-plan`), `inspect` |
| late-verify | `plugins/pipeline-core/scripts/pipeline-state-late-verify.test.mjs:50` "baseline-only implementation exposes and completes the typed late verify recovery", `:95` "late verify recovery fails closed for malformed twins and non-implementing lifecycle" | `verify-binding` (`isLateVerifyRecoveryLifecycle` 3478, `buildLateVerifyRecoveryAction` 3491-3538), `verbs-phase-push` (`configure-verify`, 10302-10338, the "typed recovery" of comment 10296-10301), `inspect` |
| observer conformance | `plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs` `:263` "approve-plan verb produces state accepted by both observers", `:292` "reopen-design after approved plan", `:315` "revoke-plan after approved plan", `:593` "complete end-to-end lifecycle progression through all transition verbs" (15 tests in the file, per the first dispatch) | `verbs-plan-authority` (`approve-plan`, `revoke-plan`), `verbs-plan-submission` (`reopen-design`) |
| PS06a0 | `harness/scripts/pipeline-state.test.mjs:1156` "PS06a0 submit-plan exit 0", `:1157` "PS06a0-1 present-plan exit 0" (**TP-5 protected**) | `verbs-plan-submission` (`submit-plan` 10339-10477, `present-plan` 10581-10688) |

### 5.6 Defect carried by the pure move and fixed in package 2

`PIPELINE_STATE_COMMANDS` omits five routed verbs (1.4). Package 1 pins them as `listed:false` rows; package 2 derives the list from `STATE_COMMANDS`, which changes the `help` and unknown-verb texts (12353, 12361) on purpose (Q10).

### 5.7 Package-2 slice shape

P2-A authority record (`lib/plan-spec-state-v2.mjs`, `verbs-plan-submission`, `verbs-plan-authority`, `po-gate-check`) then P2-B approved-removal (same files plus `verify-binding`, `inspect`, `verbs-phase-push`): **one owner, sequential**, because both rewrite `approve-plan` and the same library. P2-C ledger/`revise` (course modules) is independent. P2-D guard repoint and R1 table consumption (`lib/guard/*`, hook :57) is independent. P2-E `PIPELINE_STATE_COMMANDS` derivation and conformance test. Red suites: test-only dispatches first.

## 6. Risks and open questions

| Id | Risk / question | Proposed answer | Size |
|---|---|---|---|
| R-S1 | A circular import appears between the 36 modules | Layers derive from measured edges; `graph` fails on any back-edge; the contract test pins the DAG | S |
| R-S2 | `import.meta.url`-relative resolution and the 21 self-path sites change meaning at depth | Transforms (b) and (b2) are whitelisted and enumerated; section 4 items 1 and 6 | M |
| R-S3 | The 1.2 edges are **identifier-level** (comments, strings and local names over-count; unmeasured inside C17 and C06) | S3-01 token-level `graph` settles them before any module slice; fallback: adjust the map, never the code | S |
| R-S4 | The installed plugin copy and the distribution inventory do not know `lib/state/` | `claude plugin validate`, installed-plugin attestation, `harness/scripts/check-consumer-safe-paths.test.mjs` on the candidate; refresh the installed copy only after green A/B evidence; if an allowlist enumerates files, extend it in the package | S |
| R-S5 | A half-landed split affects a running session | It cannot: modules are inert until the facade lands, the live writer is the installed copy | none |
| R-S6 | Every PreToolUse loads 36 modules until 5.4 | Measure (section 4 item 7), gate +25 %; mitigations: merge by layer (Q5) or repoint the hook inside package 1 | M |
| R-S7 | S0 duplicate-name ratchet: while both the monolith and the modules exist, every moved declaration exists twice; `sha256Bytes`, `syncDirectory`, `exactObjectKeys` may already exist elsewhere in `lib/` (not measured) | Run the ratchet in S3-91 (S2 R-6 precedent); the extractor moves, never copies | S |
| R-S8 | Moved authority code becomes unprotected | Q2 | |
| R-S9 | Tests that import the writer by identity, by dynamic `import()` (e.g. `scripts/design-course-session.mjs:196`) or by spawned child | Re-exports preserve identity; module-level evaluation order and env reads at import are **inferred** unchanged; covered by run B | S |
| R-S10 | Line numbers drift; a hotfix lands in the writer mid-split | Everything is keyed by declaration name (S2 R-11); `check --base` pins the sha; the writer is frozen from S3-00; if a hotfix is unavoidable, re-run the extractor | S |
| R-S11 | The 26 generated verb wrappers are the only non-byte-identical code | Normalised-identity proof + CLI differential + A/B; fallback Q1 option B | M |
| R-S12 | Dispatch order (pre-state routes, malformed-state exit before `help` and unknown verb) silently changes when `run` becomes table-driven | Pinned by the contract test and by the differential corpus (all verbs over absent/valid/malformed state) | S |
| R-S13 | 11 transitional lib-to-script inverted imports become S8 fitness findings | Recorded in 2.4 for the baseline; no S3 change | none |
| R-S14 | `check-protected-delta` may report the new `lib/state/*` files as protected delta once the Q2 pattern lands in the same candidate | Run it on the integration branch (S3-91) before the signature request | M |
| R-S15 | The writer is the most-touched file (4 red suites, package 2, backlog items): the freeze competes with other writer work | Sequence S3 against the other writer-touching work explicitly (Elephant decision) | M |
| R-S16 | S1 `lib/shared` state not measured; S3 does not depend on it | `primitives` is the future migration target | none |

Open questions for the PO (drafts from the first dispatch, merged and extended; "was" = first-draft number):

| Id | Question | Proposed answer |
|---|---|---|
| Q1 (was Q1) | Extract the 26 inline handlers into verb modules **in package 1**, or keep `run` verbatim (one 2,372-line `run.mjs`, S2's `evaluate.mjs` precedent) and extract in package 2? | **Extract in package 1**, last wave: package 2 changes `approve-plan`, `set-phase`, `submit-plan` by name and R1 needs per-verb handlers; a 2,372-line module is 3x the largest S2 module. Cost: one non-byte-identical, mechanically proven step (3.2). Option B is the fallback |
| Q2 (was Q2) | Extend `PB-SANCTIONED-WRITER` to `plugins/pipeline-core/lib/state/[^/]+\.mjs`? | **Yes**, in package 1, otherwise the split moves authority-bearing code out of protection (S2 Q1 analogue). Follow whatever S2 decided: at HEAD `PB-GUARD-HOOKS` has no `lib/guard` alternative |
| Q3 (was Q3) | New whitelisted transform b2 for the 21 self-path sites, or a shared `WRITER_SCRIPT` constant? | **b2**: keeps the move byte-identical modulo an enumerated token rewrite; a constant would edit 21 declarations by hand |
| Q4 (was Q4) | Repoint the four guard importers (the hook :57 is PB-protected) in package 1 or in package 2? | The three `lib/guard/*` importers as ordinary commits before the flip; the hook in package 2 (R1 changes the guard anyway) unless the section 4 item 7 gate fails, then in package 1 |
| Q5 (was Q5) | 36 modules, or merge by layer (e.g. `primitives`+`command-table`, the three `po-authority-*`, the four `verbs-*`) to about 28? | Start with 36 (disjoint slices, smaller review units); merge only if the startup gate or the slice count hurts. S1 `lib/shared` and the S0 ratchet are unmeasured (R-S7, R-S16) |
| Q6 (was Q6) | Two PO signatures (package 1 move, package 2 behaviour)? And what happens to existing states in `approved`? | Two signatures, as S2 Q4. Package 2 needs a typed migration for persisted `approved` states and a PO decision on their `approve-plan` replay |
| Q7 (was Q7) | The four red suites: leave red through package 1 (A/B "identical to A") and fix in package 2, or fix first? And does each encode the target behaviour or a stale one? | Leave red in package 1. Direction **not determinable from the inputs** (no test run): the Elephant should read the four failures once before package 2 is briefed |
| Q8 (was Q8) | Facade budget with the ~367-line header comment? | **Resolved by design**: the dispatcher lives in `commands.mjs`; the facade is about 425 lines (budget 500) with the comment verbatim. Confirm keeping the comment in the facade |
| Q9 (was Q9) | Which route edits the TP-5 protected `harness/scripts/pipeline-state.test.mjs` (PS06a0)? | PO/Elephant choice with `repair-map.mjs` (not run here); a Goldfish must stop on it |
| Q10 (new) | In package 1, keep `PIPELINE_STATE_COMMANDS` verbatim (72 listed) and mark five table rows `listed:false`, or list them already (changes help text)? | Verbatim in package 1, derive in package 2 (5.6) |
| Q11 (new) | What does "simplified design-course ledger with `revise`" mean: which collections go, what does `revise` do and who may call it? | Needs a PO-level spec before package 2 (5.3); the stage row is a single clause |
| Q12 (new) | After `approved` is removed, do `set-phase --phase implementation`, `seal-plan-approval` and `present-plan` stay as verbs, become replays, or go? | Keep `set-phase implementation` as idempotent replay for one release (existing sessions and guard hints name it); decide the other two with 5.1 |
| Q13 (new) | Package 1 preserves the quirk that a malformed state file exits 2 before `help` and the unknown-verb refusal; fix it in package 2? | Preserve in package 1 (R-S12); fix in package 2 with a test |

## 7. Matrix

Runner (Claude / Codex / Antigravity) x platform (native Windows / WSL / macOS) x repository (own / consumer). Expected effect of the split in every cell: **none** (pure move; same CLI entry `node <plugin-root>/scripts/pipeline-state.mjs <verb>`, same 29 exports, same exit codes). Cell status: **OBS** observed in this planning dispatch, **CONS** holds by construction, **PLAN** verification specified, not run, **NV** not verified.

| Runner x platform | own repository | consumer repository |
|---|---|---|
| Claude x native Windows | **OBS**: read-only analysis of this repository plus one test file run (`check-consumer-safe-paths.test.mjs`); no writer verb and no `pipeline-state` suite was run. **PLAN**: single test files only (contract test, `check|graph|export-surface`, differential, startup timing); no full Verify | **NV**: no consumer repository touched (read-only rule). **CONS** for the code path (the writer is runner-neutral and path-parameterised by `projectDir`); the plugin distribution must ship `lib/state/` (R-S4) |
| Claude x WSL | **PLAN**: full Verify `--mode candidate` in a native Linux clone, A/B per-test comparison, protected-delta, kernel closure. Not run | **NV**; consumer-shaped temp roots in the project-onboarding and runtime-handover suites run in runs A/B (**PLAN**) |
| Claude x macOS | **NV** (no host); **CONS** by the verbatim proof (platform branches such as the `win32Path` use and `assessWindowsPrivatePath` move unchanged) | **NV** |
| Codex x native Windows / WSL | **NV**; **PLAN** same placement rule as Claude. **CONS**: the writer has no runner-specific control flow except the `PO_REBIND_RUNNERS` data (6298) and `resolvePoRebindRunner` (6931), which move verbatim | **NV** |
| Codex x macOS | **NV** | **NV** |
| Antigravity x native Windows / WSL | **NV**; **PLAN** `hooks/antigravity-pretool-guard.test.mjs` (it imports the writer, 1.3) as a single file on Windows, in the WSL run for Linux. **CONS** as Codex | **NV** |
| Antigravity x macOS | **NV** | **NV** |

Placement rule (PO): full Verify only in a native WSL clone, never on Windows; native Windows runs single test files only; macOS has no host and is covered only by the verbatim proof and the PO host matrix. Nothing in this plan has been implemented, and no consumer repository was read or written.

