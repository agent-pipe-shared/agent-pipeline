---
schema: pipeline.backlog-item.v1
id: pipeline.projection-drift-fault-after-design-implementation-transition-forces-restart
type: defect
owner: pipeline
status: open
created: 2026-08-29
sprint: nova
done_when: manual
source: "Codex/WSL report, delivered inline in chat by the PO, plus the PO's own observations naming the design→implementation handover as the likely driver defect, during the 2026-08-29 three-runner greenfield test."
---

# A projection-drift readiness fault fires immediately after the design→implementation phase transition, requiring a runtime restart

## What happened

Codex hit a `projection-drift` readiness status twice, both times immediately
after the phase transition from design to implementation, and both times the
only recovery was a runtime restart. The PO independently names the
design→implementation handover as the likely driver defect. This is not a
happy path — a normal, successful phase transition should not routinely land
the session in a state that requires restarting.

## Where it is

`projection-drift` is a real, named status in this repository's readiness
machinery: `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`, in
`PROJECT_ONBOARDING_CONTROLLING_NON_READY_STATUSES` (line 30, among ~24 other
non-ready statuses including `restart-required` itself). Its presence in that
array means the gate treats it as a controlling non-ready state — one that
blocks a mutating entrypoint the same way `restart-required` does.

**What I could NOT locate in this dispatch's budget:** the actual function in
`plugins/pipeline-core/lib/project-onboarding-v3.mjs` (or a related
observation module) that COMPUTES `projection-drift` — i.e., what comparison
or staleness check produces this specific status, and specifically whether
its computation is triggered by, or coupled to, the design→implementation
phase-transition code path the PO names as the likely driver. This item
records the status's existence and its treatment as a restart-requiring
non-ready state, confirmed in code; it does NOT confirm the PO's causal
hypothesis about the phase transition being the trigger — that connection is
Codex's/the PO's own observation, not independently re-derived here, and is
exactly the case the triage's "What this triage does NOT claim" section
flags: this rests on a runner's own report, not a controlled reproduction in
this repository.

## Proposal

1. A future session (or the PO) should trace `projection-drift`'s actual
   producer in `project-onboarding-v3.mjs` and confirm or refute whether it is
   coupled to the design→implementation transition specifically.
2. If confirmed: whatever comparison flags `projection-drift` immediately after
   a transition that the transition itself just performed should either (a)
   not fire on data the transition just wrote (a staleness check racing its
   own write), or (b) have a narrower, non-restart recovery than a full
   process restart — the same complaint raised independently in F09 (a pure
   manifest/language repair forcing a full restart) suggests `restart-required`
   is over-used as the default remedy for readiness faults that could be
   resolved by re-reading current state instead.

## Acceptance

- A controlled reproduction exists in this repository: perform an actual
  design→implementation phase transition (via the real code path, not a
  hand-constructed state fixture) and observe whether `projection-drift`
  fires. This is the missing piece the triage explicitly calls out — Codex's
  report is the only evidence today.
- Once reproduced, the actual producing function/comparison is named with a
  file/line reference, replacing this item's honest "could not locate" note.
- If the causal link to the phase transition is confirmed, a fix is proposed
  and tested that either prevents the false trigger or narrows the recovery
  below "restart the whole runtime."
- If the causal link is NOT confirmed (the PO's hypothesis does not hold up
  under reproduction), this item is updated to say so explicitly rather than
  carried forward on an unverified premise.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Hit twice by one runner in the same run, with the PO's own
  independent observation pointing at the same transition — two-source
  corroboration even without a controlled repro in this repository. `manual`
  `done_when` because the mechanical work this item calls for (tracing the
  actual producer function) has not happened yet in this dispatch and the
  falsifiable predicate depends on that trace's outcome.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate per the triage's L
  group. Independent of the F05/F06/F07 chain; may share a root cause with F09
  (restart over-used as the default readiness remedy) — worth checking both
  together.
- **Date:** 2026-08-29
