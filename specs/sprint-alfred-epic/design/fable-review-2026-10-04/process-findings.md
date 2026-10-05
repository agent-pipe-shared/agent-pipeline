# Process-level review of the Pipeline lifecycle (ALFRED-FABLE-PROCESS-20261004)

Status: complete for the files read (see "What I did not read" at the end). Scope: `plugins/pipeline-core/` at
`ae7ef5a2339d934d2da42b0ac0d88820205fbda4` plus the working tree. Read-only; non-authorizing input for the
Elephant and the PO. Every line reference is repository-relative (`plugins/pipeline-core/` is abbreviated to
`pc/`). Confidence: `confirmed` = read in the code at the cited lines (or observed live in this repository with
the cited record); `hypothesis` = inferred, needs a reproduction step. Finding IDs are `PF-<n>`.

## Executive summary — the ten highest-leverage changes (ranked by expected reduction of defects and PO touches)

| # | Change | Effort | Findings | Owner |
|---|---|---|---|---|
| 1 | One command catalogue shared by producers and guard; a consistency test that fails when any emitted `nextAction` argv is not admitted (today the signature-mode `approve-plan` argv and the chat-mode receipt argv are both emitted and both refused by the guard's own shapes) | M | PF-13, PF-2, PF-4 | R1 |
| 2 | Remove `approved` as a resting state: `approve-plan` performs entry readiness + verify binding + phase flip in one writer transaction; `inspect` auto-advances legacy `approved` states | M | PF-1, PF-15 | R5 (+R1) |
| 3 | One implementation-entry rule owned by `lib/architecture-entry-readiness.mjs`; the guard calls it instead of re-deriving adoption, surface and fitness with its own (already drifted) copies | S | PF-11, PF-10 | D3 / R1 |
| 4 | Status-independent write lane: `scratch/`, `backlog/`, `docs/` writes and every recovery command a denial names are admitted before the readiness gate, replacing five per-status hand-carved scratch lanes | S | PF-8, PF-12 | R1 |
| 5 | One `authority` record per submission (`planPath/planSha256/specPath/specSha256/profile`), referenced by digest from submission, approval, briefing and continuity; drop `planApproved` and the contradiction codes it needs | M | PF-20…PF-24 | R5 / R6 |
| 6 | Design course as one resumable ledger (authoring → advisor → readiness → package) with idempotent stages and a `revise` step; authoring id leaves continuity | L | PF-3, PF-4, PF-5, PF-6 | R5 |
| 7 | Compact signing prompt (digests + file), chat-mode confirmation in session, `set-phase` emitted without `requiresConfirmation` | S | PF-30, PF-31, PF-32 | R3 |
| 8 | Preflight and guard evaluate the same readiness intent, and the ready-gate accepts every observation the writer can produce (`approved` included) | S | PF-12 | R1 |
| 9 | Verify the final package fully once (at approval); afterwards compare sealed digests only — three full re-verifications per `inspect`/`set-phase` today | S | PF-14 | R5 |
| 10 | One `humanApprovalRoute(state)` resolver used by `inspect` and `approve-plan` (two different predicates today) | S | PF-17 | R3 |

Cross-cutting (not a change by itself): the duplicated rules cluster in the two files that cannot import each
other without cycles (`pc/hooks/guard-lifecycle-ready.mjs` ~7,000 lines, `pc/scripts/pipeline-state.mjs` >11,000
lines; hotfix-10 README "Import graph"). Splitting them is a precondition for #1, #3 and #5 to stay fixed.

## 1. Pass-through and dead-end states

### PF-1 `approved` is a mandatory station with no admitted work and no admitted recovery — confirmed
- Evidence: `pc/scripts/pipeline-state.mjs:11134-11135` prints `lifecycle="approved"` and "implementation writes
  remain refused until you run `set-phase --phase implementation` -- approval and implementation-start are
  separate deliberate acts". `pc/lib/plan-spec-state-v2.mjs:619-621` derives `approved` purely as
  "approval present AND `activeFeature.phase === 'design'`". `enterPlanImplementation`
  (`pc/lib/plan-spec-state-v2.mjs:1292-1311`) changes nothing but `phase` and `phaseHistory`. The only substantive
  work `set-phase` adds is entry readiness and the verify command (`pc/scripts/pipeline-state.mjs:10231-10277`).
- In that state the guard requires an exact session-ready receipt (`pc/hooks/guard-lifecycle-ready.mjs:6089-6093`,
  `:6345`); the ready-gate turns any shape deviation into `PORG-INVALID-OBSERVATION`
  (`pc/lib/project-onboarding-ready-gate.mjs:291-345`, including `diagnostics.length !== 0` at `:338-339`), and
  the only lanes that survive `PORG-INVALID-OBSERVATION` are two exact-observed repair actions
  (`guard-lifecycle-ready.mjs:6226-6246`) and `isSanctionedLifecycleCommand` (`:6324-6327`). Observed live
  2026-10-04 (`backlog/items/2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes.md`):
  backlog writes, `diff`, `cp`, test runs and the denial's own recovery command were all refused.
- `inspect` in `approved` emits `set-phase` with `requiresConfirmation: true`
  (`pc/scripts/pipeline-state.mjs:4352-4358`; same in `pc/lib/project-onboarding-v3.mjs:3082-3088`), i.e. a third
  confirmation point after signature and approval.
- Consequence: a refused `set-phase` strands the session (hotfixes 9 and 10 had to be test-run and applied by
  the PO). Proposal: approval and implementation entry become one transaction (entry readiness and the verify
  contract are checked at `present-plan`, where `inspectArchitectureDesignDraft` already runs,
  `pc/scripts/pipeline-state.mjs:10629-10633`; Spec R5-4 already demands the Verify contract before
  presentation). `approved` remains only as a readable legacy status whose `inspect` action is the merged
  transition. Owner: R5 (writer), R1 (admissions of whatever remains).

### PF-2 `awaiting-approval` refuses the course's own declared evidence output — confirmed (K5-8)
- Evidence: the guard admits `--run-v2` only with `--exception-rationale <prefix>.exception-rationale.txt`
  plus digest (`pc/hooks/guard-lifecycle-ready.mjs:5210`), yet the dev-plan gate refuses the agent's Write to
  `evidence/` in `awaiting-approval` (register K5-8; `templates/prompts/agent-obligations.md` §3 lists only
  `docs/ specs/ .claude/ backlog/ scratch/` as exempt). Consequence: PO file placement per Claude feature.
  Proposal: already in Spec §21.1 (course evidence outputs in the catalogue). Owner: R1.

### PF-3 Preparation → readiness → package are three on-disk stations without resume — confirmed (K5-9, K5-11)
- Evidence: `writeVerifiedReadinessPreparation` refuses an existing target
  (`pc/scripts/design-course-session.mjs:446` `DESIGN-COURSE-PREPARATION-EXISTS`); `runDesignCourseV2` refuses
  `DESIGN-COURSE-OUTPUT-COLLISION` when, un-resumed, any of the three paths starts with `${outputPrefix}.`
  (`:561-563`), while the guard admits exactly `${prefix}.readiness.json`, `${prefix}.preparation.json`,
  `${prefix}.package.json` (`pc/hooks/guard-lifecycle-ready.mjs:5196-5199`). The un-resumed route is therefore
  unreachable through the guard, and the resumed route has no idempotent re-entry after a readiness failure.
- Proposal: one course ledger with stage receipts; a re-run compares the stored preparation digest with the
  recomputed one and proceeds (replace on mismatch, no-op on match). Owner: R5 (Spec §21.5 "course-run mechanics").

### PF-4 `authoring-dispatch-required` is a station whose exit lives in another subsystem — confirmed (K1-1)
- Evidence: `inspectDesignCourseSubmission` requires `continuity.queueHead.dispatch.dispatchId`
  (`pc/scripts/design-course-session.mjs:218-227`); the guard binds `--authoring-dispatch-id` to the same
  continuity field (`pc/hooks/guard-lifecycle-ready.mjs:5173-5178`); no `continuity-*` subcommand is admitted
  (`:4831-4932`). The authoring id is a course fact stored in continuity, so a design revision needs a continuity
  CAS the guard refuses (K1-1) or an override (K4-3). Hotfix 8 reads continuity as the "decision source" for a
  child course (hotfix-8 README). Proposal: the coordinator records authoring in its own ledger (Spec §21.5,
  SYNTHESIS D1). Owner: R5.

### PF-5 `reopen-design` on digest drift is a no-op loop — confirmed (K1-8)
- Evidence: `derivePlanLifecycle` returns `nextAction: "reopen-design"` whenever the working tree drifts from the
  submission (`pc/lib/plan-spec-state-v2.mjs:612-613`, `:657-662`). The real state carries five identical
  `phaseHistory` entries at `2026-09-27T19:19:34.288Z` and four at `2026-10-03T11:29:06.577Z`
  (`project/pipeline-state.json:408-447`): the transition appended history without changing the lifecycle.
  Proposal: drift is resolved by the single emitted `revise` step that rebinds sources (Spec R5-6); `reopen-design`
  is not emitted for drift. Owner: R5.

### PF-6 Terminal Advisor course blocks every later run — confirmed live, exact lines not read (K3-15, K5-7)
- Evidence: hotfix-4 and hotfix-8 READMEs (`scratch/hotfix-course-path/README.md`,
  `scratch/hotfix-child-course/README.md`): `DAC2-COURSE-ALREADY-EXISTS` without re-export; `newCourseParentId`
  reachable only from tests; the unavailable-path revision chain requires `design-input.md` byte-identical
  (`pc/lib/design-workflow-package-v2.mjs:51` — `same(r.sources.input, initial.sources.input)`), so a revision
  that adds PO input can never be chained. Proposal: course succession is a coordinator step with a lifecycle-owned
  decision record; roll back hotfix 8 when it lands. Owner: R5.

### PF-7 Dispatch bootstrap stations cost tool uses and fail under parallelism — confirmed live in this dispatch
- Evidence: first Write refused `GUARD-BOOTSTRAP-RECEIPT-MISSING` (`pc/hooks/guard-lifecycle-ready.mjs:6682-6685`),
  remedy = a `node` invocation (2 tool uses of a 70-use budget); one of eleven parallel tool calls was refused
  `DISPATCH-BUDGET-INPUT-INVALID (counter-lock-busy)` by `guard-dispatch-budget` (also `scratch/prework/SYNTHESIS.md`
  §5). Proposal: the dispatcher records the bootstrap receipt when it launches a Pipeline agent type (the
  preflight already ran in the parent session); the budget counter tolerates concurrent increments (retry with
  backoff) instead of failing closed. Owner: R4 (budget), R1 (receipt admission).

### PF-8 Non-ready statuses each have a hand-carved scratch lane; `approved` has none — confirmed
- Evidence: five separate exemptions for "write to `scratch/`" keyed on `lifecycleStatus`:
  `restart-required` (`pc/hooks/guard-lifecycle-ready.mjs:6193-6200`), `bootstrap-binding-required`
  (`:6213-6219`), `partial` (`:6264-6270`), intake statuses (`:6278-6284`), plus the pre-readiness
  `isBootstrapBindingScratchWrite` (`:6080-6085`). Every lane repeats "is this write inside scratch/"; a status the
  authors did not foresee (`approved` with an invalid observation) gets nothing. Proposal: one rule evaluated before
  readiness: writes under `scratch/`, `backlog/`, `docs/` are admitted in every lifecycle state (Spec §21.1
  "scratch writes stay admitted"; backlog proposal extends to `backlog/`, `docs/`). Owner: R1.

## 2. "Two checks, one rule"

### PF-10 Architecture design block: draft rule ≠ implementation-entry rule — confirmed (hotfix 9)
- Draft: `inspectArchitectureDesignDraft` returns `{ok:true, required:false}` when the fresh scaffold is absent
  or not byte-identical (`pc/lib/architecture-design.mjs:170-175`); `present-plan` uses it
  (`pc/scripts/pipeline-state.mjs:10629-10633`).
- Entry: `inspectArchitectureDesign` calls `parseArchitectureDesign(prd)` unconditionally (`:212`) and demands the
  fresh scaffold for `materialization-required` (`:240-241`); `inspectArchitectureEntryReadiness` short-circuits on
  `ARCHITECTURE-DESIGN-PACKAGE-REQUIRED` (`pc/lib/architecture-entry-readiness.mjs:320-323`) before the deferred
  branch (`:419-437`). `set-phase` (`pc/scripts/pipeline-state.mjs:10231`) and the handover action
  (`pc/lib/project-onboarding-v3.mjs:3046-3069`, which answers `reopen-design` on any `!ok`) consume it.
- Consequence: a signed, approved package is followed by "complete the design block, present and approve a new
  package" — a full cycle plus a signature that would still fail on a brownfield repository. Proposal: one
  applicability predicate (`repositoryKind`) exported once and used by both inspectors; the PO's "established/
  active" state (held notes 2026-10-04 §9) is the model fix. Owner: Track D (D3/D4) with a Wave-0 port of hotfix 9;
  not in Spec §21 today — needs a register row.

### PF-11 Implementation-entry gate evaluated twice with different rules, including a drifted regex — confirmed (hotfix 10)
- Guard side: `architectureAdoptionAuthorityVerdict` (`pc/hooks/guard-lifecycle-ready.mjs:465-492`) and
  `architectureFitnessAuthorityVerdict` (`:501-546`) re-run `checkPlanningAdoptionDisposition` and
  `evaluateArchitectureFitness`; fitness passes only on `pass`/`excepted` (`:524`), disposition is ignored.
- Library side: `inspectArchitectureEntryReadiness` applies report-only projection (`architecture-entry-readiness.mjs:168-207`)
  and treats `deferred` as ready (`:419-437`). Both run on the same `set-phase` call (guard `:6350-6362`, writer
  `pipeline-state.mjs:10231-10245`).
- Textual drift: the guard's planning-surface tokenizer (`guard-lifecycle-ready.mjs:442`, `yarn\.lock`) and the
  library's (`architecture-entry-readiness.mjs:31`, `yarn-lock\.yaml`) are two hand-copied regexes that already differ.
- Proposal: the guard calls `inspectArchitectureEntryReadiness` and nothing else for this transition (hotfix 10 does
  this only for the deferred case). Owner: D3 (rule), R1 (guard call site).

### PF-12 Bootstrap readiness ≠ session readiness; the ready-gate's exact shape makes `approved` unobservable — confirmed / cause hypothesis (K7-3)
- Evidence: the preflight's own `nextAction` is `project-onboarding-v3.mjs inspect --intent bootstrap` (observed
  output of the preflight run in this dispatch); the guard gates every call on `intent: "session"`
  (`pc/hooks/guard-lifecycle-ready.mjs:6089-6093`) and `exactReadyReceipt` requires `intent === "session"`
  (`:370-378`). The ready-gate demands an exact key set, zero diagnostics, valid runner permissions and a valid
  `nextAction` (`pc/lib/project-onboarding-ready-gate.mjs:291-345`), and reports every deviation as the same
  `PORG-INVALID-OBSERVATION` (`:296`, `:308`, `:318`, `:340`) without saying which predicate failed.
