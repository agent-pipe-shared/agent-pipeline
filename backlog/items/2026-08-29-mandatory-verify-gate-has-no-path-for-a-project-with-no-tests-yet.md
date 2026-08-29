---
schema: pipeline.backlog-item.v1
id: pipeline.mandatory-verify-gate-has-no-path-for-a-project-with-no-tests-yet
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains harness/scripts/verify.mjs pipeline.verify-manual-check-placeholder-detection
source: "Antigravity/WSL self-analysis (docs/pipeline-analysis.md, section 2) and the PO's own observation, during the 2026-08-29 three-runner greenfield test."
---

# A static project with no test suite gets stuck at the mandatory verify step, and its unfilled placeholder passes silently

## What happened

Greenfield asks for a verify command before anything exists in the project to
verify — a brand-new static project genuinely has no test suite yet in its
first sessions. Separately, and closely related (the triage explicitly pairs
these two rows, F11 and F19): the shipped run's `verify.log` contained only
the literal string `"Manual check required."` — the placeholder was never
replaced with a real verify command, and the gate accepted it anyway. A
project stuck with nothing to verify and a gate that silently accepts an
unfilled placeholder are two ends of the same actual gap: verify's mandatory
posture does not yet distinguish "no verify command configured yet, and that
is honestly declared" from "no verify command configured, and nobody noticed."

## Where it is

I located the general verify entrypoint,
`harness/scripts/verify.mjs`, and confirmed it is one of the twelve
guard-testpath-protected paths (`TP-3` in
`templates/prompts/agent-obligations.md` §2 — read as a mandatory context file
for this dispatch) — meaning any fix to it needs the human-guard-override
signature ceremony, or must be scoped to a project-level verify configuration
this repository ships to a consumer project instead of to this file directly.
I did NOT, within this dispatch's tool budget, locate the specific mechanism
that reads `"Manual check required."` (or an equivalent placeholder string) as
a satisfied verify result rather than flagging it as unfilled — that trace
is the concrete next step for whoever picks this item up.

## Proposal

Two related but separable fixes:

1. **For a genuinely test-less greenfield project:** verify's project-level
   configuration should have an explicit, honestly-declared "no verify command
   configured yet" state (analogous to this backlog's own `done_when: manual`
   convention — distinguishable from omission) that is reported as such rather
   than forcing an agent to either block indefinitely or paper over the gap
   with an unfilled placeholder.
2. **For the placeholder-acceptance gap (pairs with F19 in the triage):** the
   verify gate should detect and reject the literal, unfilled
   `"Manual check required."` string (or whatever the actual template
   placeholder text is) as a FAILING result, not a passing one — a placeholder
   that was never replaced is evidence of nothing, and treating it as
   satisfied is the same class of problem as `check-backlog-done-predicate.mjs`'s
   own `STALE-OPEN`/`REGRESSION` findings exist to catch for backlog items:
   a declared state that silently disagrees with reality.

## Acceptance

- A test asserts that a project's verify configuration carrying the literal
  unfilled placeholder text (whatever it is confirmed to be, once located) is
  reported as a FAILING/incomplete verify result, not a passing one.
- A test asserts that a project explicitly, honestly declaring "no verify
  command configured yet" (the new state from proposal 1) is distinguishable,
  in verify's output, from both a passing verify and a placeholder-masked
  failure.
- A controlled reproduction: onboard a genuinely test-less static project
  through this Pipeline's actual greenfield flow and confirm the FIRST verify
  run after onboarding does not silently pass on an unfilled placeholder.
- The specific mechanism that currently accepts the placeholder string is
  named with a file/line reference, replacing this item's current honest
  "could not locate within budget" note.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Two independent observations in the same run (Antigravity's
  own report and the PO's), plus the triage's own explicit pairing of F11 with
  F19 (the placeholder that was "never replaced" and "the gate accepted it").
  A mandatory gate that a genuinely test-less project cannot honestly satisfy,
  paired with a gate that silently accepts a dishonest placeholder instead, is
  a real defect in the gate's design, not merely friction.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's L
  group (F11) and Q group (F19, paired explicitly in the triage's own table).
  Pairs conceptually with
  `pipeline.a-dirty-claude-directory-blocks-verify-which-blocks-push-approval`
  (F10) — both are "verify's mandatory posture vs. a brand-new project's
  actual starting state" instances.
- **Date:** 2026-08-29

## Investigation update (NVA-R26-VERIFYPREP, 2026-08-29)

Traced `harness/scripts/verify.mjs` in full (all 863 lines, this dispatch's
own read). Confirmed: this file's own step/suite computation never reads or
interprets a `verify.log` or any other free-text log content at all — it
runs `TEST_SUITES`/`SCOPED_VERIFY_SUITES`/`WINDOWS_ASSURANCE_VERIFY_SUITES`
entries as real child-process suites via `runVerifyJournal` and aggregates
their exit codes (verify.mjs:786-820), plus a small number of synthetic
preflight steps (`candidate-preflight`, `candidate-binding`,
`verify-suite-registration-duplicates` — verify.mjs:757-834). There is no
branch anywhere in this file that reads `verifyManualStatus`, a
project-level "no verify configured" declaration, or any free-text
manual-check note — the "no verify command configured yet" state this item
asks for genuinely does not exist yet, confirming the proposal's premise
rather than only failing to find it within budget.

A complete, ready-to-paste drafted diff for `harness/scripts/verify.mjs`
adding this state (marker `pipeline.verify-manual-check-placeholder-detection`)
was produced and proven against a scratch fixture
(`scratch/nva-r26-verifyprep/manual-check-logic.test.mjs`, 7/7 passing) but
NOT landed — `verify.mjs` is TP-3 protected and needs a signed
human-guard-override ceremony (see
`evidence/dispatch-record-NVA-R26-VERIFYPREP.json` for the full drafted
text).
