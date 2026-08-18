---
schema: "pipeline.backlog-item.v1"
id: "pipeline.session-keep-awake"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.session-keep-awake

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real and still open, not a stale
tag: `specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.session-keep-awake` carries the PO's own disposition —
"functionally complete, release-pending" — implementation
(`plugins/pipeline-core/lib/session-power*.mjs`,
`scripts/session-power*.mjs`, `session-cleanup*.mjs` + tests) is
complete; the one remaining gate is "bind final-candidate
Verify/Security/independent Critic, then complete the authorized HAW-E
batch and remote readback."

**Decision:** accepted, ownership moved to Nova/pipeline (Sentinel
never returns). **Not dispatched separately** — this gate is, by its
own text, bound to the FINAL release candidate (not any intermediate
local candidate), the same binding Nova A's own Slice A7 candidate
freeze needs. Doing it now against a moving local candidate would need
repeating at the actual freeze. Batched into that step instead of
deferred indefinitely: when Nova A's candidate is frozen for real
(currently blocked only on the PO's own NVA-A8-5 pilot go/no-go), this
item's Verify/Security/Critic binding and HAW-E batch readback happen
as part of that same freeze, not as a separate later action.
**Assignment:** pipeline, tracked against the Nova A candidate-freeze
step. **Date:** 2026-08-18
