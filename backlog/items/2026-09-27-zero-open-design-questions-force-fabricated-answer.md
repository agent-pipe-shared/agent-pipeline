---
schema: pipeline.backlog-item.v1
id: pipeline.zero-open-design-questions-force-fabricated-answer
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
sprint: nightwing
done_when: manual
source: "Rune_Test1_agy_70_113/docs/agent-pipeline-review.md section 2, 2026-09-27; plugins/pipeline-core/lib/onboarding-continuity.mjs applyOnboardingIntakeDesignQuestions and validateIntakeCheckpoint."
---

# Permit an explicit zero-open-question design intake

The Agy consumer received detailed design input and had no genuine open
question, but `intake-design-questions-apply` rejects an empty answer list
with `INTAKE-DESIGN-QUESTIONS-EMPTY`. The checkpoint validator also rejects an
empty `designQuestions` array. To advance, the agent invented a question and
answer. That contaminates the input record and adds avoidable ceremony.

## Direction

Add an explicit disposition that the supplied material was reviewed and no
open design question remained. Bind it to the existing consent, material
input, revision and digest checks. Keep `null` or absent answers distinct from
an affirmative zero-question decision; real unanswered questions must still
block generation. Preserve exact replay and the pre-generation correction
route.

## Acceptance

A complete input with no open questions reaches generation without fake Q&A.
Missing or invalid input cannot use the zero-question route. A real question
still needs an answer, and three-runner CLI/guard admission stays consistent.

## Triage

- **Decision:** pending
- **Assignment:** Nightwing intake experience
- **Date:** 2026-09-27