- Hypothesis: in `approved` the observation carried a non-empty `diagnostics` or a `nextAction` shape
  (`requiresConfirmation: true` set-phase) that `validReadyNextAction` rejects; not determined from source.
- Proposal: one intent, one observation producer; the gate names the failing predicate in the error (Spec R1-9 covers
  the intent half only). Owner: R1.

### PF-13 Guard admission is a second, hand-maintained copy of what the tools emit — confirmed (K1-x)
- Admission lists: `sanctionedPipelineStateArgs` (`pc/hooks/guard-lifecycle-ready.mjs:4831-4932`),
  `sanctionedDesignCourseArgs` (`:5146-5215`), `sanctionedLifecycleScriptArgs` (`:5217-5291`). Producers:
  `buildInspectNextAction` (`pc/scripts/pipeline-state.mjs:3994-4464`), `inspectDesignCourseSubmission`
  (`pc/scripts/design-course-session.mjs:270-274`), `designToImplementationHandoverAction`
  (`pc/lib/project-onboarding-v3.mjs:3027-3089`).
- Concrete divergences found: (a) signature mode `inspect` emits `approve-plan --design-workflow-approval-request <p>`
  (`pipeline-state.mjs:4221-4223`); the guard admits only `--by <n>` (length 3), `--bootstrap-acknowledgement-receipt <p>`
  (length 3) or `--by <n> --design-workflow-approval-request <p>` (length 5) (`guard-lifecycle-ready.mjs:4883-4898`)
  — the emitted argv matches none. (b) chat mode with receipt emits `--bootstrap-acknowledgement-receipt <p> --by <n>`
  (`pipeline-state.mjs:4249-4251`, length 5); the receipt shape requires length 3 — not admitted. (c) the recovery
  command a denial names, `project-onboarding-v3.mjs inspect --intent session`, was refused as
  `opaque-script-execution` (backlog item, live; `sanctionedOnboardingArgs` not read here). (d) any non-listed
  `node <script>` gets `forceLifecycleGate` (`guard-lifecycle-ready.mjs:1734-1738`, `:1789-1816`).
