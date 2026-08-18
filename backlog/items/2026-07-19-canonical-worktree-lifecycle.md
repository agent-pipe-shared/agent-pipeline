---
schema: "pipeline.backlog-item.v1"
id: "pipeline.canonical-worktree-lifecycle"
type: "defect"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.canonical-worktree-lifecycle

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.canonical-worktree-lifecycle` — "open,
delivered-but-unproven"; lifecycle/cleanup and recovery mechanisms
exist (`lib/worktree-lifecycle.{mjs,test.mjs}`, session cleanup tests,
Full Verify registration), but "both close profiles and post-commit
cleanliness are not fully dispositioned." Remaining sanctioned gate:
"prove both close profiles and recovery on the candidate; dedicated
transition."

**Decision:** accepted, ownership moved to Nova/pipeline. Dispatched
against the current local candidate — proving both close profiles is
AC-mapping/evidence work independent of which exact candidate is
current; the evidence gets re-sealed at the final freeze if the
candidate has moved by then, same as this session's own precedent for
other AC-proof work tonight. **Assignment:** `NVA-WTLIFECYCLE-1`
(goldfish-implementor), dispatched 2026-08-18. **Date:** 2026-08-18
