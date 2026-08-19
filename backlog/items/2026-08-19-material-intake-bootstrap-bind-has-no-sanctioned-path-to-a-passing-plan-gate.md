---
schema: pipeline.backlog-item.v1
id: pipeline.material-intake-bootstrap-bind-has-no-sanctioned-path-to-a-passing-plan-gate
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-19"
closure_repository: self
closure_commit: 3fedc770a8a8196d49376f3c033558eaf51bf057
closure_evidence: plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
source: "PO live external test transcript (2026-08-19), project D:\\Dev\\Rune_Test1_Claude_060_56 on Windows/WSL, Claude runner, plugin 0.6.0+claude.20260819163512.ca18e0c. Full material-design-input onboarding (consent -> capture x6 -> design-questions -> generate-plan/-apply) completed cleanly, then bootstrap-bind-plan refused with KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID -- a dead end for the entire material-intake happy path."
---

# The material-intake bootstrap-bind flow has no sanctioned path to a PRD that can pass the PO plan gate

## Description

`bootstrap-bind-plan` (the step-6 coordinator-sourced binder,
`onboarding-continuity.mjs`'s `planOnboardingBootstrapBind` /
`buildCoordinatorSourcedPromotionPlan`) requires the intake-generated staging
PRD to carry three machine-readable markers before it will bind:
`<!-- po-language: xx -->`, `<!-- technical-spec-sha256: ... -->`, and
`<!-- po-plan-acknowledged: content-sound-and-spec-consistent -->`
(`promotionArtifacts()`, ~line 4161-4202). For a genuinely fresh repo that
received real material design input (not a one-line kickoff goal), **no
sanctioned path exists to put those markers there**, so the flow that step 6
was built to enable cannot ever complete. Three compounding defects, found by
reading the code, not just the PO's own report:

1. **The staging PRD/spec generators never write the two mechanical
   markers.** `buildIntakePrdContent()`/`buildIntakeSpecContent()`
   (~line 5542-5590) are pure functions of the intake checkpoint --
   `checkpoint.values.language` is already known at generation time, and the
   spec's own sha256 is computed two lines later in the same caller
   (`buildOnboardingIntakeGeneratePlan`, ~line 5612-5627) -- yet neither the
   `po-language` nor the `technical-spec-sha256` marker is emitted, unlike
   the plain-kickoff-goal path's `initialPrdContent()` (~line 3229-3250),
   which writes the language marker on its very first line. This part is
   pure oversight: both values are already available, no judgment call
   needed.

2. **The one marker that DOES represent a genuine judgment call --
   `po-plan-acknowledged` -- has no sanctioned write path at all.** The
   staging PRD is explicitly an unreviewed draft (its own generated "Notes"
   section says so: "product framing ... has not been synthesized and must
   be authored and reviewed before binding"), and the design intends exactly
   that authoring/review step -- confirmed by `onboarding-continuity.test.mjs`'s
   own `bootstrapBindReadyRoot()` fixture (~line 3081-3099), whose comment
   reads: *"The staging PRD is an explicitly unreviewed draft (design
   SSa.4/SSc.3): it must be edited to carry the three PO-gate markers before
   binding"* -- and which then hand-injects all three markers via a raw
   `writeFileSync`, something only a Node test (not a real tool call under
   the guard) can do. In a real session, `guard-lifecycle-ready.mjs` refuses
   any `Edit`/`Write` while onboarding isn't yet `ready` with
   `GUARD-LIFECYCLE-NOT-READY`, and per its own comment (~line 2472-2481,
   "ADR-0059 Decision 5 / NOVA-LCR-HGO-2") this specific denial is
   deliberately kept outside HGO's override authority -- no override route
   exists, by design. The one tool that could perform the design's own
   intended edit step does not admit it.

