---
schema: "pipeline.backlog-item.v1"
id: "pipeline.afk-assumption-mode"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
done_when: manual
closed_at: "2026-08-30"
closure_repository: "self"
closure_commit: "64544e404b852c87c24c0fd6424b875bee5742a2"
closure_evidence: "backlog/evidence/2026-08-30-sentinel-retirement-and-nova-a-reverification.md"
---

# Closed — 2026-08-30

The PO retired this stale Sentinel baseline. Sentinel will not be reopened
through historic release-administration work; any renewed need is a new item
with current scope and evidence. See the durable PO decision in the closure
evidence above. This closure does not claim that the historical Sentinel
proposal itself was shipped.

# pipeline.afk-assumption-mode

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.afk-assumption-mode` — "open, delivered-but-unproven";
disabled mode, binding, ledger, locks, review, and transaction paths
exist (`plugins/pipeline-core/lib/afk-{assumption-mode,ledger,review,
transaction-host}.mjs` + tests, `scripts/afk-activation.test.mjs`), but
"the complete registered AC/close chain is absent." Remaining
sanctioned gate: "register all required suites, bind final PO
disposition and candidate evidence, then dedicated close."

**Decision:** accepted, ownership moved to Nova/pipeline, split by the
gate's own two halves. The suite-registration half is
candidate-independent AC-mapping work — queued for its own dispatch
next (not done in this same pass, to keep this session's already
in-flight dispatches — `NVA-CROSSREPOLEDGER-1`, `NVA-T1GOVPREFLIGHT-1`,
`NVA-POGATEAUTH-1` — independently reviewable rather than piling a
fourth guardrail-adjacent change on at once). The "final PO
disposition and candidate evidence" half is release-administration,
bound to the actual Nova A candidate freeze, same as
`2026-07-19-session-keep-awake.md` — batched into that step, not
dispatched separately. **Assignment:** pipeline; suite-registration half queued
as the next dispatch after the three currently in flight land.
**Date:** 2026-08-18

### Progress, 2026-08-19

`NVA-BL-AFK-1` (goldfish-implementor, worktree-isolated) root-caused and
fixed the 8/13 failing tests in `afk-activation.test.mjs` (now 13/13
pass) — a stale test fixture no longer matching a real-filesystem call
`afk-activation.mjs` gained in commit `73cb41c7`; made the call
dependency-injectable, matching the existing pattern. Commit `9f9a1cdc`
(cherry-picked from the dispatch's worktree, commit `6928f5ca`).

Suite registration into `harness/scripts/verify.mjs` was attempted and
correctly denied (TP-3) — not yet landed, queued alongside the other
pending verify.mjs registrations (F1's `state-numeric-claims-tests` live
checker, `evidence-bound-review-retry-economics`) for one combined
signed HGO ceremony rather than three separate ones. Item stays
`in_progress` for that registration plus the release-administration
half above.

### Progress, 2026-08-19 (later) — suite-registration half now landed

The combined TP-3 ceremony this note anticipated landed (commit
`1083229b`, "register the live state-numeric-claims check, afk-activation
and plugin-scoped codex-sandbox-preflight suites") — `afk-activation-tests`
is now live in `harness/scripts/verify.mjs`, confirmed present. PO,
2026-08-19: "register suites + close" — the registration half is done, but
this item's own 2026-08-18 Triage explicitly split the remaining gate into
two independent halves and bound the second (final PO disposition and
candidate evidence) to the actual Nova A candidate freeze, "same as
`2026-07-19-session-keep-awake.md`" — which the PO separately confirmed
this same session stays open, grouped into the final wave. Keeping this
item `in_progress` rather than closing now, to honor that already-recorded
two-half design rather than overriding it based on an instruction that
predates knowing the registration half had separately landed; it closes
alongside `session-keep-awake` at the final candidate freeze.

### Sweep re-check, 2026-08-25 (AGY-SWEEP-afk-assumption-mode)

Reconfirmed live: all 8 on-disk `afk-*.test.mjs` suites are registered in
`harness/scripts/verify.mjs` (exact-match diff, no gap), and the two most
load-bearing suites pass green (`afk-assumption-mode.test.mjs` 29/29,
`afk-activation.test.mjs` 13/13). Both technical halves of this item's own
two-half gate are complete; the only remaining gate is the release-
administration half (final PO disposition + candidate evidence, batched
with `session-keep-awake`), bound to whether the Nova A candidate freeze has
actually occurred — a fact that lives only in `docs/state.md`. Status
unchanged; no code touched this pass.
