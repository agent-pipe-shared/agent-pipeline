---
schema: pipeline.backlog-item.v1
id: pipeline.acceptance-md-edits-repeatedly-drift-lifecycle-json-bound-digest
type: defect
owner: pipeline
status: open
created: 2026-08-17
source: "this session's own feature-package-topology digest-binding, hit twice"
---

# every acceptance.md edit drifts lifecycle.json's bound digest, needing a PO-signed reconcile

## Description

`specs/sprint-phoenix-epic/lifecycle.json` binds `acceptance.md`'s content by
`sha256` (the artifact's `mutability: "mutable"` class permits edits, but the
manifest's own bound digest does not self-update). Any ordinary edit to
`acceptance.md` — including the routine PO-decision amendments this epic's own
process expects (EPIC-AC-05's `disposed`-state mechanism, criterion
narrowings, deferrals) — leaves the manifest's digest stale. `Full Verify`
then reports `FTP-ARTIFACT-2: digest does not bind file bytes` and 4-5
dependent suites (`artifact-topology-check`, `threat-model-tests`,
`pipeline-state-tests`, `external-reference-adapter-tests`, sometimes
`backlog-ledger-reconciliation-tests`) go red, even though nothing is
actually broken.

## Triggering situation

Hit twice in the same session: once after the R-AC-06 amendment (checkpoint
24, resolved via a PO-signed `feature-package-reconcile`, commit `f40fda0a`),
and again immediately after — this checkpoint's own four PO-decision
amendments (EPIC-AC-05, R-AC-06's second amendment, L-AC-01, PX0-AC-13,
H-AC-11 O-4) re-triggered the identical `FTP-ARTIFACT-2` state. Each
occurrence needs its own full PO-signed reconcile ceremony (a
`createCriticalActionApprovalRequest`, external `sign-intent`, then
`feature-package-reconcile`) — real operator effort for a purely mechanical
digest resync, for an artifact this epic's own process routinely amends.

## Affected artifact

`specs/sprint-phoenix-epic/lifecycle.json` (the manifest binding
`acceptance.md`'s digest), `plugins/pipeline-core/lib/feature-package-topology.mjs`
(`validateFeaturePackage`, the `FTP-ARTIFACT-2` check for `mutable`-class
artifacts).

## Proposal

Either (a) a `mutable`-class artifact like `acceptance.md` should not be
byte-bound in the manifest at all — the `mutability` field already says edits
are expected, so binding its digest and then requiring a signed ceremony
every time it is edited fights the artifact's own declared class; or (b) a
lightweight, non-PO-gated auto-rebind path for `mutable`-class artifacts
specifically (keeping the PO-signed ceremony for `immutable`/`authority`
artifacts, where a digest drift is a real integrity signal, not routine
process).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** discovered and worked around twice this session via the
  existing PO-signed reconcile ceremony (real, functioning, just repetitive);
  not urgent enough to redesign the manifest-binding rule same-session
  alongside unrelated Phoenix acceptance work, and changing which artifact
  classes get byte-bound is itself a design decision with its own review bar.
- **Assignment (if accepted):** before `sprint_phoenix` is next pushed to
  `origin`; owner `pipeline`, no calendar expiry.
- **Date:** 2026-08-17

### PO Decision — 2026-08-18

- **Decision:** Option B — build a lightweight, non-PO-gated auto-rebind path specifically for `mutable`-class artifacts; the PO-signed `feature-package-reconcile` ceremony stays required only for `immutable`/`authority`-class artifacts.
- **Rationale:** PO's direct choice, matching the Elephant's recommendation.
- **Assignment:** Dispatch-ready — real design/implementation work with its own review bar (an insufficiently-scrutinized rebind path could become an unintended ceremony bypass).
- **Date:** 2026-08-18
