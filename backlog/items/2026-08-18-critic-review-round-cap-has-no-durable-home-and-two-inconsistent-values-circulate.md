---
schema: pipeline.backlog-item.v1
id: pipeline.critic-review-round-cap-has-no-durable-home-and-two-inconsistent-values-circulate
type: defect
owner: pipeline
status: open
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, second rotation batch (2026-08-17 continued entries). Finding surfaced by a read-only research fork."
---

# The "Critic review round cap" policy is never codified in any repo artifact, and this session's own history shows two inconsistent values in circulation (one round vs. two)

## Description

`docs/state.md`'s second rotation batch shows the session operating on two
different, mutually inconsistent assumptions about how many Critic review
rounds are allowed before self-verifying a fix instead of re-dispatching:

- Several earlier points assume a **two-round cap** ("round 2 of the
  2-round cap", "per the 2-round cap: if either FAILs, self-verify the
  rework rather than a 3rd dispatch").
- A later point states, as if newly settled and PO-confirmed live: **"one
  Critic round per package, then self-verify — no automatic second
  dispatch even on FAIL."**

Checked `guardrails/`, `CLAUDE.md`, and `docs/operating-model.md` for any
codified round-cap number — no match for "round cap", "Critic round", "one
Critic round", or "two-round" anywhere in those files. The only place
anything like this rule lives is this AI's own personal cross-session
memory (`feedback-cap-critic-review-rounds-at-two.md`), which says "two" —
directly contradicting the later "one round" value this same session
recorded as PO-confirmed. Since memory is not a repo-committed artifact
another agent or a future session can read, and the two numbers disagree,
this is a real, load-bearing policy that currently exists nowhere
authoritative.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s second rotation batch
before that content is archived (ADR-0066 Decision 6/7). The two
inconsistent values were found within the SAME reviewed line range,
confirming this is not merely stale memory vs. current practice but an
actual in-session inconsistency.

## Affected artifact

`docs/operating-model.md` §4 (review system) is the most natural home for
a Critic-round-cap policy; `CLAUDE.md` if it should be a Hard Rule instead.
This AI's own `feedback-cap-critic-review-rounds-at-two` memory file will
need updating once the real, current PO-intended number is confirmed and
written to a repo artifact.

## Proposal

Not yet designed in detail. First step is a PO decision on the actual
intended cap (one round then self-verify, or two rounds then self-verify,
or something else / package-type-dependent), then write that decision into
`docs/operating-model.md` §4 as the authoritative source, and correct the
stale memory file to match.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding; needs a
  PO decision before it can be written down authoritatively.
- **Rationale:** materially affects review cost/thoroughness trade-offs
  session to session; a genuine PO-scope decision, not an Elephant call.
- **Date:** 2026-08-18
