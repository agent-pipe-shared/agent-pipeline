---
schema: pipeline.backlog-item.v1
id: pipeline.prd-binding-precedes-framing-with-no-reopen-path-back
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/lib/plan-spec-state-v2.mjs pipeline.reopen-bound-unsubmitted-prd
source: "Claude/Windows self-audit report (docs/pipeline-audit-claude-session.md, sections 2 and 3.2), observed during the 2026-08-29 three-runner greenfield test. Claude had no way back from this state; Codex succeeded only because it happened to author framing before binding occurred."
---

# The bootstrap-bind-apply sequencing trap: a PRD can be bound before framing exists, with no working reopen path back

## What happened

`bootstrap-bind-apply` can bind the PRD before its synthesized framing has been
authored. Once bound, the file is `GUARD-LIFECYCLE-AUTHORITY-BOUND`, and the
guard's own named remedy — `reopen-design` — is a no-op for exactly this case:
a feature that was bound but never submitted. Claude hit this and had no way
back to an editable PRD. Codex avoided it only because its own session
happened to author framing BEFORE the binding step ran, not because the
pipeline enforces that ordering.

This item, F06, and F07 are one causal chain (bind-before-framing → the
language-field mismatch this creates → the fact that fixing the language field
costs a full signature ceremony because of unrelated file-level protection) and
are filed as three separate, cross-referencing items per the dispatch briefing,
not merged.

## Where it is

`plugins/pipeline-core/lib/plan-spec-state-v2.mjs`, `reopenPlanDesign()`
(exported at line 683). Read directly, its recovery paths are:

1. **A real prior submission exists** (`validPlanSubmission(submission)` is
   true) → builds and returns a `PLAN-INVALIDATION` record, moves phase back to
   `design`, sets `planApproved: false`. This is the path Codex's own kind of
   run would take if it ever needed to back out after actually submitting.
2. **No submission, but a recognized legacy V2 approval shape**
   (`legacyV2Approval`, lines 702–708: `planSubmission === undefined`,
   `planApproved === true`, phase `implementation`, a valid V2 approval, no
   prior invalidation/revocation) → silently retires the approval, drops phase
   to `design`. A narrow, specifically-shaped compatibility case.
3. **No submission, and already sitting in `design` with `planApproved !==
   true`** (lines 727–730) → treated as an already-satisfied replay
   (`{ ok: true, replay: true, ... }`), no state change.
4. **Anything else** → `fail("PLAN-REOPEN-SUBMISSION-INVALID")` (line 730).

A PRD that is `GUARD-LIFECYCLE-AUTHORITY-BOUND` (bound) but never submitted,
and NOT sitting in the narrow legacy-V2 shape of path 2, and NOT already in
`design` with `planApproved !== true` (path 3) — the exact shape a
bind-before-framing sequence produces when the phase is something other than
`design`, or the legacy-V2 preconditions do not all hold — falls through to
path 4 and fails outright. There is no branch in this function that
constructs a fresh `PLAN-INVALIDATION` for a bound-but-never-submitted feature
outside those two narrow shapes.

## Proposal

Add a fifth path to `reopenPlanDesign()` (or a sibling function called from
the same guard remedy) that recognizes "authority-bound, no valid submission,
not the legacy-V2 shape, not already replay-safe in design" as its own case,
and constructs a `PLAN-INVALIDATION` for it the same way path 1 does for a
genuine prior submission — the binding itself is the thing to invalidate, not
a submission that never happened. The invalidation record's `reason` should be
distinguishable from `reopen-design`'s existing reasons (see
`INVALIDATION_REASONS` in the same file) so a later audit can tell "backing out
of a real approved submission" apart from "backing out of a binding that
preceded its own framing."

Separately, and arguably the more durable fix: prevent the sequencing trap at
its source rather than only building a better escape hatch. `bootstrap-bind-apply`
binding before framing exists should itself be examined — whether framing
authorship can be made a precondition of binding, rather than binding
happening to race ahead of it depending on session order (this is `docs/state.md`'s
kind of design question, not something to resolve inside this backlog item).

## Acceptance

- A test constructs the exact trap: bind a PRD via the code path
  `bootstrap-bind-apply` uses, with no framing authored and no submission ever
  made, then calls `reopenPlanDesign()` against that state and asserts it
  returns `ok: true` with a real invalidation, not `PLAN-REOPEN-SUBMISSION-INVALID`.
- The three EXISTING `reopenPlanDesign()` paths (real-submission invalidation,
  legacy-V2 retirement, already-in-design replay) are unchanged — proven by
  the existing test suite in `plugins/pipeline-core/lib/plan-spec-state-v2.test.mjs`
  continuing to pass.
- The new invalidation path is reachable from the actual guard remedy text a
  session sees when it hits `GUARD-LIFECYCLE-AUTHORITY-BOUND` (not just
  reachable from a direct unit-test call into the library function).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Verified directly against `reopenPlanDesign()`'s own source:
  the four-way branch genuinely has no path for a bound-but-unsubmitted
  feature outside the narrow legacy-V2 shape. Claude's audit names this as the
  proximate reason it produced zero code in the run; Codex's avoidance was
  incidental (framing happened to be authored first), not a demonstration that
  the pipeline enforces the right order.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate. First of the
  F05/F06/F07 causal chain — see `pipeline.prd-language-gate-reads-a-field-
  intake-never-writes` (F06) and `pipeline.pipeline-user-yaml-file-level-
  protection-forces-signature-ceremony` (F07), both downstream of this one
  landing.
- **Date:** 2026-08-29