- Whether (a)/(b) fired live is not determined (hypothesis: the PO ran `approve-plan` in a terminal). Proposal: one
  catalogue module exporting closed argv shapes; producers emit from it, the guard imports it; R1-1 enumerates and
  asserts. Owner: R1.

### PF-14 The final package is fully re-verified at least three times per transition — confirmed; cost is a hypothesis
- `approve-plan` reads the package (`pc/scripts/pipeline-state.mjs:10900-10917`), verifies the signature
  (`:11008-11015`), and re-reads both in `beforeCommit` (`:11100-11120`); `inspect` re-verifies the signature for the
  next action (`:4206-4210`); `inspectArchitectureDesign` re-runs `verifyFinalDesignWorkflowApproval` on every
  `set-phase`/`inspect`/handover (`pc/lib/architecture-design.mjs:209`). Each full read walks git objects of every
  revision, the private course store and the host receipt (`pc/lib/design-workflow-package-v2.mjs:45-56`, `:70-71`,
  `:121-140`). Spec §17 asks for one pure validator (exists) but not for one verification event.
- Proposal: full verification once at approval; the sealed `planApproval.designWorkflowApproval` (package digest,
  intent digest, proof) is the fact afterwards; later readers compare digests only. Owner: R5/R3.

### PF-15 Verify-contract readiness is checked in four places — confirmed
- `set-phase` (`pc/scripts/pipeline-state.mjs:10258-10263`), `inspect` approved branch (`:4324-4350`), handover
  (`pc/lib/project-onboarding-v3.mjs:3080-3081`), late recovery `configure-verify`/`buildLateVerifyRecoveryAction`
  (`pipeline-state.mjs:10302`, `:3497`). Proposal: one check at presentation (Spec R5-4) plus the late route. Owner: R5.

