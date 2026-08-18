---
schema: "pipeline.backlog-item.v1"
id: "pipeline.codex-plugin-validator-host-parity"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.codex-plugin-validator-host-parity

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.codex-plugin-validator-host-parity` — "open, partial";
local parity classification exists
(`scripts/codex-plugin-validator-parity.{mjs,test.mjs}` + Verify
suite), but "it is not a host/version-bound native-versus-generic A/B
on identical fixtures." Remaining sanctioned gate: "produce native
same-host/version/fixture evidence; `unavailable` is not success."

**Decision:** accepted as a real, still-open gap — **not dispatched
this pass.** Unlike the AC-mapping items dispatched alongside this one
tonight, this gate specifically needs a real native-versus-generic
Codex A/B comparison on identical fixtures, not a proof derived by
reading/exercising already-shipped code — it needs a concrete parity
STRATEGY decided first (what counts as "the same fixture" across the
native and generic ingestion paths, what host/version binding the
evidence records), which is a design call this session did not make.
Queued as the next design-then-implement package after tonight's
in-flight dispatches land. **Assignment:** pipeline, unassigned
pending the parity-strategy design decision. **Date:** 2026-08-18

### Reconfirmed in the 0.6.0 release backlog sweep, 2026-08-18

Re-read in full: the same-day Triage above is a real, specific,
bounded decision made independently of the closed Sentinel sprint
(not a stale carryover from it) — it names the exact remaining gate
(native-vs-generic Codex A/B on identical fixtures, host/version
bound), states plainly why it was not dispatched (the parity-strategy
design call has not been made), and records a concrete assignment.
No re-decision needed this pass. This is real design+implementation
work needing Verify against live fixtures, so it is not attempted
here either. **Status unchanged (`in_progress`, not closed).**
**Date:** 2026-08-18
