---
schema: pipeline.backlog-item.v1
id: pipeline.promotion-leaves-the-handover-and-the-runtime-language-frozen-at-kickoff
type: defect
owner: pipeline
status: open
created: 2026-08-09
source: "Both greenfield happy-path tests the PO ran against the 0.5.4 local candidate on 2026-08-09, one per runner, read read-only by the Elephant at the PO's invitation. Two independent runs, same two symptoms."
due: 2026-08-16
---

# The kickoff promotion supersedes everything the handover names, and leaves the handover saying otherwise

## Description

The kickoff transaction writes four things: the machine state, the history, the
provisional PRD/spec, and the handover (`docs/state.md`). The promotion
transaction replaces the first and appends to the second. It does not touch the
handover, and it carries the kickoff's `continuity.runtime` forward unexamined.

So after a successful promotion the canonical handover still describes the
provisional kickoff feature — whose own directory the same transaction marks
`SUPERSEDED.md` — and, when the PO answered the language question after the
kickoff, the runtime language in the state contradicts the language marker in
the promoted PRD the same transaction just bound.

Both symptoms appeared in both runs, on both runners. Neither is a runner
defect: the mechanism is in shared library code.

## Triggering situation

Two greenfield onboardings against the local `0.5.4` candidate
(`0.5.4+<runner>.20260809091238.7d38484`), 2026-08-09, one per runner. The Codex
run reached `phase: "implementation"` with a PO-approved plan and a working
game; the Claude run reached `design` and reopened it. Read read-only at the
PO's invitation.

## Instance 1 — the handover is frozen at the kickoff

`docs/state.md` in **both** repositories still reads:

```
Feature `kickoff-<hex>` is active in design.
Initial PRD: `specs/kickoff-<hex>/prd_kickoff-<hex>.md`.
Initial specification: `specs/kickoff-<hex>/spec.md`.

## Next action

Review the goal and establish the initial PRD and technical specification.
```

That is `handoverContent()` verbatim
(`plugins/pipeline-core/lib/onboarding-continuity.mjs:2975-2984`), unchanged. In
the Codex repository the state it describes is three steps stale: the active
feature is `runes-minigame`, the plan is PO-approved, and the phase is
`implementation`. The directory the handover points a reader at carries
`SUPERSEDED.md`.

The mechanism is exact. The kickoff transaction's targets include a `handover`
entry (`:3319-3324`). The promotion transaction's targets are `state`, `history`
and an optional `cleanupBinding` (`:3862-3866`) — there is no handover target.
`onboarding-continuity.mjs` is the only writer of that path in the whole plugin
(`rg -l 'calibration.handover|handoverPath' plugins/pipeline-core/`), so nothing
else updates it afterwards either.

This matters more than an ordinary stale document because of what the Pipeline
says about this exact file: the bootstrap reads the calibrated handover first and
treats it as canonical for "where am I". A session resuming either of these
projects is pointed at a superseded anchor by the artifact that is supposed to
prevent exactly that.

**What this item does not decide:** whether the fix is a `handover` target in the
promotion transaction, or an instruction that makes updating it the agent's
explicit step. In the Pipeline's own repository the handover is hand-maintained
by the Elephant, so the seeded machine-written text may be the real anomaly. What
is not defensible is the current state: text written by a transaction, superseded
by a transaction, and updated by nobody.

## Instance 2 — the runtime language stays at the pre-answer default

In the Claude repository, three files disagree:

| File | Value |
|---|---|
| `pipeline.user.yaml:37` | `human_facing: "de"` |
| `project/pipeline.yaml:3` | `human_facing: de` |
| `specs/2026-08-09_runen-von-amon-sul/prd_runen-von-amon-sul.md:1` | `<!-- po-language: de -->` |
| `project/pipeline-state.json` → `continuity.runtime.humanFacingLanguage` | `"en"` |

The sequence explains it and is visible in the artifacts. The *kickoff* PRD
carries `<!-- po-language: en -->`; the *promoted* PRD carries `de`. So the PO
answered the language question after the kickoff transaction had frozen its
value — which `kickoffLanguage()` documents as intended
(`onboarding-continuity.mjs:2910`: without a portable source yet, "retain the
historical canonical English seed").

The promotion is the transaction that learns the answer: it binds the promoted
PRD, `de` marker and all. But `buildKickoffPromotionPlan` clones the kickoff
state and reassigns `activeFeature`, `planApproved`, `continuity.featureId`,
`revision`, `authority`, `queueHead`, `blocker`, `acknowledgedFinal`, `resume`,
`recovery` and `decisionTxn` (`:3800-3818`) — every field except
`continuity.runtime`. So one transaction emits a PRD saying `de` and a state
saying `en`.

The Codex repository is internally consistent at `en` throughout, including
`planApproval.poGateAuthority.humanFacing: "en"`, which is why the drift did not
surface there. That is the field to watch: a PO who answered German would be
taken through the approval ceremony in English. That consequence is already filed
as `2026-08-07-human-authorization-prompts-ignore-the-configured-language-profile.md`;
this item names a mechanism that produces it even after that one is fixed,
because here the *stored* value is wrong rather than the *rendering*.

## Affected artifacts

- `plugins/pipeline-core/lib/onboarding-continuity.mjs:3800-3818` — the promotion
  state transition, which does not re-project `continuity.runtime`.
- `plugins/pipeline-core/lib/onboarding-continuity.mjs:3862-3866` — the promotion
  targets, which have no handover entry.
- `plugins/pipeline-core/lib/onboarding-continuity.mjs:2975-2984` — the seeded
  handover text that both runs left verbatim.

## Proposal

1. Decide the handover question above; it governs the shape of everything else.
2. If the transaction owns it, the handover becomes a fourth promotion target
   with a before/after digest like the other three, so an interrupted promotion
   still restores it.
3. Re-project `continuity.runtime.humanFacingLanguage` from the same resolved
   projection the promoted PRD's marker comes from, and refuse the promotion when
   the two disagree rather than emitting both.
4. A contract test asserting that after a promotion no artifact the transaction
   wrote still names the kickoff feature, and that the state's language equals
   the promoted PRD's marker. Both symptoms survived every existing test because
   each artifact is checked against its own expectations and never against the
   other.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
