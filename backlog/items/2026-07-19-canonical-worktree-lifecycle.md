---
schema: "pipeline.backlog-item.v1"
id: "pipeline.canonical-worktree-lifecycle"
type: "defect"
owner: "pipeline"
status: "closed"
created: "2026-07-19"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "5a7862e98ba83a33e31c030b2768bffa0a051dd3"
closure_evidence: "plugins/pipeline-core/lib/worktree-lifecycle.test.mjs"
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

### Dispatch result, 2026-08-18 — one real gap found and closed: post-commit cleanliness never proven against an actual commit

Full and light close profiles were already covered by the existing
`D0-01`..`D0-08` suite. The real gap: every prior dirty-worktree check
reached its clean state by deleting an untracked file — none proved
the close profile against a session that actually COMMITS shipped work
first. Closed with a new test, `D0-09` (`worktree-lifecycle.test.mjs`):
commits a real deliverable, registers/finalizes a scratch resource,
confirms hygiene flags only the undrained manifest (not the clean git
state), runs cleanup, confirms the committed deliverable stays
byte-identical and the worktree ends hygiene-clean. The dispatch's own
session ended after staging the file but before commit/report; the
Elephant independently re-ran the suite (34/34 pass, exit 0) and
committed on its behalf. Commit `5a7862e9`. Closed.
