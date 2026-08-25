---
schema: pipeline.backlog-item.v1
id: pipeline.intake-generate-coordinator-path-undocumented-in-skill-references
type: defect
owner: pipeline
status: open
created: 2026-08-24
source: "AGY-KICKOFFSTAGING-1 dispatch, follow-up trace on backlog/items/2026-08-21-kickoff-staging-directory-mismatch.md, 2026-08-24"
---

# The live fresh-repo bootstrap path (`intake-generate-plan`/`intake-generate-apply`) has no skill-reference documentation

## Description

A code trace of the literal `project-onboarding-v3.mjs kickoff plan`
subcommand (done while investigating
`backlog/items/2026-08-21-kickoff-staging-directory-mismatch.md`) confirmed
that command still writes to `specs/kickoff-*`, matching
`kickoff-design.md`'s documentation exactly — no defect there. But the same
trace found that commit `10e1b6a0` (2026-08-19, "route fresh-repo
`v4Inspection` to the intake coordinator") changed which command a
genuinely fresh/pristine repository's bootstrap actually routes toward:
instead of `kickoff-required` (leading to the documented `kickoff plan`
path), a fresh repo now gets routed to `intake-*`/
`bootstrap-binding-required` statuses, which lead toward the
`intake-generate-plan`/`intake-generate-apply` coordinator flow
(`project-onboarding-v3.mjs:120-121, 366-369`, writing to
`INTAKE_STAGING_DIRNAME` = `project/.onboarding-staging/`).

Checked directly (`rg -rln "intake-generate"
plugins/pipeline-core/skills/`): **no skill-reference document under
`skills/` mentions `intake-generate-plan`/`intake-generate-apply` at all.**
The only bootstrap path a session would learn about from
`references/kickoff-design.md` or `SKILL.md` is `kickoff plan`/`kickoff
apply` — which is no longer the actual entry point a fresh repository's own
`v4Inspection` routes toward.

## Why this matters

An agent following the documented happy path (`kickoff-design.md`) for a
genuinely fresh project may be silently routed by the tool itself toward an
entirely different, undocumented coordinator flow, with no reference
material explaining what `intake-generate-*` does, why it exists, or how it
relates to the documented `kickoff` flow. This is a plausible, evidence-
supported explanation for the original field observation in
`2026-08-21-kickoff-staging-directory-mismatch.md` (files landing in
`project/.onboarding-staging/` under a session loosely described as
"kickoff plan") — the agent may well have been following the actual live
routing correctly while the human observer (and the agent itself, absent
documentation) had no reference explaining what was happening or why it
didn't match `kickoff-design.md`.

## Affected artifact

`plugins/pipeline-core/skills/pipeline-start/references/kickoff-design.md`
(or a new sibling reference doc); `plugins/pipeline-core/skills/pipeline-start/SKILL.md`;
the underlying mechanism: `plugins/pipeline-core/lib/onboarding-continuity.mjs`
(`planOnboardingIntakeGenerate`/`applyOnboardingIntakeGenerate`,
`INTAKE_STAGING_DIRNAME`), routed to from
`plugins/pipeline-core/lib/project-onboarding-v3.mjs`'s `v4Inspection`
logic (commit `10e1b6a0`).

## Proposal

Not designed here (out of the dispatch that surfaced this). Candidate
starting points for whoever picks this up:

- Confirm exactly which repository states route to `intake-generate-*` vs.
  `kickoff plan` (read `v4Inspection`'s routing logic directly — commit
  `10e1b6a0`'s own diff is the fastest way in).
- Add a reference document (or extend `kickoff-design.md`) explaining the
  `intake-generate-plan`/`intake-generate-apply` flow at the same level of
  detail `kickoff-design.md` gives the classic flow: what it writes, where
  (`project/.onboarding-staging/`), and how/when it hands off to the
  documented `kickoff`/promotion flow (if it does).
- Confirm whether `project/.onboarding-staging/`'s own tracked/untracked
  fate (a separate, still-open question —
  `backlog/items/2026-08-21-kickoff-untracked-files-missing-from-commits.md`)
  should be resolved as part of documenting this flow properly.

## Acceptance

- A session following the documented happy path for a genuinely fresh
  repository is not silently routed into an undocumented mechanism — either
  the routing is documented, or (if judged wrong) the routing itself is
  reconsidered.
- `kickoff-design.md`/`SKILL.md` and the actual live `v4Inspection` routing
  agree on what a fresh repo's first bootstrap command actually is.

## Cross-reference, 2026-08-25

`backlog/items/2026-08-21-kickoff-untracked-files-missing-from-commits.md`'s
part (b) resolved the negative half of this proposal's third bullet
(`.onboarding-staging` is no longer gitignored — PO correction, 2026-08-25:
its content is used substantively by `sprint-agy-runner` and must not be
discarded). The positive half — an agent must be explicitly told to STAGE
that content, the same way `kickoff-design.md` already tells it to stage
the classic flow's PRD/Spec pair (part a of that item) — remains this
item's own open scope: the missing skill-reference documentation for
`intake-generate-plan`/`intake-generate-apply` is exactly where that
staging instruction belongs once written.