### PF-16 "Which lifecycle state are we in" is derived three times — confirmed
- `derivePlanLifecycle` (`pc/lib/plan-spec-state-v2.mjs:567-668`); `persistedPoAuthority(...).lifecycleStatus`
  with its own `drifted`/`observed` vocabulary (`pc/lib/project-onboarding-v3.mjs:3028-3042`); the guard's inline
  design-course predicate over raw fields (`planApproved === false`, phase, profile, digests —
  `pc/hooks/guard-lifecycle-ready.mjs:5152-5158`). Proposal: one exported `lifecycleStatus(state, observation)`
  and one exported `isDesignCourseState(state)`, consumed everywhere. Owner: R5 (writer), R1 (guard).

### PF-17 Human-approval route decided by two different predicates — confirmed; divergence consequence is a hypothesis
- `inspect`: `bootstrapReceiptRequired = mode === "signature" || state.bootstrapAcknowledgementRequired === true`
  (`pc/scripts/pipeline-state.mjs:4231-4235`). `approve-plan`: `usesSharedPolicy` = (`scope global` AND
  (signature OR flag)) OR (`scope default` AND signature AND (receipt verified OR flag)) (`:10949-10954`). The comment
  at `:4225-4230` records a bypass that already arose from this split. Proposal: one `resolveHumanApprovalRoute`
  returning `{route, argv}` used by both. Owner: R3.

