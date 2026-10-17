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

**PO clarification (2026-10-03, later):** on a design the PO gives exactly
**one** final approval, as a signature or in chat depending on the mode.
Intermediate design-phase mutations are agent work and need no PO
confirmation. Live counter-example in the Agent-Pipeline session: after a
design-source change, `pipeline-state inspect` emitted `reopen-design` with
`requiresConfirmation: true`, and `submit-plan` was blocked by
`PO-PROFILE-RECEIPT-STALE` until a confirmed profile-receipt repair.

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

## Observed 2026-10-17: Codex WSL greenfield stops after plan approval (blocker for 0.7.0)

Source: PO-supplied forensic analysis of the Codex greenfield run on WSL, installed
plugin `0.7.0+codex.20261017214948.d6f4d76`, finding P0-1 (confirmed).

- The plan was approved and the implementation phase began, but the delivery course
  could not be read: `SQ-DELIVERY-STATE-UNAVAILABLE`. No valid `slice-queue.json` existed;
  the continuity queue still stood on `initial-planning/review-goal` without a dispatch.
- Source cause: `resolveGovernedItemQueue` (`plugins/pipeline-core/lib/native-goldfish-host-state.mjs`)
  reads `<plan dir>/slice-queue.json`; a missing file throws inside the `try` and is
  reported as the generic `SQ-DELIVERY-STATE-UNAVAILABLE`, not as an absent course with a
  repair action.
- The documented repair route, the course writer `prepareGovernedItemQueue`, cannot repair
  this approved package:
  - its criterion locator must parse an `AC-n` form from the original Spec, and the
    parser (`lib/critic-accepted-contract.mjs`) only knows certain English table and
    paragraph forms; the signed German Spec uses a two-column table with numbered
    `n / R-n` rows;
  - the item briefing accepts check files ending `.test.mjs` / `.test.cjs`
    (`lib/native-goldfish-host-return.mjs`), while the project's Spec and tests use
    `.test.js`.
- Result: an approved greenfield feature cannot reach its first implementation dispatch,
  and there is no walkable recovery.

Added acceptance (0.7.0, blocker):

- After plan approval with no course yet, the delivery state reports a typed absent-course
  result (not `SQ-DELIVERY-STATE-UNAVAILABLE`) with an exact, agent-executable repair action.
- The course writer binds criteria of an approved Spec without reformatting the signed
  bytes: numbered table rows (`n`, `R-n`) and non-English headings are admitted; check
  files follow the project's own test convention (`.test.js` admitted).
- Plan readiness (before the PO approval) proves the delivery hand-off with the generated
  sources (criterion locators, check paths, dispatch admission), so the failure cannot
  first appear after approval.
- A pin drives: approved German-table Spec with `.test.js` checks -> course written ->
  first item dispatch admitted; and the absent-course repair route end to end.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
