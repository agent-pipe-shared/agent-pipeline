---
schema: "pipeline.backlog-item.v1"
id: "pipeline.t1-governance-path-preflight"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.t1-governance-path-preflight

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real: `specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.t1-governance-path-preflight` — "open, partial";
governance-packet and writer-preflight code exists
(`plugins/pipeline-core/lib/critic-packet-governance.mjs`,
`workflow-writer-preflight.mjs`, `scripts/critic-packet-preflight.mjs`
+ tests) but "path/ETA/tool-setup disposition" is incomplete. Remaining
sanctioned gate: "specify, register, and prove remaining T1 ACs, then
close."

**Decision:** accepted, ownership moved to Nova/pipeline. Dispatched —
this gate is AC-mapping/registration work, not bound to the final
release candidate, so it can run now rather than waiting for the
candidate freeze. **Assignment:** `NVA-T1GOVPREFLIGHT-1`
(goldfish-implementor), dispatched 2026-08-18. **Date:** 2026-08-18
