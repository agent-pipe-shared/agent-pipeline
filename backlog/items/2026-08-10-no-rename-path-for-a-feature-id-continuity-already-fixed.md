---
schema: pipeline.backlog-item.v1
id: pipeline.no-rename-path-for-a-feature-id-continuity-already-fixed
type: defect
owner: pipeline
status: open
created: 2026-08-10
source: "Claude Code self-report from the 2026-08-10 greenfield test session (exact transcript path redacted here — it is a machine-specific absolute path and must never appear in a committed artifact), point 13 of its final problem list."
---

# Once the continuity subsystem has fixed a feature-id, there is no rename path if that id turns out incompatible with a downstream consumer

## Description

A live test session promoted a feature-id that passed `kickoff promote`'s
validation at the time but was later rejected by `po-human-approval.mjs
authorize-critical`'s stricter shape (the exact bug GF-099, same session,
already fixed for FUTURE promotions). Once the runner discovered the
mismatch, it tried the obvious fix — rename the feature-id in state — and
was refused by a completely separate "continuity" subsystem
(`pipeline.continuity.v0`), which insisted the feature be closed through
"the revision/evidence-bound close gate first," with no rename path. The
only two escapes the runner found were a full close-and-reopen ceremony, or
downgrading the whole project's push-approval mode from `signature` to
`chat` — neither of which fixes the actual problem, and the second
actively weakens an unrelated security posture just to route around a
naming mistake.

## Triggering situation

Reported as part of a longer, structured problem list from a Claude Code
greenfield test's final self-report on 2026-08-10, the same session mined
for several other findings this day (kickoff CLI friction, resume-hint
handling, the feature-id validation-timing bug GF-099 fixed). This specific
point was PO-triaged the same day as "defer — GF-099 already prevents this
from recurring for new projects; do not build a rename mechanism now."

## Affected artifact

The `pipeline.continuity.v0` subsystem (search `lib/onboarding-continuity.mjs`
and `pipeline-state.mjs` for its close-gate logic) — no specific file/line
identified yet, this item is filed from the runner's self-report only, not
from source investigation. Needs its own read-through before scoping a fix.

## Proposal

No fix designed, and explicitly NOT prioritized right now (PO decision,
2026-08-10): GF-099 already stops a NEW project from ever promoting an
incompatible feature-id, which removes the normal way to reach this dead
end going forward. This item stays open for the rarer case (a project whose
feature-id was fixed BEFORE GF-099 existed, or some other future downstream
consumer with a still-different constraint GF-099's fix didn't anticipate).
When picked up, the direction to explore is a narrow, evidence-bound rename
transaction for exactly the "feature-id fails a downstream constraint"
case — not a general-purpose feature-id rename capability, which would be a
much bigger change to `pipeline.continuity.v0`'s invariants than this
narrow recovery needs.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred.
- **Rationale:** GF-099 (commit `8ae0de01`, same day) closes the path that
  creates this situation for any project promoted after that fix landed.
  The residual risk (a pre-existing incompatible feature-id, or a future
  downstream consumer GF-099 didn't anticipate) is real but rare and not
  worth the design/implementation cost of a rename mechanism right now.
- **Assignment:** none — revisit if a live project actually hits this dead
  end again despite GF-099.
- **Date:** 2026-08-10