## 3. Duplicated facts in state (concrete instance: `project/pipeline-state.json`)

### PF-20 PRD/Spec path+digest stored five times — confirmed
- `continuity.authority.prd/spec` (`:464-471`), `continuity.queueHead.dispatch.authorityDigests` (`:487-491`),
  `planSubmission` (`:547-550`), `planApproval.poGateAuthority` (`:603-606`), `planApprovalBriefing.scope`
  (`:561-564`); plus the package sources, the approval request and the readiness receipt outside state.
- Writers: `submit-plan` (submission + briefing), `approve-plan` (copies the PO-profile authority,
  `pc/scripts/pipeline-state.mjs:10846`, `:11075`), `continuity-cas` transactions (`:2818` family). Drift checks exist
  because of the copies: `approveSubmittedPlan` compares submission with authority
  (`pc/lib/plan-spec-state-v2.mjs:1005-1009`); `inspectArchitectureDesign` compares continuity with approval
  (`pc/lib/architecture-design.mjs:201-204`); `inspect` does not compare continuity digests at all (K8-2).
- Proposal: one `authority` record written at `submit-plan`; submission, approval, briefing and continuity carry
  `authoritySha256`. Readers derive paths/digests from the one record. Owner: R5 (writer) / R6 (drift surfacing).

