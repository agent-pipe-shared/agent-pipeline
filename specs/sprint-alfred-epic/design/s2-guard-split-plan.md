# S2 plan: splitting the guard monolith (`hooks/guard-lifecycle-ready.mjs`)

Plan stage S2 (+R1/R2 structure). Design analysis only; nothing in this file has been implemented. Base: candidate
`c6e49a065`; monolith = 7,560 lines, 308 top-level declarations, 40 named exports plus `main`.
All line numbers below are **at `c6e49a065`**, read from the code (declaration scan plus targeted reads); the
module proposal's ranges (`module-proposal.md` MP-1) describe a 7,057-line older version and are about 500 lines
stale, so every slice must address code **by declaration name**, never by line number.

Method: `scratch/s2plan-deps.mjs` (a throwaway analysis helper, not shipped) split the file into 308 top-level
declarations, grouped them into 31 clusters by position, and measured cross-cluster references by identifier. Its
machine-written output is `scratch/s2plan-deps.out.json` (scratch is ignored by git: the numbers that matter are
reproduced here; the productized form is slice S2-00).

## 1. Current structure

### 1.1 Responsibility clusters (line ranges, decl counts, sizes at `c6e49a065`)

| Cluster | Lines | Content (functions read) | Notes |
|---|---|---|---|
| C00a | 152-168 | `PLUGIN_ROOT`, `BOUNDED_PIPELINE_ADDITIONAL_ROOTS`, `MAX_CLAUDE_TASK_OUTPUT_READ_BYTES` | `import.meta.url` based |
| C00b | 170-223 | `BASE_GOVERNANCE_MARKERS`, `MANIFEST_FAILURE_WARNING`, `governanceMarkers` | exported; no intra-file consumer |
| C00c | 224-352 | 49 constants: 28 `*_SCRIPT` paths (`new URL("../scripts/...", import.meta.url)`, lines 227-275), status sets, tool lists, denial codes | the implicit command catalogue |
| C01 | 354-388 | `verdict`, `withLifts`, `exactReadyReceipt` | referenced by 21 of the other clusters |
| C02 | 390-663 | `isImplementationAuthorityTransition`, `activeFeature*`, `architectureAdoptionAuthorityVerdict`, `architectureFitnessAuthorityVerdict`, `minimumRigorObservation` | PF-10/PF-11 target |
| C03 | 665-850 | denial guidance/remedy text, `ADMITTED_GRAMMAR_SHAPES`, `grammarShapeLines`, `rejectedGrammarElement` | text/data plus one function |
| C04 | 852-925 | `w04*` record-write lane (own mid-file `node:fs`/`node:path` imports at 852-853) | |
| C05 | 927-1260 | `blocked` (107 lines), `humanOverrideRoute`, `externalRestartOnly`, `protectedStateWriterOnly`, `boundAuthorityDocumentPath` | HGO route |
| C06 | 1261-1476 | evidence host-path + dispatch-record ownership/collision (`claimDispatchRecordOwnership`, `checkDispatchRecordCollision`, `extractWritePayload`) | F-3 lives here |
| C07 | 1478-1562 | `crossRepositoryMutationBlocked`, `bootstrapAcknowledgementMarkerBlocked` | |
| C08 | 1564-1868 | gate-strength shell lane, `signedQualityPackageCommandAdmission`, `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS` | |
| C09 | 1870-1977 | protected-test-path shell lane | |
| C10 | 1979-2202 | dev-plan shell lane (`devPlanShellRefusalHit`, `opaqueScriptExecutionCandidate`, PowerShell targets) | |
| C11 | 2204-2316 | rebase authority shape/admission (`rebaseAuthorityShapeRefusal`, ...) | |
| C12 | 2318-2693 | `pathInside`, `isPathWithinRealpathedRoot`, `isProjectWritePath`, session memory/transcript/task-output scopes, `isMachinePlaneWritePath`, resume-hint write detection | mixes write and read concerns |
| C13 | 2695-2822 | `simpleWords`, `exactRoot`, `matchFlagSpec`, `sanctionedSessionCriticFinalizerArgs`, `isRestartResumeHintCapture/Inspect` | helper hub (referenced by 12 clusters) |
| C14 | 2824-4044 | closed shell grammar: bounded pipelines, `&&`/newline chains, passive-read lane, `qp4*` operand scan, `isReadOnlySimpleWords` (110), `isReadOnlyDiagnosticCommand`, remediation, `retryActionsForDeniedCommand` | 1,222 lines, the largest cluster |
| C15 | 4046-4319 | `commandPath`, redirect classifiers, `isOutsideRootBoundedDiagnosticRead`, `isOutsideRootSingleCommandRead` | |
| C16 | 4321-4521 | `isAgentPoPublicCommand`, `isHumanPoSigningCommand`, `isForbiddenCrossRepositoryMutation` (79) | |
| C17 | 4523-5490 | per-script sanctioned argv validators: `sanctionedOnboardingArgs` (298), `sanctionedPipelineStateArgs` (102), 19 more; `isNarrowRepositoryRecoveryCommand`, `resolveSanctionedScriptInvocation`, `isSanctionedStartPreflightInvocation` | 968 lines |
| C17b | 5491-5685 | design-course validators, `sanctionedLifecycleScriptArgs`, `isSanctionedLifecycleCommand` | |
| C18 | 5687-5925 | `observedOnboardingCommandMatch`, `isExactObserved*Action` (4) | uses `import.meta.url` at 5748 |
| C19 | 5926-5955 | `isSanctionedGhReadOnlyDiagnostic` | |
| C20 | 5957-6086 | scratch/intake/consent write lanes | |
| C21 | 6088-6272 | bootstrap receipt gate (`evaluateBootstrapReceiptGate`, `lifecycleSubagentIdentity`, `recordBootstrapPreflightReceipt`) | R3 SubagentStart target |
| C22 | 6274-6440 | denial-class telemetry, `lifecycleLoopState`, `withLifecycleReturnedActionTelemetry` | |
| C23 | 6442-6795 | `evaluateAfterGrammarAdmission` (320), `withRebaseAuthorityDisclosure`, `evaluateLifecycleReadyGuard` (6 lines, public entry) | |
| C24 | 6797-7013 | Read/Grep/Glob scope: `readToolScopeVerdict`, `qp4*` in-root checks, plugin read roots | |
| C25 | 7015-7106 | PowerShell dialect: `powerShellScopeVerdict`, `sanctionedPowerShellNodeCall` | |
| C26 | 7108-7119 | `isHostOnlyClaudeCaptureInvocation` | |
| C27 | 7121-7560 | `evaluateLifecycleReadyGuardCore` (404 lines: the lane ordering, read in full), `main` (34) | |

