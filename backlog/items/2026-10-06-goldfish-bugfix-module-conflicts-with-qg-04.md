---
schema: pipeline.backlog-item.v1
id: pipeline.goldfish-bugfix-module-conflicts-with-qg-04
type: defect
owner: pipeline
status: open
created: 2026-10-06
source: "Three Opus Critic rounds in the Alfred night run, 2026-10-06 (FANOUT category 7 F1/F2, GPGL-7 F-3, HOOKREFRESH fixes F-1)."
sprint: alfred
done_when: manual
---

# The Goldfish BUGFIX module tells the implementing dispatch to write its own repro test, which QG-04 forbids

## Description

`templates/prompts/goldfish-task.md` ("Optional module: BUGFIX briefing") makes the implementing Goldfish write a failing
repro test, run it RED, then fix and keep the test. `guardrails/quality-gates.md` QG-04 (lines 71-75) says an
implementation Goldfish must not create or modify the tests that validate its own implementation; a test change is a
separate dispatch and commit, and the Critic's test-diff review is the primary defence because `guard-testpath` does
not enforce the task-type distinction. A dispatcher following the template verbatim therefore produces a QG-04 breach
every time. In one night three independent Critic rounds flagged exactly this (FANOUT-F5/F5b2, GPGL-7, HOOKREFRESH-S5d),
twice as major.

## Triggering situation

`specs/sprint-alfred-epic/evidence/critic-2026-10-05/fanout-category7.md` (F1, F2),
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/gpgl-7-fix-verification.md` (F-3),
`specs/sprint-alfred-epic/evidence/critic-2026-10-05/hookrefresh-fixes.md` (F-1).

## Affected artifact

`templates/prompts/goldfish-task.md` (and the vendored copy under `plugins/pipeline-core/templates/prompts/`),
`guardrails/quality-gates.md` QG-04, `roles/goldfish.md`.

## Proposal

Pick one rule and make both documents say it: either (a) split every bugfix into a test-only dispatch (writes the repro,
proves RED, commits) followed by an implementation dispatch that may not touch that test, and rewrite the BUGFIX module
accordingly; or (b) carve out a narrow QG-04 exception for a NEW repro test written before any production edit, with
the RED run as a mandatory artifact and a hard ban on changing pre-existing tests or the repro after the fix goes
green. Until decided, the Alfred night run uses (a). Due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** fixed in source — closes after the 0.7.0 candidate host checklist (status stays `open` until then).
- **Rationale:** commit(s) `b3cabc7f8`.
- **Assignment (if accepted):** sprint-alfred-epic close-out batch.
- **Date:** 2026-10-08.
