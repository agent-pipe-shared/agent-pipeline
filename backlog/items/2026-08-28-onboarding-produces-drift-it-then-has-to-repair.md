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
done_when: manual
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

## Progress, 2026-08-29 (dispatch NVA-W9-DRIFTREPAIR / NVA-W9-DRIFTREPAIR-FIX, landed by the Elephant, commit `562ea6bc`)

**The "projection-drift" half is closed.** `correctSeededKickoffLanguage()`
(`plugins/pipeline-core/lib/onboarding-language-correction.mjs`) now also
regenerates the complete runtime projection from the corrected source in the
same correction transaction, via `regenerateRuntimeProjection()`. A first
attempt at this landed uncommitted but never actually fired on the kickoff
path — `applyProjectOnboardingKickoffV4`'s own gate refused any
`observed.status` other than `KICKOFF_PLAN_ADMITTED_STATUSES` or `"ready"`,
including `"projection-drift"`, and returned early before the correction
ever ran. Fixed by widening that one gate (apply-only) to also admit
`"projection-drift"`, and by giving `v4Inspection`'s projection-drift branch
a real `classifyOnboardingContinuity()` result instead of `emptyContinuity()`
so the gate's own `continuity.status` check still controls admission
correctly. New regression test: `project-onboarding-v3.test.mjs`, "a kickoff
language switch that also finds a drifted runtime target repairs it
atomically, without a separate plan-repair/apply-repair (NVA-W9-DRIFTREPAIR)"
— proves a genuinely unrelated drifted runtime target (not the language
marker itself) is repaired atomically within the same kickoff-apply call, no
separate `plan-repair`/`apply-repair` needed. Verified:
`project-onboarding-v3.test.mjs` 151/151, `onboarding-continuity.test.mjs`
260/260.

**The "PO-PROFILE-RECEIPT-INVALID" / profile-repair half is NOT addressed**
by this work — the Direction's first bullet ("write the profile receipt
after the language is known, not before") remains open. Status left `open`
pending that half and a real fresh-repository measurement across every
offered language/profile (this session's verification was suite-level, not
the end-to-end "measured on a real fresh repository" the acceptance
criteria ask for).
