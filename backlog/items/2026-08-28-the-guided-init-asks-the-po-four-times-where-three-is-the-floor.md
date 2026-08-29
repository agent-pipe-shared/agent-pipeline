---
schema: pipeline.backlog-item.v1
id: pipeline.guided-init-human-rounds-above-floor
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
done_when: "contains plugins/pipeline-core/lib/onboarding-continuity.mjs profile = null, text = null, activate = false, deps = {}"
tracking: "NOW / Nova A — PO asked directly whether the four human rounds can be collapsed to one or two. Three is the floor; one of the four is removable, and it is the cheapest of the four to remove."
source: "Measured 2026-08-28 by driving scratch/smoke-guided-init-full.mjs against a genuinely fresh repository at HEAD 435063c5: 4 human rounds, 25 chained driver commands, 0 repair subcommands. Dependency analysis done against the intake state machine in onboarding-continuity.mjs, not from the measurement alone."
---

# The guided init asks the PO four times where three is the floor

## What a fresh project costs the PO today

| round | the ask | what it needs first |
| --- | --- | --- |
| 1 | consent, git author name and email, language, profile | nothing |
| 2 | the project description, as free prose | nothing |
| 3 | the one bundled round of design questions | round 2's text — the questions are derived from it |
| 4 | read the generated PRD and spec, add the acknowledgement marker | round 3's answers — the PRD does not exist before them |

## Which of these can actually be merged

**Rounds 1 and 2 have no dependency between them in either direction.** Consent,
identity, language and profile do not depend on the project description, and the
description does not depend on them. They are two rounds only because
`intake-consent-apply` moves the checkpoint `absent -> collecting` and
`intake-capture-apply` requires state `collecting`. That is a sequencing artefact of
the transaction, not a fact about the human.

**Round 3 cannot move up.** `intakeDesignQuestionsAction()` asks the ONE bundled
round of questions this project still needs, and those questions are derived from the
captured material. They cannot be asked before the material exists. Nor can the round
be skipped when the material is rich: `applyOnboardingIntakeDesignQuestions()` refuses
an empty answer set outright (`INTAKE-DESIGN-QUESTIONS-EMPTY`, "requires at least one
question/answer pair"), and that refusal should stay — the design round is what turns
a one-line goal into a PRD worth acknowledging.

**Round 4 cannot move up, and must not be automated away.** The PRD and spec do not
exist until round 3 is applied, so the acknowledgement cannot precede them. The marker
is content-bound by sha256, so acknowledging a draft that then changes in response to
the PO's own answers would not mean anything. And per
`collectPrdAcknowledgementAction()`'s own contract, no command may ever write this line
on the PO's behalf — a gate an agent can satisfy for itself is not a gate.

**Therefore the floor is three, and only round 2 is removable.**

## The work

`intake-consent-apply` gains optional `--text` / `--text-file`. When supplied, the same
transaction records consent AND captures the first material chunk, landing the
checkpoint directly in `design-questions-pending` instead of `collecting`. When not
supplied, behaviour is exactly as today — the flag is additive and the existing
two-step path stays valid for a PO who has not yet decided what to build.

`intakeConsentAction()`'s `inputs` gains the material text alongside the four existing
fields, and its guidance asks for all of it in one turn.

The `--text-file` half is not optional politeness: the closed shell grammar refuses a
command carrying a newline, so a multi-line project description cannot reach `--text`
in any quoting. `intakeCaptureAction()`'s guidance already says exactly this and names
`scratch/` as the holding place; the merged ask must carry the same instruction or it
will fail on the first PO who writes two paragraphs.

## Why "measurably three", not "feels like one"

A cheaper variant was considered and rejected: leave the state machine alone and only
change the guidance, so the agent asks for consent and the description in one breath
and then runs two commands back to back with no human in between. That does reduce the
number of times a human is interrupted in a chat session — but the second
`collect-input` still appears in the protocol, so the measured human-round count stays
at four and the acceptance criterion cannot be checked by driving the flow. The number
the PO asked about has to be the number the harness reports.

## Acceptance criteria

- `scratch/smoke-guided-init-full.mjs` against a genuinely fresh repository reports
  **3 human rounds** and still **0 repair subcommands**.
- A PO who supplies no description at consent time still reaches the same place through
  the existing two-step path; a test asserts both routes converge on an identical
  checkpoint.
- A multi-line description reaches the checkpoint intact through `--text-file`.
- Rounds 3 and 4 are unchanged. In particular no writer for the acknowledgement marker
  appears anywhere in the diff.

## Related

- `2026-08-28-onboarding-needs-one-guided-init-instead-of-a-turn-by-turn-state-machine.md`
  — the parent item; this is the last measured distance to its floor.
- `2026-08-28-the-guided-init-ends-in-an-error-where-it-should-ask-the-po.md` — round 4,
  which this item deliberately leaves alone.
