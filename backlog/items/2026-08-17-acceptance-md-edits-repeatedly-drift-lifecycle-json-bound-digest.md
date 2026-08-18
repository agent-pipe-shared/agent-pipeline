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

### Implementation finding — 2026-08-18 (three dispatches)

Commit `546967b9` built `validateFeaturePackage`'s `options.autoRebindMutable`
(a mutable-only, tested library capability). Two follow-up dispatches then
found the option is **structurally unsafe to wire into any CLI write path**
(`feature-package-apply`/`feature-package-reconcile`), not merely
unwired-for-now:

- An internal recompute that silently self-heals a mutable-class digest
  cannot distinguish a routine edit from deliberate tampering, and the
  caller's own preview digest (from the read-only, deliberately-unwired
  `feature-package-plan`) never reflects the healed state either way.
- Wiring it into `feature-package-apply` broke `WRc` (a routine drift between
  plan and apply must still be refused) and `WRg` (a manually tampered digest
  must be refused, not silently corrected) — the write path's
  `--plan-sha256` freshness/anti-tamper contract is defeated.
- A reconcile-path probe (immediately reverted after capturing evidence)
  produced 27 further failures across the `RG*` series for the identical
  reason.

**Net effect on this item's scope:** the PO's Option B ("a lightweight,
non-PO-gated auto-rebind path for mutable-class artifacts") is delivered only
as a **library-level, deliberate, out-of-band capability** (commit `836d0ff2`
records the final decision and the reverted CLI-write-path attempt) — not as
transparent self-healing during ordinary `apply`/`reconcile` CLI use, which
this finding shows would silently defeat the exact tamper-detection guarantee
the PO's own decision text flagged as the risk to watch for ("an
insufficiently-scrutinized rebind path could become an unintended ceremony
bypass"). The live drift this item was filed against (`lifecycle.json`
vs. `acceptance.md`) was reconciled once via this library path (commit
`bd79cf58`); a future routine drift needs the same deliberate,
out-of-band invocation — it does not yet self-heal automatically inside the
ordinary PO-facing flow. Whether a routine, non-transparent trigger (e.g. a
dedicated CLI verb an operator or Elephant invokes explicitly, rather than a
silent side effect of `apply`/`reconcile`) should be built is a further,
still-open design question — not resolved by this finding, only newly
informed by it.

- **Status:** stays open — the underlying routine-drift friction this item
  was filed against is only partially closed (a manual/deliberate remedy
  exists; no automatic one does, and the investigation shows an automatic
  one at the CLI write-path level cannot be built safely).
