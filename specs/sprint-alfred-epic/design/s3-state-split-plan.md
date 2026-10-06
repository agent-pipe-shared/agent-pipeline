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
Measured by `analyze2.mjs`: **three routed verbs are missing from it**: `continuity-adoption-plan`, `continuity-adoption-apply` (routed at 10038, in
`CONTINUITY_SUBCOMMANDS` 764-765) and `configure-verify` (case at 10302); every listed verb has a route. Accepted verbs = 72 + 3 = **75**, plus `help`/`--help`/`-h`
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

<!-- S3PLAN-CONTINUES -->
