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

## Observed 2026-10-18: AGY greenfield, design signature took two PO attempts (F-03)

Source: PO-supplied forensic analysis of the Antigravity greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_agy_20261026.md`, finding F-03, improvement 2),
installed `pipeline-core` 0.6.2.

- The agent handed the PO a long `sign-intent ... && node -e 'import(...)'` chain. It
  wrapped on paste and failed. The second attempt signed, but importing
  `po-human-approval.mjs` through `node -e` ran its CLI block and broke the proof copy, so
  the agent copied the proof out of the key directory by hand.
- `sign-intent` showed the PO `no recorded request resolves for this digest
  (HGO-RECORD-DIGEST-MISMATCH)` for an ordinary design approval.
- Re-check against 0.7.0 (2026-10-18):
  - The CLI block is now guarded (`isDirectInvocation`, `scripts/po-human-approval.mjs`).
  - The design approval is already one PO command. `present-plan` prints
    `po-human-approval.mjs sign-intent --request scratch/design-approval-request-<sha>.json`
    (`scripts/pipeline-state.mjs`, around line 11031). That command writes
    `scratch/design-approval-proof-<sha>.json`, which `approve-plan` reads.
  - The "no recorded request" text (`compactSigningDisclosure`, `po-human-approval.mjs`
    around line 480) appears only for the bare `sign-intent --intent-sha256` form or an
    unknown request schema. In the observed run the agent handed over the wrong form.

Added acceptance (0.7.0, minor; toil, PO 2026-10-18):

- Every doc and every rendered next action hands the PO the `--request` form for a design
  approval, never `--intent-sha256`. A pin asserts that the design-approval PO output
  carries no guard-override warning.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### Agent measurement of the added 0.7.0 acceptance (2026-10-22)

The pin `plugins/pipeline-core/lib/pins/three-runner-happy-path-with-two-po-approvals.test.mjs` now states the added acceptance
with one real case per point (19 cases: 16 pass, 0 fail, 1 typed skip for the per-runner host run, 2 typed todo):

- Typed absent course with a repair: delivered (`SQ-DELIVERY-COURSE-ABSENT`, repair names the governed course writer and `slice-queue.json`;
  an unsafe course file still fails closed as `SQ-DELIVERY-STATE-UNAVAILABLE`). The repair is prose naming the writer, not an argv action.
- Course writer for German-table Specs and `.test.js` checks: delivered (numbered and `R-n` rows under `Abnahmekriterien`, `.test.js` admitted).
- Delivery hand-off at plan readiness: `lib/plan-handoff-readiness.mjs` is delivered and tested, but no code calls it. `submit-plan` and
  `present-plan` in the protected `scripts/pipeline-state.mjs` do not invoke it, so the failure can still first appear after approval.
  Typed todo; the call sites are the patch `three-runner-patch-01.json` (operator applies it in the signature sitting).
- Onboarding answers surviving the restart: the intake record holds the Git author, language and profile and a fresh process reads
  them back, and no restart plan is offered before the record is complete. Not met: after the record holds the Git author the next
  inspection still publishes `gitAuthorName`/`gitAuthorEmail` as pending asks (language is honoured). Typed todo, blocked on a design
  call; `lib/project-onboarding-v3.mjs` is exactly at its architecture line bound, so code must move out before any line is added.
- Not covered: the per-runner end-to-end runs (host evidence), the fix for the two todo points, PO acceptance.

## Observed 2026-10-20: Codex WSL greenfield, second run (major)

Source: PO-supplied forensic analysis of a Codex greenfield run on WSL
(`scratch/pipeline-analyse-greenfield_codex2_20261020.md`), installed `pipeline-core`
`0.7.0+codex.20261020064459.a8ddf85`, chat approval mode. The run never reached the first
implementation dispatch. The PO puts the report's blockers and majors into the next candidate (D64).

- After the restart the session asked the PO for the Git author again, although it was answered
  before the restart, and the manual intake capture lost the author arguments while language and
  profile survived. Submission and presentation actors were then asked one by one.

Added acceptance (0.7.0, major, D64):

- Every onboarding answer, the Git author included, survives the restart in one typed intake
  record that is checked for completeness before the restart is offered; the next session asks for
  none of them again.
- The actor attribution that submission and presentation need is asked once, bundled with the
  other required answers where the policy allows; no name is taken from Git as PO authority.