### PF-21 Profile stored five times — confirmed
- `planSubmission.profile` (`:551`), `planSubmission.profileSha256` (`:552`), `selectedProfile` (`:556`),
  `planApproval.profileSha256` (`:595`), `planApprovalBriefing.scope.profile` (`:565`); the guard reads yet another
  (`planSubmission.profile`, `pc/hooks/guard-lifecycle-ready.mjs:455-463`). Proposal: profile lives in the authority
  record; `profileSha256` is derived. Owner: R5.

### PF-22 Package digest stored five times; proof facts twice — confirmed
- `826f1374…` at `planPresentation.designWorkflowPackageSha256` (`:587`), `planApproval.designWorkflowPackageSha256`
  (`:611`), `designWorkflowApproval.packageSha256` (`:617`), `advisorException.packageSha256` (`:630`) and in the
  request filename (`:588`). `designWorkflowApproval.intentSha256` (`:618`) equals `proof.intentSha256` (`:622`);
  `proofSha256` (`:619`) is derivable from `proof`. Same pattern in `pushApproval.lastApproved.criticalProof`
  (`:70-82`). Proposal: approval stores `packageSha256` once and `proof` once; wrapper digests are computed on read.
  Owner: R3 (proof shape) / R5.

### PF-23 Derived booleans stored next to the facts they derive from — confirmed
- `planApproved: true` (`:3`) duplicates "a current `planApproval` exists"; `derivePlanLifecycle` needs
  `PLAN-LIFECYCLE-APPROVAL-CONTRADICTORY` (`pc/lib/plan-spec-state-v2.mjs:622-631`) and
  `PLAN-LIFECYCLE-APPROVAL-STALE` (`:644-653`) only because the flag can disagree with the record.
  `activeFeature.phase` is independent of approval, so `PLAN-LIFECYCLE-IMPLEMENTATION-UNAUTHORIZED` (`:633-642`)
  exists. The guard also reads `planApproved` directly (`guard-lifecycle-ready.mjs:5154`). Proposal: drop the flag
  (compute), keep `phase` as the single transition fact. Owner: R5.

### PF-24 Wrapper repeats inner identity; retained audit records live in the live state — confirmed
- `continuity.queueHead.dispatch` repeats `featureId`, `queueRevision` (= `continuity.revision`), `packageId`,
  `actionId` (`:474-485`) from its parents; `routeRequestSha256` (`:492`) binds a request nobody links to the sent
  prompt (K3-6). `planCancellation`, `planInvalidation`, `planMixedStateRecovery` (`:518-543`) are history that every
  derivation must re-validate (`plan-spec-state-v2.mjs:577-609`), and `phoenixEpicHistory` (`:191-387`) is a verbatim
  second state. The advisor exception copies `courseId`, `initialContextSha256`, `failureEvidenceSha256`
  (`:631-633`) from the package's course binding. Proposal: an append-only `history` array of sealed records outside
  the live derivation; wrapper fields become references. Owner: R5 / R6 (audit index).

## 4. Ceremony and PO-interaction cost (target: two PO decisions per feature, no `!` commands)