Module-level side effects (the only depth-0 statement besides declarations): line 121, an early
`process.exit(0)` when the project is not governed, evaluated at import time **only for direct invocation**
(`isGovernanceHookEntry(import.meta.url)`); and line 7559, `if (isDirectInvocation(import.meta.url)) process.exitCode = main();`.
Both must stay in the facade file so `import.meta.url` still names `hooks/guard-lifecycle-ready.mjs`.

### 1.2 Cross-cluster references (measured)

Fan-in leaders: C01 `verdict` (21 clusters), C00c constants (17), C13 `simpleWords` (12), C14 (11), C12 `pathInside` (6).
Two apparent cycles, both resolvable without behaviour change:

- **{C03, C12, C13, C14, C15}**: measured back-edges are small and are leaf helpers or constants:
  `C03->C14` `rejectedAndChainSegment` (called by `rejectedGrammarElement`); `C14->C03` `MAX_AND_CHAIN_SEGMENTS`;
  `C14->C12` `pathInside`, `isProjectWritePath`; `C13->C14` `isRealpathedWithinBoundary`; `C14->C13` `simpleWords`;
  `C14->C15` `commandPath` (4051-4061, depends only on `node:path`); `C12->C14` `isReadOnlyDiagnosticCommand`
  (task-output reads). Resolution: move the pure path helpers (`pathInside`, `isPathWithinRealpathedRoot`,
  `isProjectWritePath`, `isRealpathedWithinBoundary`, `rawReadCandidatePath`, `commandPath`, `isShellExternalPathToken`,
  `pipelineSourceRoot`, `isPathWithinRoot`) to one leaf module; `simpleWords`/`exactRoot`/`matchFlagSpec` and
  `MAX_AND_CHAIN_SEGMENTS` and `rejectedGrammarElement` into the grammar module; the denial text/data of C03 into a leaf.
- **{C23, C27}**: an artefact of the range cut. `C23->C27` is only `evaluateLifecycleReadyGuard` calling
  `evaluateLifecycleReadyGuardCore`, and `evaluateLifecycleReadyGuard`/`withRebaseAuthorityDisclosure` are the thin
  entry around the core, so they belong with the core, not with `evaluateAfterGrammarAdmission`. No true cycle.

Unmeasured: edges **inside** C14 (chain functions vs `isReadOnlyDiagnosticCommand`). See risk R-14.

### 1.3 Exported and imported surface (who imports what)

Named exports (40 + `main`), all of which the facade must keep re-exporting (importers need no edit):
`BASE_GOVERNANCE_MARKERS`, `MANIFEST_FAILURE_WARNING`, `governanceMarkers`, `ADMITTED_GRAMMAR_SHAPES`,
`EVIDENCE_HOST_PATH_DENIAL_CODE`, `isEvidenceArtifactPath`, `extractWritePayload`, `DISPATCH_RECORD_COLLISION_DENIAL_CODE`,
`DISPATCH_RECORD_OWNER_SCHEMA`, `DISPATCH_RECORD_INTERIM_OUTCOME`, `claimDispatchRecordOwnership`, `checkDispatchRecordCollision`,
`gateStrengthShellNeedleFor`, `isMeaningfulGateStrengthShellNeedle`, `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`,
`signedQualityPackageCommandAdmission`, `isProjectWritePath`, `claudeSessionMemoryDirectory`, `isClaudeSessionMemoryWritePath`,
`isMachinePlaneWritePath`, `isRestartResumeHintInputWrite`, `isRestartResumeHintCapture`, `isRestartResumeHintInspect`,
`isRealpathedWithinBoundary`, `isBoundedCatPipeline`, `isReadOnlyDiagnosticCommand`, `retryActionsForDeniedCommand`,
`isOutsideRootBoundedDiagnosticRead`, `isOutsideRootSingleCommandRead`, `isAgentPoPublicCommand`, `isHumanPoSigningCommand`,
`isForbiddenCrossRepositoryMutation`, `isNarrowRepositoryRecoveryCommand`, `isSanctionedStartPreflightInvocation`,
`isSanctionedLifecycleCommand`, `isSanctionedGhReadOnlyDiagnostic`, `evaluateLifecycleReadyGuard`,
`isHostOnlyClaudeCaptureInvocation`, `main`, and the pass-through `export { machinePlaneFilePath }` (line 128).

