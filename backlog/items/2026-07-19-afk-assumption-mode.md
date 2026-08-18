---
schema: "pipeline.backlog-item.v1"
id: "pipeline.afk-assumption-mode"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

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