| # | Interaction today | Why it is necessary today | Smallest change | Class / owner |
|---|---|---|---|---|
| PF-30 | `sign-intent` prints the complete review material (~100 KB) | `describeDesignWorkflowApprovalRequest` dumps `approvalReview` (`pc/scripts/po-human-approval.mjs:231-232`), whose `sources[].content` carries all five documents (`pc/lib/design-workflow-package-v2.mjs:93`, `:141`); `present-plan` prints it again (`pipeline-state.mjs:10677-10682`) | Print digests + candidate + readiness outcome + open choices; write the material to a file next to the request (backlog item 2026-10-04 signing-prompt) | per-feature (decision 1), R3 |
| PF-31 | `approve-plan` chat mode requires an attended terminal confirmation (`requireAttendedChatGateConfirmation`, `pipeline-state.mjs:11031-11046`) | the chat route was built as a terminal challenge | in-session chat confirmation bound to commit/package text (Spec R3-9) | per-feature, R3 |
| PF-32 | `set-phase` emitted with `requiresConfirmation: true` (`pipeline-state.mjs:4357`; `project-onboarding-v3.mjs:3082-3088`) | approval and entry are separate acts (PF-1) | merge into approval (PF-1) or emit without confirmation | extra class today, R5/R3 |
| PF-33 | Bootstrap plan acknowledgement receipt for mini/shared-policy routes (`pipeline-state.mjs:10965-10988`, `:4236-4273`) | a historical PRD/Spec acknowledgement doubles as plan approval | fold into enrollment consent or remove (Spec §21.3) | per-feature today, R3 |
| PF-34 | PO places `claude.exception-rationale.txt` (K5-8) | evidence writes refused in `awaiting-approval` (PF-2) | catalogue admission | per-feature on Claude, R1 |
| PF-35 | PO moves aside `claude.preparation.json` (K5-11) | no resume (PF-3) | idempotent stage | per-feature on failure, R5 |
| PF-36 | Override ceremony for `continuity-cas`/course commands (K1-1, K4-3) with `plan`/`prepare-for-signature`/`emit-signature-digest`/`authorize-by-signature` | guard refuses the agent's own course registration | PF-4 + PF-13 | extra class, R1/R5 |
| PF-37 | PO test-runs and applies hotfixes; Goldfish cannot run `node` on a scratch suite (`opaque-script-execution`, `guard-lifecycle-ready.mjs:1734-1738`) | fail-closed by design (Spec §21.1, PO decision) | keep fail-closed; make the two stuck states (PF-1, PF-8) unreachable so a hotfix is never needed mid-approval | extra class, R1 |
| PF-38 | Checkpoint pushes need no approval in signature mode (K6-1) while the target counts every push | designed behaviour | per-push signed approval (Spec §21.3) | per-feature (decision 2), R3 |
| PF-39 | Per-dispatch bootstrap preflight + budget lock refusals (PF-7) | receipt gate keyed on agent id | dispatcher-recorded receipt; tolerant counter | agent budget, not a PO touch, R4 |

Count on the current Claude/Windows path (confirmed by live record, not a fixture run): decision 1 (signature),
`approve-plan` (terminal or override), `set-phase` confirmation, plus the two hotfix applications and the
exception-rationale placement before it — at least five PO touches for the single design decision the target
allows, before any push.

## 5. Target lifecycle sketch

States (writer-produced, at rest): `draft` → `presented` → `implementing` → `closed`.
- `draft`: authoring; the course ledger (PF-6) runs authoring → advisor → readiness → package inside it; a
  revision is a new ledger generation bound to its parent, never a lifecycle transition.
- `presented`: `submit-plan` + `present-plan` collapse into one transition that binds the authority record (PF-20),
  the package digest and the approval request; it is refused unless entry readiness and the Verify contract already
  hold (PF-1, PF-15), so the PO never signs something that cannot enter implementation.
- `implementing`: entered by `approve-plan` itself (decision 1), which writes approval + phase in one transaction.
- `closed`: unchanged (`continuity-close`).
- `awaiting-approval`/`approved`/`reopen-design` survive only as readable legacy classifications with an emitted
  forward action (merged transition, or `revise`).

One owner per rule: lifecycle status — `plan-spec-state-v2` (single export, PF-16); command admission — the
catalogue module (PF-13), imported by the guard and by every producer; implementation entry — the architecture
library (PF-11), called by writer and guard; human-approval route — one resolver (PF-17); package validity — one
validator run once (PF-14); write admissions for `scratch/`, `backlog/`, `docs/` — one status-independent rule (PF-8).

One source per fact: the authority record (PF-20/21); approval holds `packageSha256` and `proof` once (PF-22);
`phase` is the only transition fact (PF-23); history is append-only and outside derivation (PF-24).