Real importers (`rg` of `from ".*guard-lifecycle-ready.mjs"` and `import(...)`), 28 files:
- production: `hooks/codex-pretool-guard.mjs` (:16), `hooks/antigravity-pretool-guard.mjs` (:12, `isSanctionedLifecycleCommand`),
  `harness/scripts/generate-agent-obligations.mjs` (:51), `harness/scripts/apply-pending-protected-edits.mjs` (:450, emitted text,
  `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`); `guard-apply-patch.mjs` spawns it as a child (per the comment at 7540-7541).
- tests: `hooks/guard-lifecycle-ready.test.mjs` (named imports :26-61, dynamic import :10700, **namespace import** :11626
  using `claimDispatchRecordOwnership`), `onboarding-consent-guard`, `lifecycle-denial-loop-guard`,
  `guard-lifecycle-recovery-contract`, `guard-apply-patch`, `design-course-command-admission`, `guard-devplan`,
  `guard-gate-strength`, `claude-intake-reference-admission`, `claude-native-capture-entry` (all in `hooks/`);
  `scripts/{onboarding-init,pipeline-start-preflight,pipeline-state-rebind-runner,pipeline-state,project-onboarding-e2e}.test.mjs`;
  `lib/{onboarding-continuity,plan-authority-staging-guard,project-onboarding-v3}.test.mjs`;
  `skills/pipeline-start/pipeline-start-v3.test.mjs` (:155, dynamic); `harness/scripts/generate-agent-obligations.test.mjs` (:129, dynamic).
- `hooks.json` matchers reference the file path (TP-4); the path does not change.

What the monolith imports: ~35 `lib/*` modules (:3-119), **8 `scripts/*` CLI modules** (`pipeline-start-preflight`,
`architecture-adoption`, `architecture-fitness`, `rigor-floor`, `po-human-approval`, `project-onboarding-v3`,
`pipeline-state`, `capture-evidence`; :45-58), and 3 hooks (`guard-dispatch-budget` :111, `guard-gate-strength` :112,
`guard-command-grammar` :113-117). `guard-command-grammar.mjs` (exports `parseGuardCommand`, `isBoundedSingleRg`,
`isBoundedReadOnlyPipeline`, `isRealpathedWithinBoundary`) **keeps its own copies** of `pathInside` (:280),
`rawReadCandidatePath` (:285) and `isRealpathedWithinBoundary` (:291), duplicates of the monolith's (2332, 3046, 2985).
S2 does not unify them (S0 ratchet / S1 CD-5 own that); S2 must not add a third copy.

`lib/shared/*` (stage S1) **does not exist yet** (`find` on `lib/shared` and `lib/guard`: neither directory exists), so S2 has
no S1 dependency and must not wait for it. The plan row lists S1 as a predecessor; the PO order ("split first") overrides it.

## 2. Target modules (`plugins/pipeline-core/lib/guard/`)

Principle: S2 is a **pure move**. Every declaration is moved byte-for-byte; the only permitted textual changes are
(a) a leading `export ` on declarations that gain a cross-module consumer, (b) the `import.meta.url` specifier depth
(`../scripts/x` becomes `../../scripts/x`; `PLUGIN_ROOT`'s `".."` becomes `"../.."`; sites: line 152, the 28 constants
at 227-275, and 5748), (c) the import header. Module count follows the measured dependency layers, not the proposal's
10 lanes: layering needs more, smaller modules because two big clusters (C14 1,222 lines, C17 968 lines) must be cut.