3. **The guard couldn't distinguish this window correctly even if it tried
   to.** `project-onboarding-ready-gate.mjs`'s
   `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` (~line 9-37) -- the
   fixed allowlist `requireProjectOnboardingReady()` checks a non-ready
   status against -- was never updated when step 6 added the three new
   `v4Inspection` statuses (`intake-required`,
   `intake-design-questions-required`, `bootstrap-binding-required`,
   `project-onboarding-v3.mjs` line 93). A repo sitting at
   `bootstrap-binding-required` (checkpoint `transactionState: "generated"`,
   exactly the PO's window) therefore fails `requireProjectOnboardingReady()`
   with the wrong typed error -- `PORG-INVALID-OBSERVATION` instead of
   `PORG-NOT-READY` with `lifecycleStatus: "bootstrap-binding-required"` --
   because line 152's `NON_READY_STATUSES.has(lifecycleStatus)` check fails
   closed on the unrecognized value. Any future narrow admission keyed off
   `error.lifecycleStatus` (mirroring the existing
   `isRestartResumeHintInputWrite`/`isPartialLifecycleIncidentReportWrite`
   pattern at guard-lifecycle-ready.mjs ~line 1240/2465) cannot fire until
   this allowlist is corrected -- a blocking prerequisite for any fix to
   point 2, not an independent nice-to-have.

## Triggering situation

Live PO test, Windows/WSL, Claude runner, candidate
`0.6.0+claude.20260819163512.ca18e0c`, fresh project
`D:\Dev\Rune_Test1_Claude_060_56`. Full material-input onboarding
(`intake-consent-apply`, 6x `intake-capture-apply`,
`intake-design-questions-apply`, `intake-generate-plan`/`-apply`) completed
and reached `transactionState: "generated"`. `bootstrap-bind-plan` then
failed `KICKOFF-PROMOTION-PRD-LANGUAGE-MARKER-INVALID`; an attempt to hand-edit
the staging PRD to add the marker was refused `GUARD-LIFECYCLE-NOT-READY`
with no override offered. The PO correctly diagnosed this as a session-
bricking dead end for the entire material-input onboarding path, distinct
from -- and worse than -- the one-line-goal `kickoff` path, which works.

The PO's report also names three lower-severity friction points from the
same session, recorded here for completeness but not part of this defect's
fix scope: (a) `apply-portable-seed`'s `pushApprovalSetupAction` instructs a
write to `~/.agent-pipeline/machine.json` "with ordinary tools", which a
real write attempt outside the project root refuses as
`GUARD-CROSS-REPO-MUTATION` requiring the full HGO ceremony, and no CLI
exists that actually calls `writeMachinePlane()` in production (only tests
reference it); (b) `intake-capture-apply` has only `--text`, no
`--text-file`, forcing long/multi-line/Unicode material input through
lossy PowerShell backtick-escaping (the PO had to substitute `ae/oe/ue/ss`
for `ä/ö/ü/ß`, contradicting the field's documented "verbatim" contract);
(c) `--answers-json` accepts only inline JSON, fragile under PowerShell's
backslash-escaping rules (needed doubled `""` instead of `\"`).

## Affected artifact

- `plugins/pipeline-core/lib/onboarding-continuity.mjs` --
  `buildIntakePrdContent()`/`buildIntakeSpecContent()` (~line 5542-5590),
  `buildOnboardingIntakeGeneratePlan()` (~line 5598-5630),
  `promotionArtifacts()` (~line 4135-4215),
  `buildCoordinatorSourcedPromotionPlan()` (~line 4438-4544).
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs` --
  `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` (~line 9-37).
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` --
  `isRestartResumeHintInputWrite()` (~line 1240),
  `isPartialLifecycleIncidentReportWrite()` (~line 2465),
  `evaluateAfterGrammarAdmission()` (~line 2482-2570) -- the exact pattern a
  new narrow admission should follow.
- Test coverage: `plugins/pipeline-core/lib/onboarding-continuity.test.mjs`'s
  `bootstrapBindReadyRoot()` (~line 3081-3099) currently masks this defect
  by hand-injecting the markers outside the guard; a real fix needs this
  replaced by (or supplemented with) a test that reaches a passing bind
  through the actual generation + a real sanctioned edit path.

## Proposal

Not implemented here (found via live-bug investigation, not designed in
depth) -- but the shape is reasonably clear from the code already read:

1. **Mechanical, no judgment needed:** have `buildIntakePrdContent()` accept
   the already-computed spec sha256 and emit
   `<!-- po-language: ${checkpoint.values.language} -->` /
   `<!-- technical-spec-sha256: ${specSha256} -->` as its first two lines,
   mirroring `initialPrdContent()` exactly. Requires reordering
   `buildOnboardingIntakeGeneratePlan()` to compute the spec content (and
   its sha256) before the PRD content.
2. **Prerequisite, mechanical:** add `intake-required`,
   `intake-design-questions-required`, `bootstrap-binding-required` to
   `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES`.
3. **The real design decision:** add a narrow `guard-lifecycle-ready.mjs`
   admission -- same shape as the two existing precedents -- permitting
   `Edit`/`Write` targeting exactly
   `project/.onboarding-staging/prd_<featureId>.md` and
   `project/.onboarding-staging/spec.md` (never `design-input.md`, which
   must stay an immutable verbatim capture) while
   `error.lifecycleStatus === "bootstrap-binding-required"`. This is what
   actually lets a real session perform the design's own intended review/
   author/acknowledge step. Empirically verify the exact `lifecycleStatus`
   string reachable at this window before wiring the branch -- don't assume
   it from this description alone.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted, all 3 parts of the Proposal. PO characterized this as a critical blocker on the material-intake happy path (2026-08-19) and asked for it fixed before the next candidate stamp.
- **Rationale:** Confirmed root cause in code, not just from the PO's report; the fix restores documented design intent (SSa.4/SSc.3, the test fixture's own comment) rather than working around it. The 3 lower-severity friction points in the Triggering situation are explicitly out of scope for this fix.
- **Assignment (if accepted):** Dispatched to goldfish-deep, worktree-isolated (`NVA-BL-INTAKEBIND-1`, truncated twice mid-run, resumed procedurally both times per this session's established recovery discipline). Landed on trunk as `3fedc770` (cherry-picked from worktree commits `9153aa1c`/`68a39bd9`/`30ee2bb8`), independently re-verified on trunk (`onboarding-continuity.test.mjs` 230/230, `guard-lifecycle-ready.test.mjs` 126/126, `project-onboarding-ready-gate.test.mjs` 8/8, `check-consumer-safe-paths.test.mjs` 9/9).
- **Date:** 2026-08-19

## Closure, 2026-08-19

All 3 defects fixed as designed: (1) `buildIntakePrdContent()` now emits the `po-language`/`technical-spec-sha256` markers mechanically, mirroring `initialPrdContent()`; (2) a new narrow `guard-lifecycle-ready.mjs` admission (`isBootstrapBindingStagingAuthoringWrite()`) lets a real session author/acknowledge the staging PRD/spec exactly while `lifecycleStatus === "bootstrap-binding-required"`, restoring the design's own intended review step (SSa.4/SSc.3) with no widening beyond the two exact staging paths; (3) `PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` now includes the 3 step-6 statuses, so the guard's own status allowlist can recognize the window at all. The real (non-coordinator-sourced) kickoff-promotion path's marker requirements are proven unchanged (existing acknowledgement-refusal test still passes). Landed `3fedc770`. Independent Critic review is still pending as part of the final T1 gate for this candidate (self-application, CLAUDE.md) — not yet PO-accepted.
