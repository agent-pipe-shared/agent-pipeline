---
schema: pipeline.backlog-item.v1
id: pipeline.guard-lifecycle-ready-has-no-admission-branch-for-the-intake-checkpoint-subcommands
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-19
source: "Nova Wave 4, dispatch NVA-W4-COORD-1 (intake-checkpoint coordinator Phase 1) — found and named while implementing, not fixed in that dispatch's scope"
---

# guard-lifecycle-ready.mjs has no admission branch for the new intake-checkpoint subcommands

## Description

`specs/wave4-onboarding-coordinator/design.md` §b claims that adding the
three new intake-checkpoint subcommands (`intake-consent-apply`,
`intake-capture-apply`, `intake-design-questions-apply`) to
`ONBOARDING_SUBCOMMANDS` is sufficient — no `guard-lifecycle-ready.mjs`
change needed. This is false. `sanctionedOnboardingArgs()`'s derived
admission (GUARDDERIVE-1) only ever covers `mutates: false` commands; every
existing MUTATING onboarding subcommand (`kickoff-apply`,
`kickoff-promote-apply`, `apply-manifest-repair`, `apply-partial-authority`,
`adopt-remote-apply`, `apply-portable-seed`/`apply-reinstall`/
`initialize-runtime`/`apply-repair`/`apply-readback`) has its own
hand-written exact-argv-shape admission branch. No branch exists yet for
the three new mutating subcommands, so a Bash-invoked automated call to any
of them under a governed session is refused by `GUARD-LIFECYCLE-NOT-READY`
— they are only reachable by direct/manual CLI invocation today, not by an
agent operating under the normal guard-enforced session boundary.

## Triggering situation

Found and confirmed by direct code reading during dispatch NVA-W4-COORD-1
(2026-08-19), which implemented and landed the three subcommands
(commit `75055e4e`) but deliberately did not touch guard code, per its own
stop condition: a design-contradiction with no supplied safe recovery
action is a stop, not something to patch inside an unrelated implementation
task.

## Affected artifact

`hooks/guard-lifecycle-ready.mjs` (`sanctionedOnboardingArgs()`,
`AUTOMATED_LIFECYCLE_ARGV_COMMANDS`/GUARDDERIVE-1),
`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`
(`ONBOARDING_SUBCOMMANDS`).

## Proposal

Add an exact-argv-shape admission branch in `sanctionedOnboardingArgs()`
for each of the three new subcommands, mirroring the existing branches for
the other mutating onboarding subcommands (same flag-shape discipline:
`--activate` plus the command's specific required flags, nothing looser).

Acceptance test: an automated (Bash-invoked, guard-governed) call to
`intake-consent-apply --activate ...` / `intake-capture-apply --activate
...` / `intake-design-questions-apply --activate ...` with the exact
flag shape the CLI accepts is admitted by `guard-lifecycle-ready.mjs`
without a `GUARD-LIFECYCLE-NOT-READY` denial; an off-shape or
flag-superset/subset call is still refused, matching the discipline the
other mutating onboarding subcommands already have.

## Triage (filled in by the Elephant of the next Pipeline session)

Not yet triaged.
