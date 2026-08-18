---
schema: "pipeline.backlog-item.v1"
id: "pipeline.po-gate-worktree-authority"
type: "defect"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.po-gate-worktree-authority

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.po-gate-worktree-authority` — "open,
delivered-but-unproven"; primary readback and linked-worktree/
cardinality/digest negative cases exist
(`po-gate-authority.mjs`/`po-gate-profile-publisher.mjs` +
`plugins/pipeline-core/lib/po-gate-authority.test.mjs`). Remaining
sanctioned gate: "complete candidate-bound AC disposition and
dedicated transition."

**Decision:** accepted, ownership moved to Nova/pipeline. Dispatched
against the current local candidate — "candidate-bound" here means the
closure evidence names a real candidate commit, not that it must wait
for the final 0.6.0 freeze; the AC-mapping work itself is
candidate-independent. **Assignment:** `NVA-POGATEAUTH-1`
(goldfish-implementor), dispatched 2026-08-18. **Date:** 2026-08-18
