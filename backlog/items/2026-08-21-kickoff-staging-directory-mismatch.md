---
schema: pipeline.backlog-item.v1
id: pipeline.kickoff-staging-directory-mismatch
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-25
closure_repository: self
closure_commit: 550b5fb5cd2fd3a2810816fcbb0d7bc3e7192013
closure_evidence: backlog/items/2026-08-21-kickoff-staging-directory-mismatch.md
created: 2026-08-21
source: Manual observation during sprint_agy kickoff testing (Rune_Test1_Agy_060_59)
---

# Kickoff provisional files path mismatch in code vs documentation

## Description

The pipeline documentation (`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`) states that provisional kickoff PRDs and specifications are generated under the `specs/kickoff-*` directory. However, the technical implementation in `project-onboarding-v3.mjs` and `onboarding-continuity.mjs` (line 5442) hardcodes `export const INTAKE_STAGING_DIRNAME = "project/.onboarding-staging";`. This causes the script to place the provisional files in `project/.onboarding-staging/` instead of `specs/`.

## Triggering situation

During the `sprint_agy` integration testing, the Antigravity agent ran the `project-onboarding-v3.mjs kickoff plan` command correctly. The script placed the files in `project/.onboarding-staging/`, leading the user to correctly point out that the directory structure was wrong compared to what other runners document/produce based on the instruction layer.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md` and `plugins/pipeline-core/lib/onboarding-continuity.mjs`

## Proposal

Reconcile the documentation and the code. Either update `kickoff-design.md` to reflect the new staging directory (`project/.onboarding-staging/`), or update the constants in `onboarding-continuity.mjs` to map to `specs/`. Since `project/.onboarding-staging/` is explicitly typed as an onboarding artifact, updating the markdown reference is likely the correct technical path.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred — the item's own premise needs re-verification
  before the proposed fix is applied.
- **Rationale:** Re-read `onboarding-continuity.mjs` directly rather than
  trusting the item's framing (this repo's own "re-verify inherited 'still
  open' claims" discipline). `INTAKE_STAGING_DIRNAME` /
  `project/.onboarding-staging/` is used by a distinct mechanism —
  `buildOnboardingIntakeGeneratePlan()` / the `NVA-BL-INTAKEBIND-1`
  "deterministic staging draft" checkpoint-generate flow — not the same
  code path as the classic `kickoff plan`/`kickoff promote` flow
  `kickoff-design.md` documents. That classic flow's own promotion-authority
  check (`promotionArtifacts()`, line ~4143) explicitly still refuses to
  reuse any path starting with `specs/kickoff-`, confirming `specs/kickoff-*`
  is still a live, checked location in the current code, not stale
  documentation. So this is not necessarily a simple doc-vs-code mismatch
  with one obvious fix — it may be two genuinely different provisional-file
  mechanisms that the original Antigravity observation conflated, in which
  case the real question is which mechanism Antigravity's `kickoff plan`
  invocation actually triggered. Applying the item's suggested fix (repoint
  `kickoff-design.md` at `project/.onboarding-staging/`) without confirming
  that first risks documenting the wrong mechanism as canonical.
- **Assignment (if accepted):** needs a short follow-up read (which caller
  Antigravity's `kickoff plan` actually invoked in the triggering session)
  before either doc or code is changed; not done in this pass.
- **Date:** 2026-08-24

## Follow-up trace (AGY-KICKOFFSTAGING-1, 2026-08-24)

- **Decision:** stays `open` — the doc/code trace is now definitive, but the
  item's own question ("what actually produced the field observation") is
  not, and closing on the resolved half only would misrepresent the other
  half as settled.
- **Full call chain for the literal `project-onboarding-v3.mjs kickoff plan`
  subcommand**, traced forward from the CLI argv parser, not inferred from
  names:
  1. `plugins/pipeline-core/scripts/project-onboarding-v3.mjs:203-205` —
     `args[0] === "kickoff"` (not `"promote"`) sets
     `output.command = "kickoff-plan"`.
  2. `project-onboarding-v3.mjs:320` — dispatches
     `planProjectOnboardingKickoffV4({...})`, imported (line 26) from
     `plugins/pipeline-core/lib/project-onboarding-v3.mjs`, **not** from
     `onboarding-continuity.mjs` directly.
  3. `lib/project-onboarding-v3.mjs:5061-5095` — `planProjectOnboardingKickoffV4`
     inspects state, then at line 5086 calls `planOnboardingKickoff({...})`,
     which is imported (line 48 `from "./onboarding-continuity.mjs"`).
  4. `lib/onboarding-continuity.mjs:3951-3953` — `planOnboardingKickoff` is a
     one-line wrapper: `return buildOnboardingKickoffPlan(options);`.
  5. `lib/onboarding-continuity.mjs:3787-3949` — `buildOnboardingKickoffPlan`
     computes `featureId = "kickoff-" + goalSha256.slice(0,16)` (line 3806),
     then `authority = initialAuthorityPaths(featureId)` (line 3807).
  6. `lib/onboarding-continuity.mjs:3169-3175` — `initialAuthorityPaths`
     returns `{ prd: "specs/${featureId}/prd_${featureId}.md",
     spec: "specs/${featureId}/spec.md" }` — i.e. `specs/kickoff-*`.
  7. Back in `buildOnboardingKickoffPlan`, the returned plan's
     `targets.prd.path` and `targets.spec.path` (lines 3892-3903) are set
     directly to `authority.prd`/`authority.spec` — the actual write targets
     a subsequent `kickoff apply` would use are `specs/kickoff-*`, exactly
     as `kickoff-design.md` documents (its own line 103 names
     `specs/kickoff-*` explicitly).
  - **Conclusion on the primary question:** the literal `kickoff plan`
    subcommand invokes the classic mechanism end to end. It never touches
    `INTAKE_STAGING_DIRNAME` / `project/.onboarding-staging/` — that constant
    and directory belong to a structurally separate CLI subcommand,
    `intake-generate-plan`/`intake-generate-apply`
    (`project-onboarding-v3.mjs:120-121, 366-369`, dispatching to
    `planOnboardingIntakeGenerate`/`applyOnboardingIntakeGenerate`), which
    `kickoff plan`'s call chain above never reaches. `kickoff-design.md`
    correctly describes current behavior for this command; **no doc
    correction is warranted** by the branch this dispatch found.
  - **Version-drift check:** `git log --oneline --since=2026-08-18 -- lib/onboarding-continuity.mjs lib/project-onboarding-v3.mjs`
    shows no commit after the item's 2026-08-21 filing date touched
    `initialAuthorityPaths`/the kickoff→`specs/` path; the two relevant
    prior commits (`0080116b` "coordinator step 4 -- intake-generate-plan/apply
    (staging generation)", `10e1b6a0` "route fresh-repo v4Inspection to the
    intake coordinator") both landed 2026-08-19, before the field observation.
    Version drift since filing is ruled out as an explanation.
  - **Additional discriminator:** `project-onboarding-v3.mjs:95` marks
    `kickoff-plan` as `mutates: false`. Plan-only, it writes nothing to disk
    by itself — a plan is emitted, not applied. The item's own "Triggering
    situation" reports files that *landed* in `project/.onboarding-staging/`,
    which requires a `mutates: true` command to have actually run
    (`intake-generate-apply` is `mutates: true`, line 121). This is direct
    support for "a different command than the one named in the item's
    Triggering situation actually executed."
  - **What remains genuinely open, and why it is a PO/further-investigation
    call rather than something this dispatch can settle:** which exact
    command Antigravity invoked in the original testing session is not
    determinable from the repository alone (no session transcript in scope
    here). But the repository does show a plausible root cause independent
    of that transcript: `10e1b6a0` (2026-08-19) made `v4Inspection` route a
    genuinely fresh/pristine repo toward `intake-*`/`bootstrap-binding-required`
    statuses rather than `kickoff-required` — i.e. the CURRENT live bootstrap
    path for a fresh project now goes through the `intake-generate-*` /
    `INTAKE_STAGING_DIRNAME` coordinator flow first, with `kickoff plan`
    remaining reachable but no longer the fresh-repo entry point it was
    when `kickoff-design.md` was written. Checked
    (`rg -rln "intake-generate" plugins/pipeline-core/skills/`): **no skill
    reference document under `skills/` mentions `intake-generate-plan`/
    `intake-generate-apply` at all** — the only documented path a session
    would learn from `references/kickoff-design.md` or `SKILL.md` is
    `kickoff plan`/`kickoff apply`. If Antigravity's actual bootstrap
    followed the live `v4Inspection` routing (as a fresh project reasonably
    would) rather than the doc, it would have been steered into
    `intake-generate-*` by the tool itself, producing exactly the observed
    `project/.onboarding-staging/` files, while later describing the overall
    process loosely as "kickoff plan" in the item's Triggering situation.
    This is a plausible, evidence-supported explanation but not a
    code-traced certainty about what literally ran in that session — hence
    left open rather than closed.
  - **Recommendation for the PO:** the real documentation gap this trace
    surfaces is not `kickoff-design.md` (accurate for the `kickoff`
    subcommand) but the *absence* of any skill-reference coverage for the
    now-live `intake-generate-plan`/`intake-generate-apply` coordinator path
    that a fresh repo's `v4Inspection` actually routes toward. That is a
    documentation-completeness gap distinct from this item's original
    doc-vs-code mismatch claim (which this trace does not confirm) and may
    warrant its own backlog item; not filed here per this dispatch's
    single-file scope.
- **Date:** 2026-08-24

## Closed, 2026-08-25

The actionable half of this item is resolved: the AGY-KICKOFFSTAGING-1 trace
(above, 2026-08-24) is a complete, code-traced call chain showing `kickoff
plan` never touches `INTAKE_STAGING_DIRNAME`/`project/.onboarding-staging/`
— `kickoff-design.md` is accurate for that subcommand, no doc correction is
warranted, and the item's original doc-vs-code mismatch claim is not
confirmed.

The one piece left genuinely unresolved ("which exact command Antigravity
invoked in the original testing session") is explicitly, permanently
undeterminable from the repository alone (no session transcript in scope)
— it is not a defect with a fix, it is a historical question with no
further evidence available. Re-verified before closing (this repo's own
"re-verify inherited still-open claims" discipline): `docs/state.md`'s
open-items list still described this as "still needs a proper
investigation pass," which was stale — the trace above already completed
that pass on 2026-08-24, docs/state.md simply was not cross-referenced
against it afterward.

The trace's own recommended follow-up (documentation-completeness gap for
the `intake-generate-plan`/`intake-generate-apply` coordinator path) is
already filed as its own item:
`backlog/items/2026-08-24-intake-generate-coordinator-path-undocumented-in-skill-references.md`.
Nothing further to do here. Item closed.
