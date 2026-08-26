---
schema: pipeline.backlog-item.v1
id: pipeline.po-authority-rebind-plan-checks-for-the-wrong-plan-approval-schema-version
type: defect
owner: pipeline
status: closed
created: 2026-08-19
closed_at: "2026-08-19"
closure_repository: "self"
closure_commit: "2dd82be31765992217e6a3eecab4aab38d2cc49b"
closure_evidence: "backlog/items/2026-08-19-po-authority-rebind-plan-checks-for-the-wrong-plan-approval-schema-version.md"
source: "Found live while recovering from a real GUARD-LIFECYCLE-NOT-READY session-wide incident on 2026-08-19 (spec.md/PRD authority drift caused by an ADR-0047 reference fix); see backlog/items/2026-08-09-adr-0047-renumber-left-live-references-behind.md's 2026-08-19 closing triage for the full recovery record."
---

# `po-authority-rebind-plan` can never succeed on this repository: it checks for `pipeline.plan-approval.v2`, but this repo's live state uses `v4`

## Description

`plugins/pipeline-core/scripts/pipeline-state.mjs`'s `validRebindApproval()`
(around line 4723) requires `approval.schema !== "pipeline.plan-approval.v2"`
to fail the check — i.e. it only ever accepts a v2-schema `planApproval`
object. `project/pipeline-state.json`'s live `planApproval.schema` is
`"pipeline.plan-approval.v4"`. The check therefore ALWAYS returns `null`
(`oldAuthority === null`) for this repository's actual state, which makes
`buildPoAuthorityRebindPlan()` ALWAYS fail with `PO-REBIND-APPROVAL`, no
matter what else is true — regardless of whether the PRD/Spec authority
actually needs repair, regardless of profile validity, regardless of any
hash reconciliation. Confirmed live: even after the PRD/Spec authority was
fully and correctly reconciled by hand (matching every field
`validatePoGateAuthorityForRepository` itself would compute),
`po-authority-rebind-plan` still refused with `PO-REBIND-APPROVAL`.

This is the mechanism `guard-lifecycle-ready.mjs`'s own `nextAction` names as
the sanctioned repair path when session readiness is `partial` due to a
PRD/Spec authority mismatch (`po_authority_rebind_unavailable` diagnostic,
`isExactPoAuthorityRebindPlannerRecovery` in `guard-lifecycle-ready.mjs`
narrowly admits exactly this one command while partial) — but the mechanism
itself is dead code for any v4-schema repository. The sibling mechanism,
`po-authority-decision-plan/-select/-apply`, IS v4-aware
(`runPoAuthorityDecisionCommand` explicitly branches on
`state.planApproval?.schema === "pipeline.plan-approval.v4"`), but it forces
an `implementation`→`design` phase transition as a side effect
(`nextState.activeFeature.phase = "design"`), which is disproportionate for
a small content-only Spec correction — already flagged as a real cost by the
2026-08-18 PO Decision on the ADR-0047 item this defect was found while
recovering from.

## Triggering situation

Live recovery from a real, session-wide `GUARD-LIFECYCLE-NOT-READY: partial`
incident on 2026-08-19, caused by a one-line Spec content fix (ADR path
`0047`→`0062`) that broke the PRD/Spec hash binding. Four independent
concurrent dispatches were blocked simultaneously. Recovery required several
hours of live investigation (reading `guard-lifecycle-ready.mjs`,
`project-onboarding-v3.mjs`, `po-gate-authority.mjs`, and
`pipeline-state.mjs` directly) because the sanctioned repair command the
guard itself recommends cannot work at all against this repo's schema
version — a fact that had to be discovered by reading the actual comparison
(`"pipeline.plan-approval.v2"` literal) rather than being surfaced by any
error message (`PO-REBIND-APPROVAL` gives no hint that the real cause is a
schema-version literal mismatch, not an actual approval problem).

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs` — `validRebindApproval()`
(~line 4718-4735, the `approvalKeys`/`authorityKeys` exact-shape check and
the `approval.schema !== "pipeline.plan-approval.v2"` literal), and
`buildPoAuthorityRebindPlan()` (~line 4823-4860) which calls it.
`guard-lifecycle-ready.mjs`'s `isExactPoAuthorityRebindPlannerRecovery()`
and its `nextAction` guidance, which point at a command that cannot succeed.

## Proposal

Not designed here — needs a PO decision on approach. Candidates:

1. **Widen `validRebindApproval()` to accept `pipeline.plan-approval.v4`**
   (mirroring how `runPoAuthorityDecisionCommand` already handles both
   versions), reading the same fields from the v4 shape. Makes the guard's
   own recommended repair path actually work, without the design-phase-reopen
   cost `po-authority-decision-plan` carries. This is probably the right fix,
   but needs someone to verify the v4 `planApproval` shape carries every
   field `validRebindApproval`/`buildPoAuthorityRebindPlan` currently reads
   from the v2 shape (it appears to: `poGateAuthority` is present and
   identically shaped in both versions in the one live example checked), and
   needs real test coverage, not just this one live incident as evidence.
2. **Retire `po-authority-rebind-plan` entirely** if `po-authority-decision-plan`
   is meant to be the sole v4-era mechanism, and instead reduce
   `po-authority-decision-plan`'s side effect (make the phase transition
   optional/skippable for a content-only Spec change that doesn't touch
   acceptance criteria or scope) — but that's a bigger design change to a
   mechanism with real safety properties (reopening design forces re-review),
   not a small fix.
3. **At minimum, fix `guard-lifecycle-ready.mjs`'s guidance** so it does not
   point at a command that can never succeed on a v4 repository — even
   without picking 1 or 2, the current state (recommend a dead-end command,
   give a misleading generic error) actively costs recovery time, as this
   incident demonstrates directly.

Whichever candidate is chosen, add a regression test that would have caught
this: `buildPoAuthorityRebindPlan` invoked against a fixture repo whose
`planApproval.schema` is `"pipeline.plan-approval.v4"` and whose PRD/Spec
authority is genuinely drifted and otherwise fully valid — today this must
fail with `PO-REBIND-APPROVAL` for the wrong reason (schema literal, not a
real approval defect), which is itself the bug to fix.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed. Implemented candidate 1 (widen `validRebindApproval()` to
  accept v4, mirroring `validPriorAuthority()`'s own already-working v2/v4
  dual-handling pattern in the same file) — `PHX-WP-REBIND-V4-SCHEMA`, commit
  `2dd82be3`. `buildPoAuthorityRebindPlan` itself needed no change: its own
  downstream v4-branch code was already present and simply dead because this
  function blocked it upstream.
- **Rationale:** Independently re-verified by the Elephant: new v4 regression
  suite 7/7 pass (`pipeline-state-rebind-runner.test.mjs`, both a genuinely
  stale v4 case succeeding and a not-stale v4 case still correctly returning
  `PO-REBIND-NOT-STALE`), and the full pre-existing v2-path suite 46/46 pass
  unchanged (`PIPELINE_STATE_PS53_ONLY=1 node harness/scripts/pipeline-state.test.mjs`).
  Candidate 3 (fix `guard-lifecycle-ready.mjs`'s guidance) is now moot — the
  guidance already points at the command this fix makes actually work.
- **Assignment:** none remaining.
- **Date:** 2026-08-19
