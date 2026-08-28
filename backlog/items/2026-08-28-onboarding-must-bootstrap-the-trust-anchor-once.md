---
schema: pipeline.backlog-item.v1
id: pipeline.onboarding-must-bootstrap-the-trust-anchor-once
type: defect
owner: pipeline
status: open
created: 2026-08-28
sprint: nova
tracking: "NOW / Nova A — happy-path blocking: its absence deadlocked the first human override in the Claude run and cost a live PO signature; PO asked for this explicitly"
source: "Greenfield happy-path test of candidate 0.6.0 across all three runners, 2026-08-28. Independent self-analyses: Claude/Windows (docs/pipeline-haertungstest-und-analyse.md), Agy/WSL (pipeline-analysis.md), Codex/WSL (docs/pipeline-session-analysis-2026-08-28.md), plus the PO's own cross-run observations."
---

# The trust anchor is never bootstrapped, and its absence surfaces as a circular deadlock instead of a named prerequisite

## What happened

The Claude run needed a human override to fix its verify contract; the override
needs a `trustAnchor` in `project/critical-human-proof.json`; that file is itself
gate-strength protected. The anchor was never set because the `setup` step never
ran. Result: a circle only breakable by setting the anchor by hand outside the
session, after ~3 ceremony rounds and one expired PO signature.

Agy independently reported the same class of problem from the other side: the
`signature` default "plunges the user into a complex cryptographic workflow"
with no preparation.

## The defect

The absence of the anchor is a **precondition that is never checked and never
established**. It becomes visible only as an unexplained circularity at the
moment a human override is first needed — which is exactly the worst moment,
because a PO signature is usually already in flight.

## Direction — the PO's explicit ask

Bootstrap the anchor once, during init:

1. Look for an existing key directory and **reuse it** if present — the PO's
   canonical directory already exists and must never be silently replaced.
2. Only if none exists, offer to create one.
3. Write the trust anchor as part of the same transaction that seeds the gate
   files, so the anchor and the gate that requires it are never out of step.
4. If the human declines, record the anchor as absent and report that
   human-override routes are unavailable — as a named state, not as a
   circularity discovered later.

## Acceptance criteria

- A fresh repository ends init with either a working anchor or a recorded,
  reported absence.
- An existing key directory is detected and reused, never overwritten.
- The first human override in a fresh project does not require an out-of-session
  manual edit.