| Layer | Module | Takes (clusters / declarations) | ~Lines | Public surface (re-exported by facade where marked *) |
|---|---|---|---|---|
| L0 | `constants.mjs` | C00a, C00b, C00c incl. the 28 `*_SCRIPT` (the R1 catalogue's raw material) | 250 | `BASE_GOVERNANCE_MARKERS`*, `MANIFEST_FAILURE_WARNING`*, `governanceMarkers`*, all constants |
| L0 | `path-containment.mjs` | `pathInside`, `isPathWithinRealpathedRoot`, `isProjectWritePath`*, `isRealpathedWithinBoundary`*, `rawReadCandidatePath`, `commandPath`, `isShellExternalPathToken`, `pipelineSourceRoot`, `isPathWithinRoot` | 150 | as listed |
| L0 | `grammar-denials.mjs` | C03 data: `GRAMMAR_DENIAL_GUIDANCE`, `READ_*` codes/guidance/remedy, `ADMITTED_GRAMMAR_SHAPES`*, `grammarShapeLines`, remedy texts | 150 | data only |
| L1 | `verdict.mjs` | C01 + C07 (`verdict`, `withLifts`, `exactReadyReceipt`, `crossRepositoryMutationBlocked`, `bootstrapAcknowledgementMarkerBlocked`) | 130 | as listed |
| L1 | `shell-grammar.mjs` | C14 2824-3492 (pipelines, chains, `splitTopLevel*`), C13 `simpleWords`/`exactRoot`/`matchFlagSpec`, `MAX_AND_CHAIN_SEGMENTS`, `rejectedGrammarElement`, `isBoundedCatPipeline`* | 700 | grammar API |
| L2 | `read-only-commands.mjs` | C14 3495-4044: single-command read args, passive lane, `qp4*` operands, `isReadOnlySimpleWords`, `isReadOnlyDiagnosticCommand`*, `isRejectedReadFamilyCommand`, remediation, `retryActionsForDeniedCommand`* | 550 | |
| L2 | `denial-route.mjs` | C05: `blocked`, `humanOverrideRoute`, `externalRestartOnly`, `protectedStateWriterOnly`, authority-document bound | 334 | |
| L2 | `bootstrap-receipt.mjs` | C21 | 186 | |
| L2 | `sanctioned-args-onboarding.mjs` | C17 4523-4918 (`withoutRunnerFlag`, root-identity helpers, `sanctionedOnboardingArgs`) | 400 | |
| L2 | `sanctioned-args-scripts.mjs` | C17 4919-5490: the other validators, `sanctionedSessionCriticFinalizerArgs`, `isNarrowRepositoryRecoveryCommand`*, `resolveSanctionedScriptInvocation`, `isSanctionedStartPreflightInvocation`* | 580 | |
| L2 | `write-scope.mjs` | C12 write half (`claudeSessionMemoryDirectory`*, `isClaudeSessionMemoryWritePath`*, `isMachinePlaneWritePath`*, resume-hint write detection), C13 `isRestartResumeHintCapture/Inspect`*, `isRestartResumeHintInputWrite`*, C04, C20 | 450 | |
| L3 | `read-scope.mjs` (**R2 owner**) | C15 (`isOutsideRoot*`*), C12 read half (session transcript/task-output roots), C24 (`readToolScopeVerdict`) | 640 | |
| L3 | `gate-strength-lane.mjs` | C08 + C09 | 415 | `gateStrengthShell*`*, `signedQualityPackageCommandAdmission`*, `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`* |
| L3 | `command-catalogue.mjs` (**R1 owner**) | C17b + C18 + C19 (`isSanctionedLifecycleCommand`*, `isSanctionedGhReadOnlyDiagnostic`*, observed next-action matching) | 470 | |
| L3 | `dispatch-record-lane.mjs` | C06 (`claimDispatchRecordOwnership`*, `checkDispatchRecordCollision`*, `extractWritePayload`*, `isEvidenceArtifactPath`*, 3 constants*) | 230 | |
| L3 | `entry-gates.mjs` | C02 | 275 | |
| L4 | `po-commands.mjs` | C16, `externalPoSigningOnly`, C26 (`isAgentPoPublicCommand`*, `isHumanPoSigningCommand`*, `isForbiddenCrossRepositoryMutation`*, `isHostOnlyClaudeCaptureInvocation`*) | 230 | |
| L4 | `rebase-lane.mjs` | C11 | 114 | |
| L4 | `devplan-shell-lane.mjs` | C10 | 225 | |
| L4 | `denial-telemetry.mjs` | C22 | 168 | |
| L4 | `powershell-dialect.mjs` | C25 | 93 | |
| L5 | `lifecycle-gate.mjs` | C23 `evaluateAfterGrammarAdmission` | 330 | |
| L6 | `evaluate.mjs` | C27 `evaluateLifecycleReadyGuardCore`, C23 `evaluateLifecycleReadyGuard`*, `withRebaseAuthorityDisclosure` | ~500 | |
| L7 | **facade** `hooks/guard-lifecycle-ready.mjs` | line-121 early exit, `main`, `runnerFromArgv`, line-7559 direct invocation, re-exports of all 41 names, `export { machinePlaneFilePath }` | **~140 (budget 500)** | the unchanged public surface |

Layers are dependency layers from the measured edges (module X may import only modules of lower layers; imports of `lib/*`,
`scripts/*` and sibling hooks stay as the monolith had them). Sum of module sizes is about 7,560 lines plus import headers.

**Deviation from MP-1 (and why):** the proposal keeps lane ordering (`evaluateLifecycleReadyGuardCore`) in the facade.
Measured: the core alone is 404 lines (7121-7524), `main` 34, so facade-with-core would be ~530 lines with the 41
re-exports and the ~90 identifiers the core consumes (C27 outgoing edges), over the 500 budget. The core is the highest-risk
text in the file (the verdict order); moving it verbatim into `evaluate.mjs` keeps it provably identical. Decomposing the
core into per-lane steps is behaviour-bearing refactoring and belongs to package 2 (section 3), not to the equivalence-proven move.

Other deviations from MP-1: (1) `shell-grammar` is cut into two (`shell-grammar`, `read-only-commands`) and C17 into two;
(2) `denial-route`, `verdict`, `grammar-denials` are three modules (the C03 text/data must be a leaf to break the cycle);
(3) `po-commands` absorbs `isHostOnlyClaudeCaptureInvocation`; (4) the proposal's `lifecycle-gate`/`override-route`/
`denial-telemetry` split is kept in spirit.

Transitional dependency inversions this creates (named so the S8 fitness ratchet baseline accepts them): `lib/guard/*` imports
`hooks/guard-command-grammar.mjs`, `hooks/guard-gate-strength.mjs`, `hooks/guard-dispatch-budget.mjs` (3 lib-to-hook edges) and 8
`scripts/*` modules (lib-to-script edges). Today these are hook-to-hook and hook-to-script; the removal stages are MP-2/S3
(`readState`, `classifyVerifyCommand`) and S4+ (the rest). S2 deliberately keeps them to stay behaviour-neutral.

## 3. Slices

Ground rules: monolith frozen from S2-00 until package 1 is applied (any hotfix landing in between invalidates the verbatim check; if
one must land, re-run the extractor and the check). All module slices write **new files only**, so write scopes are disjoint
by construction; none touches the monolith or any protected path. They land as ordinary Goldfish commits **before** the package
is built (the package binds HEAD and a clean tree). Until the package flips the facade, the live guard still runs the
monolith (the installed plugin copy is a separate tree refreshed by the PO), so a half-landed split cannot affect a running session.

**Keystone: S2-00 builds the extractor.** Hand-copying 7,500 lines is the failure mode. `harness/scripts/guard-split-map.mjs`
(productized from the analysis helper) takes a data file `harness/guard-split-map.json` (declaration name to module, from section 2),
reads the base blob via `git show <sha>:<path>`, and (`extract --module <m>`) emits each module with its declarations byte-identical
(whitelisted transforms (a)-(c) only) and a computed import header; (`check --base <sha>`) proves every declaration of the base blob
exists exactly once across facade + modules, byte-identical modulo the whitelist; (`graph`) asserts the layering (no import of
a higher layer, no cycle) and prints the import-surface snapshot. Each module slice is then "run extract for module X, run check,
review the diff, commit".

| Slice | Wave | Content | Files written | Proof of no behaviour change | Protected? | Size |
|---|---|---|---|---|---|---|
| S2-00 | W0 | extractor + `check` + `graph` + `export-surface` modes, its unit test, the name-to-module data file | `harness/scripts/guard-split-map.mjs`, `harness/scripts/guard-split-map.test.mjs`, `harness/guard-split-map.json` | extractor self-test on a fixture; `graph` on the section-2 map reports no cycle (this also **settles R-14** for C14) | no | M-L (deep tier) |
| S2-10 | W1 | `constants.mjs` | `lib/guard/constants.mjs` | `check`; resolved absolute path of all 28 `*_SCRIPT` and `PLUGIN_ROOT` equal the monolith's (explicit assertion) | no | S |
| S2-11 | W1 | `path-containment.mjs` | `lib/guard/path-containment.mjs` | `check` | no | S |
| S2-12 | W1 | `grammar-denials.mjs` | `lib/guard/grammar-denials.mjs` | `check`; `ADMITTED_GRAMMAR_SHAPES` deep-equal to the monolith's | no | S |
| S2-20 | W2 | `verdict.mjs` | `lib/guard/verdict.mjs` | `check`, `graph` | no | S |
| S2-21 | W2 | `shell-grammar.mjs` | `lib/guard/shell-grammar.mjs` | `check`, `graph` | no | M |
| S2-30 | W3 | `read-only-commands.mjs` | `lib/guard/read-only-commands.mjs` | `check`, `graph` | no | M |
| S2-31 | W3 | `denial-route.mjs` | `lib/guard/denial-route.mjs` | `check`, `graph` | no | S |
| S2-32 | W3 | `bootstrap-receipt.mjs` | `lib/guard/bootstrap-receipt.mjs` | `check`, `graph` | no | S |
| S2-33 | W3 | `sanctioned-args-onboarding.mjs` | `lib/guard/sanctioned-args-onboarding.mjs` | `check`, `graph` | no | M |
| S2-34 | W3 | `sanctioned-args-scripts.mjs` | `lib/guard/sanctioned-args-scripts.mjs` | `check`, `graph` | no | M |
| S2-35 | W3 | `write-scope.mjs` | `lib/guard/write-scope.mjs` | `check`, `graph` | no | M |
| S2-40 | W4 | `read-scope.mjs` | `lib/guard/read-scope.mjs` | `check`, `graph` | no | M |
| S2-41 | W4 | `gate-strength-lane.mjs` | `lib/guard/gate-strength-lane.mjs` | `check`, `graph` | no | M |
| S2-42 | W4 | `command-catalogue.mjs` | `lib/guard/command-catalogue.mjs` | `check`; the 5748 `import.meta.url` site resolves to the same script | no | M |
| S2-43 | W4 | `dispatch-record-lane.mjs` | `lib/guard/dispatch-record-lane.mjs` | `check`, `graph` | no | S |
| S2-44 | W4 | `entry-gates.mjs` | `lib/guard/entry-gates.mjs` | `check`, `graph` | no | S |
| S2-50 | W5 | `po-commands.mjs` | `lib/guard/po-commands.mjs` | `check`, `graph` | no | S |
| S2-51 | W5 | `rebase-lane.mjs` | `lib/guard/rebase-lane.mjs` | `check`, `graph` | no | S |
| S2-52 | W5 | `devplan-shell-lane.mjs` | `lib/guard/devplan-shell-lane.mjs` | `check`, `graph` | no | S |
| S2-53 | W5 | `denial-telemetry.mjs` | `lib/guard/denial-telemetry.mjs` | `check`, `graph` | no | S |
| S2-54 | W5 | `powershell-dialect.mjs` | `lib/guard/powershell-dialect.mjs` | `check`, `graph` | no | S |
| S2-60 | W6 | `lifecycle-gate.mjs` + `evaluate.mjs` (core moved verbatim) | `lib/guard/lifecycle-gate.mjs`, `lib/guard/evaluate.mjs` | `check`, `graph` | no | L (deep tier, single owner of the verdict order) |
| S2-70 | W7 | **kernel closure**: add the 23 `lib/guard/*.mjs` paths to `NEVER_LIFTABLE_KERNEL_PATHS`; contract tests | `plugins/pipeline-core/lib/guard-maintenance-window.mjs` (list only), `lib/guard/guard-split-contract.test.mjs` | `guard-maintenance-window-kernel-closure.test.mjs` (static-import closure of every kernel file must be kernel; no `import()` is used by the new modules, so no `DYNAMIC_IMPORT_EDGES` entry), `guard-maintenance-window.test.mjs`; contract test asserts facade <= 500 lines, 41-name surface equality, layer DAG | `guard-maintenance-window.mjs` is a kernel path but in no PB/TP pattern (`protected-baseline.json` entries read; TP-1..13 read), so it should be editable as an ordinary file: try that first, fold into the package only if a guard refuses it | S |
| S2-71 | W8 | **package build** in `scratch/qp-s2/`: facade (generated by the extractor), `protected-baseline.json` extended, `verify.mjs` registration of the contract suite | package request only | see section 4; Critic review of the package before signing | **yes, ONE signed quality package** | M |
| S2-72 | W8 | equivalence run (section 4) on the exact candidate, in a WSL native clone, before the PO is asked to sign | evidence files under `specs/sprint-alfred-epic/evidence/` | the whole of section 4 | no | M |

Waves run in order; slices inside a wave run in parallel (disjoint new files). W3 has 6 and W4 has 5 parallel slices; if the
host-commit route is not yet proven for fan-out, the execution-order rule applies (one committing agent at a time, the extraction
itself is mechanical and fast). Tier hint: S2-00, S2-60, S2-71 deep; the rest are mechanical extractor runs plus a diff review.

**Which slices are in the ONE signed quality package: only S2-71's three protected edits** (all other slices are ordinary commits):
1. `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (the facade; PB-GUARD-HOOKS),
2. `plugins/pipeline-core/protected-baseline.json` (PB-BASELINE-DATA): extend the PB-GUARD-HOOKS `pathPattern` with
   `plugins/pipeline-core/lib/guard/[^/]+\.mjs`, so that moving authority-bearing logic out of a protected file does not
   silently de-protect it (open question Q1),
3. `harness/scripts/verify.mjs` (TP-3; one new entry next to `guard-lifecycle-ready-tests` at line 296): suite
   `guard-split-contract-tests` for `lib/guard/guard-split-contract.test.mjs`. (`harness/verify-suites.json`, TP-13, holds
   metadata for other suites and does not list the guard suite; a registration entry there is added only if
   `check-verify-suite-registration.mjs` demands one.)

`hooks.json` (TP-4) is unchanged because the entry path is unchanged.

**Two packages, not one, for "S2+R1+R2":** the row's R1 (one command catalogue as data, consumed by producers) and R2
(one read-policy module) and PF-10/PF-11 (the guard calling the entry-readiness library) **change behaviour**. They cannot ride
in package 1 without destroying the equivalence proof, because lane modules are inert and equivalent to the monolith only
while unchanged. Package 1 = the pure move (this plan). Package 2 = R1 + R2 + the R3 guard fixes of section 5, built after the
flip as parallel lane slices in `scratch/qp-r3/`, signed once. This matches execution-order step 2 ("signed package, then
the guard-side R3 fixes as small parallel lane slices"); it means two PO signatures for the IC-2 content (open question Q4).

## 4. Equivalence strategy

All of it is evidence that the exact candidate is unchanged in behaviour; none of it is model prose.

1. **Verbatim proof (static, per slice and at the end).** `guard-split-map.mjs check --base <sha>`: every one of the 308
   declarations of the base blob appears exactly once across facade + modules, byte-identical after removing the three whitelisted
   transforms; the whitelist sites are enumerated (28 + 1 + 1 `import.meta.url` sites, plus the `export ` prefixes). Output file
   machine-written under `evidence/`.
2. **Import-surface snapshot.** `export-surface` mode prints the sorted export names with `typeof` for the base blob and for the
   candidate facade; they must be identical (41 names). `generate-agent-obligations.test.mjs` (byte equality of the derived
   tables) is a second pin on `ADMITTED_GRAMMAR_SHAPES`, `GATE_STRENGTH_SHELL_READ_ONLY_SCRIPTS`,
   `isReadOnlyDiagnosticCommand`, `retryActionsForDeniedCommand`.
3. **Existing suites before and after on the exact candidate.** `hooks/guard-lifecycle-ready.test.mjs` (302 top-level `test(`
   cases, 11.8k lines; it exercises the facade end to end, including the dependency-injection seams) plus every suite listed in
   section 1.3 as a real importer (the 9 satellite suites, the codex and antigravity adapter suites, the 5 script suites, the 3 lib
   suites, the pipeline-start suite). Run A: the candidate HEAD with the modules present and the monolith still active. Run B:
   the same tree with the staged facade applied. Compare A against B by per-test name and status from a machine-written
   result file (the exact reporter invocation is fixed by S2-72; it must write the file itself, no redirect). Required: identical
   name set, identical statuses, zero new failures. The Verify baseline (IC-2b, 37 red, no regression against IC-2a2) means
   "identical to A", not "green".
4. **Golden decision corpus.** `harness/scripts/guard-grammar-differential.mjs --base c6e49a065` already materializes the base
   guard from `git show` into a private temp directory (rewriting relative specifiers and `import.meta.url` to the live location)
   and compares the `(blocked, code)` pair over a Bash-command corpus; it works unchanged with the facade as the live guard
   (exit 0 required). It covers only the Bash grammar. For the write, read, PowerShell and lifecycle lanes the 302 cases are the
   corpus; S2-72 additionally runs the extractor's `export-surface` and a **write/read-tool decision sample** only if the
   differential's corpus is extended (not required: out of scope for a pure move, listed as an option).
5. **Startup cost.** The monolith is one file; the facade loads 23 more. Measure cold start of
   `node hooks/guard-lifecycle-ready.mjs --runner claude` with a trivial allowed input, 20 runs, before and after, on WSL and on
   native Windows; gate: median regression <= 25 % (Windows hook speed was an IC-2b item). Recorded, not assumed.
6. **Kernel closure.** S2-70's tests, run both before and after the facade is applied.
7. **Protected-delta check.** Run `plugins/pipeline-core/scripts/check-protected-delta.mjs` on the integration branch before asking
   for the signature, to learn whether the new `lib/guard/*` files (ordinary commits that a new PB pattern will then cover) are
   reported as protected delta (open question Q3).

Where each runs:
- **WSL (native Linux clone of the candidate, never a drive mount)**: full Verify `--mode candidate`, steps 1-7, A/B comparison.
- **Native Windows (single test files only, never the full Verify)**: `hooks/guard-lifecycle-ready.test.mjs`, the
  contract test, `guard-split-map.mjs check|graph|export-surface`, the differential script, and the startup timing; nothing else.
- **macOS**: no host available to this plan: untested, covered by the verbatim proof (platform branches such as
  `CLAUDE_BASH_SHELL_DIALECT_PLATFORM` and `win32` handling move unchanged) and by the PO host matrix at stage Q (P-4...P-6).

## 5. Landing map for the R3 guard fixes (execution-order step 2)

Package 2 builds these after the flip, as lane slices with disjoint files:

| R3 fix | Lands in | Touch point (declaration) | Note |
|---|---|---|---|
| outside-root label for `--ignore-file` / `--exclude-from` values | `read-only-commands.mjs` (operand scan) and `read-scope.mjs` (label) | `qp4ReadTargetOperands`, `qp4OperandResolvesOutsideRoot`, `QP4_RG_LONG_VALUE` / `QP4_GREP_LONG_VALUE`; `isOutsideRoot*` | two files, one slice owner |
| Critic read refusals | `read-scope.mjs` + `read-only-commands.mjs` | `readToolScopeVerdict`, `isReadOnlySimpleWords`, passive lane | R2 content (one read policy) goes here |
| counter-lock race | **outside the split**: `hooks/guard-dispatch-budget.mjs` | not in the monolith | independent slice; not part of S2 |
| write route for `critic-notes.md` | `write-scope.mjs` (record-write lane `w04IsNonAuthorityRecordWrite`) with the verdict ordering in `evaluate.mjs` | `W04_RECORD_PREFIXES`, `w04BoundAuthorityPaths` | the target path set is not specified in the inputs: needs the briefing to name it |
| CSPRNG primitive | `read-only-commands.mjs` | `isReadOnlySimpleWords` allowlist (the Elephant-load findings note "no CSPRNG primitive in the grammar") | exact admitted spelling is a design decision; `ADMITTED_GRAMMAR_SHAPES` in `grammar-denials.mjs` follows, and `generate-agent-obligations.test.mjs` byte pin moves with it |
| F-3 in a bounded form | `dispatch-record-lane.mjs` | `claimDispatchRecordOwnership`, `dispatchRecordOwnerDecision` | claim only for a record that actually landed |
| heredoc-body classifier fault | `read-only-commands.mjs` (remediation) | `hasHeredocIntroducer`, `heredocFileRemediation`, `grammarRemediation`; tokenizer lives in `hooks/guard-command-grammar.mjs` (`tokenize`) | if the fault is in `tokenize`, the slice also touches that hook (not part of S2) |
| bootstrap receipt via the SubagentStart hook | `bootstrap-receipt.mjs` + new hook entry + `hooks/hooks.json` (TP-4, protected) | `recordBootstrapPreflightReceipt`, `evaluateBootstrapReceiptGate` | needs the protected package route for `hooks.json` |

R1 (catalogue as data + producer/guard consistency test) lands in `command-catalogue.mjs` fed by `constants.mjs`'s `*_SCRIPT`
set and the argv validators of `sanctioned-args-*.mjs` (PF-13 divergences (a) and (b) are in `sanctionedPipelineStateArgs`). PF-10/PF-11
(guard calls `inspectArchitectureEntryReadiness` instead of its own adoption/fitness/surface logic, including the
`yarn\.lock`-vs-`yarn-lock\.yaml` regex drift at `activeFeaturePlanningSurface`) land in `entry-gates.mjs`.

## 6. Risks and open questions

| Id | Risk / question | Proposed answer | Size impact |
|---|---|---|---|
| R-1 | A circular import appears between new modules | Layer table is derived from measured edges; `graph` mode fails on any back-edge; the contract test pins it | S |
| R-2 | `import.meta.url`-relative resolution changes with depth (lib/guard is two levels down) | The 31 sites are enumerated and whitelisted; slice proof compares the resolved absolute path to the base value | S |
| R-3 | The installed plugin copy and the distribution inventory do not know the new directory | Run `claude plugin validate`, the installed-plugin attestation and `check-consumer-safe-paths.mjs` on the candidate; refresh the installed copy only after the A/B evidence is green; if an allowlist enumerates files, add `lib/guard/` in the package | S |
| R-4 | A half-landed split affects the running session | It cannot: modules are inert until the facade lands, and the live guard is the installed copy | none |
| R-5 | Hook cold start slows (23 more module loads per PreToolUse) | Measure (section 4 item 5); gate at +25 %; mitigation if exceeded is fewer, larger modules (merge by layer) | M |
| R-6 | S0 duplicate-name ratchet rises | The extractor moves, never copies; the ratchet test is run in S2-72; the 3 existing duplicates with `guard-command-grammar.mjs` stay | S |
| R-7 | Moved authority code becomes unprotected | Q1 | |
| R-8 | Facade budget | Resolved by moving the core to `evaluate.mjs` (measured ~140 lines; the budget has 3.5x headroom) | |
| R-9 | Tests that import through the facade by identity (`reccolGuardNs`, dynamic imports, spawned child) | Re-exports preserve identity; covered by the same suites in run B | S |
| R-11 | Line numbers drift while other agents commit | Everything is keyed by declaration name; `check --base` pins the sha; monolith freeze from S2-00 | S |
| R-12 | A guard hotfix lands in the monolith mid-split | Freeze; if unavoidable, re-run the extractor, which regenerates all modules deterministically | S |
| R-13 | S1 `lib/shared` is absent | S2 does not depend on it; the leaf `path-containment.mjs` is the future migration target for CD-5 | none |
| R-14 | Unmeasured edges inside C14 (chain admission vs `isReadOnlyDiagnosticCommand`) could force the two C14 modules together | S2-00 `graph` settles it before any module slice; fallback: one `shell-grammar.mjs` of ~1,250 lines, wave plan unchanged (L1 instead of L1+L2) | S |
| R-15 | 11 transitional inverted imports (lib to hooks/scripts) become fitness findings | Recorded here for the S8 baseline; no S2 change | none |
| R-16 | `check-protected-delta` may report the new `lib/guard/*` files as protected delta when the PB pattern lands in the same candidate | Q3 | M |
| Q1 | Extend the PB-GUARD-HOOKS pattern to `lib/guard/*.mjs`? | **Yes**, in package 1: otherwise the split moves authority logic out of protection. Consequence: every later change to a lane module needs a signed package, so the R3 fixes ride in ONE bundled package 2 (their stated flow) | |
| Q2 | Core in the facade or in `evaluate.mjs`? | `evaluate.mjs` (section 2), revisit in package 2 | |
| Q3 | Do the 23 pure-addition modules need to be inside the signed package? | Try ordinary commits first; run `check-protected-delta` on the integration branch (S2-72) before requesting a signature; if it reports them, S2-71 includes them as additions (the Critic reads them anyway) | |
| Q4 | Two PO signatures for "S2+R1+R2"? | Yes (package 1 move, package 2 behaviour). A single package would forfeit the equivalence proof | |
| Q5 | Should lane tests move out of the 11.8k-line suite? | Not in S2 (MP-1 test mapping says only after the facade is green); a follow-up slice, registration needs a protected edit, so bundle it with package 2 | |

## 7. Matrix

Claude / Codex / Antigravity x native Windows / WSL / macOS x own repository / consumer repository. Expected effect of the split
in every cell: **none** (pure move, same entry path, same exports, same verdicts).

| Cell | Verification |
|---|---|
| Claude, native Windows | `hooks/guard-lifecycle-ready.test.mjs` and the contract test as single files; `guard-split-map.mjs check|graph|export-surface`; differential; startup timing. No full Verify. Claude's hook runs the installed copy, so the live check is the PO's refresh after green evidence |
| Claude, WSL | Full Verify `--mode candidate` in a native Linux clone; A/B per-test comparison; protected-delta; kernel closure |
| Claude, macOS | untested (no host); verbatim proof; PO host matrix at stage Q |
| Codex, Windows / WSL | `codex-pretool-guard.test.mjs`, `guard-apply-patch.test.mjs` (child spawn with `--runner codex`), same placement rule as Claude; macOS untested |
| Antigravity, Windows / WSL | `antigravity-pretool-guard.test.mjs` (imports `isSanctionedLifecycleCommand`); same placement rule; macOS untested |
| own repository | all of the above run in this repository |
| consumer repository | not run against a real consumer repository (read-only rule toward project repos). Covered by the temp-project-root fixtures of `hook-governance-scope`, `project-onboarding-v3`, `guard-lifecycle-recovery-contract` and `project-onboarding-e2e` suites (consumer-shaped roots) in runs A/B, and by the verbatim proof; the PO pilot at IC-3 is the real consumer check |
