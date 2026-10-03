---
schema: pipeline.backlog-item.v1
id: pipeline.three-runner-happy-path-with-two-po-approvals
type: requirement
owner: pipeline
status: open
created: 2026-10-03
source: "PO requirement after the 0.7.0 three-runner greenfield tests (local mini HTML game), 2026-10-03; Codex run needed several signatures, Claude run needed two guard-override signatures (docs/pipeline-analyse-greenfield.md in the Claude test repo, section 4)."
sprint: alfred
done_when: manual
---

# All three runners walk the happy path without detours and with two PO approvals

## Description

**PO requirement (hard):** on the happy path, Claude, Codex and Antigravity each
complete onboarding, design, Advisor, plan approval, implementation and push
without detours. The PO is asked for exactly **two** approvals or signatures:
the plan approval and the push approval. Guard overrides, recovery
ceremonies or repeated signatures caused by product defects are not part of
the happy path.

Observed 2026-10-03:

- Codex needed several signatures. It was "definitely not a happy path".
- Claude needed two guard-override signatures before the plan approval was
  ever reached, and one of them was burnt by a changing request digest.
- Antigravity could not complete the design at all.

## Acceptance

- One end-to-end greenfield scenario per runner (Claude on Windows, Codex,
  Antigravity) reaches a pushed feature branch with exactly two PO proofs or
  confirmations recorded and zero guard overrides.
- Any additional PO interaction on that path is a test failure that names its
  cause.
- Related items:
  `2026-09-28-plan-submission-must-not-require-separate-po-approval.md`,
  `2026-09-29-greenfield-design-course-cost-and-proportionality.md`,
  `2026-10-03-feature-branch-push-admitted-without-signature-approval.md`.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
