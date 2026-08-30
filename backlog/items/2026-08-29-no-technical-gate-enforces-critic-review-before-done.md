---
schema: pipeline.backlog-item.v1
id: pipeline.no-technical-gate-enforces-critic-review-before-done
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
tracking: "Nova B -- PO decision 2026-08-29: real design work needed (detecting when a Critic review was DUE and never ran is not trivial), too large for this candidate."
source: "Claude/Windows 060-78 greenfield retrospective (scratch/greenfield-reports/pipeline-retrospective-claude-060-78.md), section 5 point 8 and section 11: 'Kein technisches Gate erzwingt das Critic-Review selbst.'"
---

# Nothing technically enforces "run Critic review before declaring done" -- unlike every other critical action, this is pure convention

## What happens

Every other critical action in this Pipeline (file writes to protected paths, pushes,
critical-authority changes) is hard-blocked by a guard if the precondition isn't met. The
requirement to obtain an independent Critic review before declaring implementation work done
(`roles/elephant.md`) is, by contrast, purely documentation/convention -- nothing technically
prevented the reporting session from skipping the Critic-dispatch step and declaring the work
finished anyway. The Claude/Windows greenfield session found a real spec violation via Critic
review that its own thorough manual browser QA had missed and mis-classified as expected
behavior -- concrete evidence the review step has real value, which makes its purely
conventional (non-enforced) status a notable gap relative to the rest of this system's guard
philosophy.

## Why this is Nova B, not now

Building this requires the guard to determine, for a given diff/session, whether a Critic
review was actually DUE (per `review-protocol.md`'s own trigger matrix) and never ran --
that classification logic does not currently exist anywhere and is nontrivial (it has to
avoid both false negatives on class-high work and false-blocking trivial/T0 changes). Real
design work, not a same-session patch.

## Direction

Survey `review-protocol.md`'s existing trigger matrix and `criticSkip` recording mechanism
(`plugins/pipeline-core/lib/critic-skip-decision.mjs`) as the likely foundation -- a gate
could plausibly refuse a "done"/close declaration when neither a Critic artifact nor a
recorded `criticSkip` decision exists for the diff in question, mirroring how dispatch
authorship is already checked mechanically.

## Acceptance criteria

- A design decision (register entry and/or ADR, per EL-04) names the concrete detection
  mechanism and its trigger definition.
- The mechanism is mechanically checkable, not solely a new sentence in CLAUDE.md /
  `docs/operating-model.md`.

## Triage

- **Decision:** accepted, explicitly deferred to Nova B
- **Rationale:** PO decision 2026-08-29, live: real value confirmed, but design effort too
  large for the current candidate; addressed via AskUserQuestion during the greenfield-report
  review.
- **Date:** 2026-08-29
