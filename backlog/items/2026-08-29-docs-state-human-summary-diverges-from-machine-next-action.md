---
schema: pipeline.backlog-item.v1
id: pipeline.docs-state-human-summary-diverges-from-machine-next-action
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-29
closure_commit: 0e9019bf
closure_repository: "self"
closure_evidence: plugins/pipeline-core/scripts/check-state-phase-consistency.test.mjs
created: 2026-08-29
sprint: nova
done_when: contains plugins/pipeline-core/scripts/check-state-phase-consistency.mjs pipeline.state-phase-projection-atomicity
source: "Codex/WSL report, cited by scratch/greenfield-triage-2026-08-29.md finding F20, observed during the 2026-08-29 three-runner greenfield test."
---

# `docs/state.md`'s human-readable phase text disagreed with the machine's own next-action

## What happened

`docs/state.md` stated "active in design" in its human-readable status
summary while the machine-tracked next-action (the actual lifecycle-phase
state) had already moved to implementation. This is a projection error: the
human-facing prose and the machine state are two representations of the
same underlying fact, written by different paths, and nothing kept them in
sync when the phase actually changed.

## Where it is

Checked the two release/state consistency checkers that exist in this
repository:

- `plugins/pipeline-core/scripts/check-release-state-consistency.mjs`
  (`checkReleaseStateConsistency`) compares `docs/release-state.json`'s
  version/tag/commit/tree fields against a fixed marker string it expects to
  find verbatim in `docs/state.md`. This checks a *different* fact (release
  publication identity), not the design/implementation phase text — it does
  not cover this finding.
- `plugins/pipeline-core/scripts/check-state-numeric-claims.mjs` checks
  numeric claims in `docs/state.md` prose against actual counts (e.g.
  backlog counts) — also a different fact, not phase/next-action text.

**No existing check was found that compares `docs/state.md`'s own
human-readable phase/status prose against the pipeline's machine-tracked
lifecycle phase or next-action.** This is confirmed absent, not merely
unexamined — both files that plausibly could have covered it were read and
neither does.

## Proposal

Following the precedent `check-release-state-consistency.mjs` already
establishes (a machine-computed fact vs. a fixed marker string expected
verbatim in `docs/state.md`), add an equivalent check for lifecycle phase:
whatever produces the machine's own "current phase"/"next action" value
(likely `pipeline-state.mjs`'s own lifecycle state, given `submit-plan`/
`approve-plan`/phase-transition handling lives there) should also emit a
fixed, checkable marker, and a new or extended checker should assert
`docs/state.md`'s human-readable phase line matches it — the same
atomicity discipline the release-state checker already applies to release
identity. Add a marker `pipeline.state-phase-projection-atomicity` at the
point this lands.

## Acceptance

- A check exists that fails when `docs/state.md`'s stated phase/next-action
  text disagrees with the machine's own current lifecycle phase.
- The check passes when they agree, including immediately after a real
  phase transition (design → implementation) — proving the two are written
  atomically or the check catches a lag, rather than merely matching at one
  point in time and drifting silently afterward.
- A regression test reproduces the exact class of drift observed here (state
  text says "design", machine phase says "implementation") and asserts the
  new check reports it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted
- **Rationale:** Directly reported by Codex during a live run, and confirmed
  by this dispatch that no existing checker in this repository covers this
  specific fact — an actual, unguarded gap, not a duplicate of an existing
  check.
- **Assignment:** `sprint: nova`; blocks the 0.6.0 candidate — a PO reading
  `docs/state.md` to understand where a project stands is reading a document
  that can silently lie about the phase.
- **Date:** 2026-08-29

## Closure, 2026-08-29 (found already satisfied — dispatch NVA-R31-STATEPHASEDRIFT, commits `5ac1a658`/`0e9019bf`)

This item's exact fix was already landed earlier the same session under a different dispatch
name, targeting `docs/state.md`'s live phase-drift problem directly rather than this item text
(the two were not cross-referenced at dispatch time). `pipeline-state.mjs` gained
`statePhaseProjectionMarker()`/`upsertStatePhaseMarkerLine()`/`syncStatePhaseMarker()`, wired
into `syncNextActionDocs()` so the marker (`**Lifecycle phase:** feature \`<id>\` · phase
\`<phase>\``) is written atomically with every phase-changing mutation. A new checker,
`plugins/pipeline-core/scripts/check-state-phase-consistency.mjs` (mirroring
`check-release-state-consistency.mjs`'s pattern, marker `pipeline.state-phase-projection-
atomicity` embedded), satisfies all three of this item's own Acceptance criteria directly —
independently re-verified just now: `node --test
plugins/pipeline-core/scripts/check-state-phase-consistency.test.mjs` → 3/3 pass, covering
exactly the drift class reported ("design" text vs "implementation" machine phase reported
blocked), the agreeing case reported consistent, and atomicity through a real
design→implementation transition via `pipeline-state.mjs`. `done_when` repointed from the
originally-guessed file path to the real one.
