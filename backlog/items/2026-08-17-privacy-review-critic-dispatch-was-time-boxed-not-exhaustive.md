---
schema: pipeline.backlog-item.v1
id: pipeline.privacy-review-critic-dispatch-was-time-boxed-not-exhaustive
type: workflow-improvement
owner: pipeline
status: deferred
created: 2026-08-17
source: "PHX-WP-HAC11-WINACL's own privacy-review Critic dispatch, self-disclosed"
---

# privacy-review Critic dispatch was bounded-cost, not an exhaustive pass — schedule a full sweep before the next real push

## Description

Per PO instruction ("das muss per dispatch laufen wie vorgeschlagen sonst zu
aufwendig" — an exhaustive in-session privacy review was judged too
expensive), the privacy-review Critic dispatch this session was deliberately
time-boxed: one dispatch, targeting `design/privacy-review.md`'s own §1-5
sign-off procedure against the integrated candidate. It found and fixed one
real, meaningful cross-platform gap (`governance-event-store.mjs`'s Windows
DACL no-op, PHX-WP-HAC11-WINACL, commit `9a20da73`). It also explicitly
disclosed itself as non-exhaustive: many §1 rows, §2 boundaries, §3 rules,
and §4 fixtures were "not reached" within the time-box.

## Decision

Accept the current single-fix state as sufficient for THIS session's scope —
the dispatch delivered real, verified value at bounded cost exactly as the PO
asked, and the design-level `design/privacy-review.md` sign-off (which
predates the integrated candidate) still stands as the baseline. Do not
force a broader sweep same-session.

## Proposal

A full, exhaustive privacy-review Critic pass (covering every §1 row, §2
boundary, §3 rule, and §4 fixture, not just the sample this dispatch reached)
before the next real push of this branch to `origin/sprint_phoenix` — pushing
is the point external exposure actually changes, matching this epic's own
gate (`Exact branch push and readback`) and the pattern already used for
L-AC-01 (a named concrete trigger, not an open-ended "later").

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** bounded-cost dispatch already delivered real value this
  session per explicit PO instruction; a full exhaustive sweep is real
  additional cost with no urgency before an actual push happens.
- **Assignment (if accepted):** the next push-approval ceremony for this
  branch (`docs/push-release-flow.md`); owner `pipeline`, review trigger =
  "before `sprint_phoenix` is next pushed to `origin`", no calendar expiry.
- **Date:** 2026-08-17
