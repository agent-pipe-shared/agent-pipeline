---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-produces-drift-it-then-has-to-repair
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: four repair commands sit in the middle of the onboarding step the PO wants to be simple"
source: "Claude/Windows greenfield run, 2026-08-28, sections 7 and 11 of its own analysis (docs/pipeline-haertungstest-und-analyse.md)."
---

# Onboarding creates two states it then has to repair with dedicated subcommands

## What happened

Two of the seven hard blocks in the Claude run's onboarding were repairs of
conditions **onboarding itself had just created**:

- `PO-PROFILE-RECEIPT-INVALID` after the language was switched from `en` to
  `de` — requiring a `profile-repair` plan and apply;
- `projection-drift` from the runtime projection — requiring a further
  `plan-repair` and `apply-repair`.

Four extra commands, mid-onboarding, for problems no user action caused.

## The defect

A setup step that predictably invalidates its own prior output, and then ships a
repair subcommand for the result, has moved a bug into the workflow and called it
a feature. The language answer is *known* at the moment the profile receipt is
written; the runtime projection is *derived* from state the same transaction
holds.

## Direction

- Write the profile receipt after the language is known, not before, so the
  switch cannot invalidate it.
- Have `initialize-runtime`/`bind` produce a consistent projection in the first
  place rather than one a follow-up command reconciles.
- Keep the repair commands — they remain correct for genuine drift from outside
  the flow. They just must stop being part of the normal path.

## Acceptance criteria

- A fresh onboarding, including a language change, completes with zero repair
  subcommand invocations.
- Measured on a real fresh repository for every offered language and PO profile.
