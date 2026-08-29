---
schema: pipeline.backlog-item.v1
id: pipeline.prd-framing-precondition-is-prose-not-a-check
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/scripts/pipeline-state.mjs pipeline.prd-framing-precondition-check
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md §10.4), cited by scratch/greenfield-triage-2026-08-29.md finding F17, observed during the 2026-08-29 three-runner greenfield test."
---

# Nothing enforces that a PRD contains synthesized framing before `submit-plan`

## What happened

A generated PRD's own "Notes" section stated that framing "must be authored
and reviewed before the plan is submitted" — and a human approved the
unmodified generated document, framing gap included, six minutes later. The
precondition exists only as prose inside the generated artifact; nothing in
the `submit-plan` path checks whether that framing was actually authored
before allowing submission.

## Where it is

`plugins/pipeline-core/scripts/pipeline-state.mjs`, the `submit-plan` case
handler (around line 7524: `case "submit-plan":`) validates `--by`/
`--profile`, checks `PO-GATE-AUTHORITY-INVALID`-class authority, and calls
`submitPlan(...)` (imported at line 368, invoked line ~7554). None of the
validation performed there reads the PRD document's own content to check
whether a "Notes: framing must be authored" placeholder is still present
verbatim — the precondition named in the generated file is not read back and
enforced by the code that gates submission.

## Proposal

Add a content check to the `submit-plan` path (or an earlier authoring-time
check) that refuses submission while the PRD still contains its own
unmodified "framing must be authored and reviewed before submission"
placeholder text, or more generally while a designated framing section is
empty/templated rather than filled in. This turns a precondition that is
currently only advisory prose into a mechanical gate, consistent with this
repository's stated preference for deterministic checks before probabilistic
review. Add a marker `pipeline.prd-framing-precondition-check` at the point
this lands.

## Acceptance

- `submit-plan` refuses (with a typed, actionable error) when the PRD being
  submitted still contains its own generated framing-placeholder text.
- `submit-plan` succeeds normally once the framing section has been
  genuinely authored (replaced, not merely present as different prose that
  still matches the placeholder).
- A test exercises both the refusal and success paths against
  `pipeline-state.mjs`'s `submit-plan` handler.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly observed — the generated document even names its
  own missing precondition, and the human approval flow was six minutes,
  clearly not enough time to have caught it by review discipline alone. A
  mechanical gate is a better fit than relying on human vigilance here.
- **Assignment:** `sprint: nova`, Nova B — a quality-gate hardening on an
  existing lifecycle step, not a happy-path blocker; does not block the
  0.6.0 candidate.
- **Date:** 2026-08-29
