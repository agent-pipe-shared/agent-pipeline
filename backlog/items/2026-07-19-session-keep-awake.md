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

## PO decision, 2026-08-19: NVA-A8-5 go/no-go reconfirmed as "go"

The NVA-A8-5 pilot go/no-go this item's own binding cites was already
decided "go" on 2026-08-18 (`backlog/items/2026-07-20-multi-cli-efficiency-pilots.md`'s
own Triage — Option A, authorize both pilots now). The PO reconfirmed
"go" again today when this note's blocking condition was presented back
to them, so there is no outstanding go/no-go decision left. That said,
neither pilot has an actual recorded run yet (status stays `in_progress`
on that item until one lands), and this session's Nova A 0.6.0 candidate
just received a FAIL from its final T1 Critic gate review (see
`docs/state.md`) — so the actual candidate freeze this item is bound to
has still not happened. This item stays `in_progress`, now blocked only
on the real freeze event, not on any further go/no-go input.
