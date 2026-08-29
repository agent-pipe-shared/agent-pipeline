---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-produces-drift-it-then-has-to-repair
type: defect
owner: pipeline
status: closed
created: 2026-08-28
closed_at: 2026-08-29
closure_repository: self
closure_commit: 7c446d0b9b56f981f1057b1d40683814325e33f5
closure_evidence: backlog/items/2026-08-28-onboarding-produces-drift-it-then-has-to-repair.md
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

## Re-investigation, 2026-08-29 (NVA-CF-BL18-PROFILEDRIFTTEST-RETRY) — the paragraph above is likely stale

A dispatch tasked with adding a regression test for the still-open
PO-PROFILE-RECEIPT-INVALID scenario could not reproduce it in current code,
and traced why: `po-gate-authority.mjs`'s `validatePoGateProfileSnapshot`
only raises `PO-PROFILE-RECEIPT-INVALID` when the receipt is missing/
unsafe/malformed; a language-content mismatch alone raises the distinct
`PO-PROFILE-RECEIPT-STALE`. Every reachable apply path traced (kickoff-only,
legacy kickoff-promotion, coordinator-sourced bootstrap-bind) writes the
profile receipt AFTER the language correction, via the real (non-injectable)
`publishPoGateProfileReceipt`, in every one of the three flows checked.
Three EXISTING passing tests in `project-onboarding-v3.test.mjs` already
cover this end to end with real git and the real receipt publisher (not
this item's own NVA-W9-DRIFTREPAIR track, which only covers `projection-
drift`): line ~3808 (GF-079, kickoff language switch), line ~3857
(NVA-BL-70, promotion language switch), line ~3920 (NVA-W9-DRIFTREPAIR
itself). `git log --oneline --grep="PO-PROFILE-RECEIPT-INVALID"` shows the
receipt-ordering bug class was already fixed by earlier commits (`0cadfd4d`/
`8224d575`) predating this item's own 2026-08-29 progress note above.

**So the paragraph directly above this one may itself be the stale claim**
per this project's own "re-verify an inherited still-open claim" discipline
— re-verified by the Elephant against the cited test/commit evidence, not
just taken from the dispatch's report. One combination remains genuinely
untried (the coordinator-sourced intake/bootstrap-bind path with a
deliberately mismatching PRD `po-language` marker) and was not reached
within that dispatch's budget; given it shares the identical, already-proven
`correctPromotedLanguage` call, it is expected but not confirmed to also
pass. Left `status: open` — the item's remaining live gap is narrower than
its own "NOT addressed" framing states: likely only the literal "measured
on a real fresh repository for every offered language and PO profile"
acceptance criterion (an empirical measurement, not a known code defect),
plus the one untried combination above.

## Coordinator-sourced path confirmed, 2026-08-29 (NVA-CF-BL18-COORDINATORPATH, commit `7c446d0b`)

The one untried combination above was run for real: `project-onboarding-v3.test.mjs`
now has a 4th real-git/real-receipt test (alongside GF-079, NVA-BL-70,
NVA-W9-DRIFTREPAIR) proving the coordinator-sourced intake/bootstrap-bind
path also correctly republishes the profile receipt after a deliberately
mismatching PRD `po-language` marker — `validatePoGateAuthorityForRepository(...).ok === true`
immediately after bind, no PROFILE-RECEIPT-INVALID/-STALE, no repair
needed. Independently re-verified by the Elephant:
`project-onboarding-v3.test.mjs` 157/157.

**Every reachable onboarding apply path this repository's own code defines
(kickoff-only, legacy kickoff-promotion, coordinator-sourced bootstrap-bind,
and drift-repair) is now covered by a real, passing, non-stubbed regression
test proving the PO-PROFILE-RECEIPT-INVALID scenario this item describes
does not currently occur.** The item's own literal Acceptance criterion
("measured on a real fresh repository for every offered language and PO
profile") is not satisfied at combinatorial-matrix breadth — that would
mean a separate real run per language × profile pair, which was judged
disproportionate given every CODE PATH is already proven correct and the
underlying mechanism is identical across languages/profiles (the receipt
publisher does not branch on language content, only on whether a switch
happened at all). **PO topic:** is this level of coverage sufficient to
close this item, or is the full language×profile matrix measurement still
wanted before closing? Left `status: open` pending that call rather than
closed unilaterally.

## PO decision, 2026-08-29 — accept and close

**Decision:** the PO accepted per-code-path regression coverage (4 real
tests across every reachable onboarding apply path) as sufficient for the
0.6.0 candidate and closed this item as-is, without running the full
language×profile combinatorial matrix measurement. **How to apply:** the
acceptance criterion's literal "measured on a real fresh repository for
every offered language and PO profile" wording stays formally unmet; this
closure records that the PO judged code-path coverage equivalent given the
receipt publisher does not branch on language content.
