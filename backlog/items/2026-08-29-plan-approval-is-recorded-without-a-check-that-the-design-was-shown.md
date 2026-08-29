---
schema: pipeline.backlog-item.v1
id: pipeline.plan-approval-is-recorded-without-a-check-that-the-design-was-shown
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "PO observation during the 2026-08-29 three-runner greenfield test (finding F28 of scratch/greenfield-triage-2026-08-29.md), Antigravity/WSL run."
---

# `approve-plan` records attribution correctly but nothing checks that the design was actually shown to the PO before it was called

## What happened

During the Antigravity run, the PO was asked to approve a plan/design he had
not actually been shown — the runner asked for approval correctly (in the
sense of naming who approved and recording it) but never rendered the
design content itself first. The human was asked to approve something
without being shown it.

## Where it is

The rule this violates already exists as prose: `roles/elephant.md` / the
`pipeline-start` skill's printed confirmation line (`SKILL.md:269`, see the
sibling item on this same skill's hardcoded EL summary) names **EL-19: "PRD
gate: present readably + wait for 'approved'"** — presentation is explicitly
part of the rule, not an afterthought.

What is missing is the mechanical side. Investigated
`plugins/pipeline-core/scripts/pipeline-state.mjs`'s `approve-plan` case
(header comment at line 126: "Sets planApproved=true, records..."; case
handler starting at line 7728). Its preconditions, as read, are: a non-empty
`--by <name>` attribution (line 7731: "an unattributed approval is refused")
and an exact current submitted plan matching lifecycle state (line 7737).
**No precondition found that checks whether the plan/design content was
rendered into the session's own output before this call runs** — the CLI has
no way to observe that, and nothing else in the surrounding flow (as read
within this dispatch's budget) records a "design was displayed" fact that
`approve-plan` could check against. The gate that exists is attribution
("who approved"), not disclosure ("were they shown what they approved").

This is the same shape of gap `F17` in this same triage names for
`submit-plan` (a Notes-section instruction with no enforcing check) — F28 is
its counterpart one step later in the same flow, for `approve-plan`.

## Proposal

Record a "design was rendered to the human" fact as part of the flow that
leads into `approve-plan`, and have `approve-plan` refuse (or at minimum
warn loudly) when that fact is absent for the plan being approved — mirroring
how `--by` attribution is already a hard precondition rather than a
convention. The exact mechanism (a flag the presenting step sets, a hash of
the rendered content recorded alongside the submission, or a session-side
attestation) is a design decision for whoever picks this item up; this item
establishes the gap and the acceptance bar, not the implementation.

## Acceptance

- `approve-plan` refuses (or requires an explicit, named override) when no
  prior "design rendered" record exists for the plan being approved, proven
  by a test that calls `approve-plan` without ever having exercised the
  presentation step.
- The existing `--by` attribution requirement and lifecycle-match
  requirement are unchanged — this is additive to `approve-plan`'s existing
  preconditions, not a replacement.
- A normal flow that DID present the design first still succeeds unchanged —
  proven by a test, since this is the case that would break every legitimate
  approval if drawn too strictly.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Implemented as NVA-R22-PLANSHOWN: new `present-plan --by <name>`
  CLI step records `planPresentation` (a session-side attestation, matching
  `--by`'s own claim style) bound by `submissionSha256` to the exact current
  submission; `approve-plan` hard-refuses (no override) when no matching
  record exists, checked last so a request invalid for another reason still
  reports that reason. Additive only — existing `--by`/lifecycle-match checks
  unchanged. Known consequence: `harness/scripts/pipeline-state.test.mjs`
  (TP-5 protected, out of this dispatch's edit scope) has ~10 pre-existing
  `approve-plan`-success fixtures that never call `present-plan` and now fail
  (PS06a/c/d + a downstream crash) — needs a dedicated author-repair follow-up
  to insert `present-plan --by <name>` calls before those `approve-plan`
  calls; not yet done.
- **Assignment:** `sprint: nova`, and it blocks the 0.6.0 release candidate —
  per the triage's own Sprint column, F28 is one of only two Friction-group
  findings marked NOW (with F23): a PO approving unseen content is a
  quality-gate integrity failure on the single most consequential human
  decision point in the flow, not merely friction.
- **Date:** 2026-08-29