Migration order (keeps existing repositories working):
1. Wave 0: port hotfixes 1–10 verbatim (Spec §21.7 names 1–7; 8–10 must be added to the W0-3 list).
2. R1: catalogue + consistency test (emitted == admitted), status-independent write lane, same readiness intent,
   ready-gate names the failing predicate. Old states unchanged; only admissions widen.
3. D3/R1: guard delegates the entry rule to the library; shared applicability predicate for the design block
   (replaces hotfixes 9/10). Register rows needed (not in Spec §21 today).
4. R5: `approve-plan` performs the entry transition; `inspect` auto-advances a legacy `approved` state. Readers keep
   classifying old states; new writer never rests in `approved`.
5. R5: coordinator ledger with resume and `revise` (replaces hotfixes 4, 5, 8; PF-3…PF-6). Authoring id leaves
   continuity; a one-shot migration copies the current id into the ledger.
6. R5/R6: authority record; readers accept both shapes (`authoritySha256` or inline copies) for one release; a
   `migrate-state` command rewrites old states on first write; drop `planApproved` after that release.
7. R3: compact signing prompt, in-session chat confirmation, no `set-phase` confirmation, bootstrap acknowledgement
   folded into enrollment, per-push approval.
8. Architecture split of `pipeline-state.mjs` and `guard-lifecycle-ready.mjs` (PO decision 2026-10-04): the
   catalogue (2), the entry rule (3) and the status export (4) are exactly the modules both files must import,
   which is impossible while each is one file — schedule the split before step 4. Owner: D4 dogfood route.

Workstream map: R1 — PF-2, PF-7 (receipt), PF-8, PF-12, PF-13, PF-34, PF-36, PF-37; R3 — PF-17, PF-22, PF-30,
PF-31, PF-32 (shared), PF-33, PF-38; R4 — PF-7 (budget), PF-39; R5 — PF-1, PF-3, PF-4, PF-5, PF-6, PF-14, PF-15,
PF-16, PF-20, PF-21, PF-23, PF-24, PF-35; R6 — PF-20 (drift surfacing), PF-24 (audit index); Track D (D3/D4,
outside §21 — register rows required) — PF-10, PF-11.

## What I did not read (coverage for the Elephant)

- `pc/scripts/design-advisory-coordinator.mjs` and `pc/lib/design-advisory-coordinator-v2.mjs`: covered only through
  the hotfix-4/8 READMEs (PF-6 is therefore confirmed-by-record, not by line).
- `pc/scripts/guard-human-override.mjs` / `pc/lib/human-guard-override.mjs`: ceremony steps taken from Spec §21.3
  and register K4 rows; the match-key and drift code was not re-read.
- `pc/schemas/`: the directory listing was refused (`counter-lock-busy`); schema names cited come from imports
  (`pipeline.design-workflow-package.v2.json`, `design-workflow-package-v2.mjs:14`).
- `pc/lib/project-onboarding-v3.mjs` beyond `:3020-3089` and the `rg` hits; `sanctionedOnboardingArgs`
  (`guard-lifecycle-ready.mjs:4241-4557`) — so PF-13(c) rests on the backlog observation.
- `pc/scripts/pipeline-start-preflight.mjs` (PF-12 uses its observed output and K7-3), `pc/lib/architecture-adoption.mjs`,
  `pc/scripts/module-inventory.mjs`, `pc/scripts/architecture-fitness.mjs`.
- `pc/scripts/pipeline-state.mjs`: only `:3994-4464` (partially), `:10205-10300`, `:10578-10687`, `:10816-11140`;
  continuity transactions (`:2613-2950`), publication, result-close/bootstrap/rebind families, enrollment retirement
  and `reopen-design`/`submit-plan` cases were inventoried by name only.
- `pc/hooks/guard-lifecycle-ready.mjs`: read `:340-560`, `:1707-1818`, `:4831-4940`, `:5146-5310`, `:6063-7022`;
  the read-policy lanes (K2), PowerShell lanes and rebase authority were not reviewed.
- `pc/scripts/po-human-approval.mjs`: only `:191-260`; the `sign-intent` executor (`:1248-1322`) and push/critical
  prompts were not read (the "same pattern" claim for push signing is a hypothesis from the backlog item).
- `scratch/prework/wave-plan-v2-draft.md`; register sections K2, K6, K8 only via the register table; push guard and
  pre-push hook not read (PF-38 rests on K6-1).
- No test files, no fixtures, no runner-profile configuration.
