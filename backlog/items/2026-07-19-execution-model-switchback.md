---
schema: "pipeline.backlog-item.v1"
id: "pipeline.execution-model-switchback"
type: "workflow-improvement"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.execution-model-switchback

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.execution-model-switchback` — "open, partial";
desired/actual reconciliation and post-compact requests exist
(`lib/main-session-route.mjs`, `lib/interaction-continuity.mjs`,
post-compact hook + tests), but "real main-session attestation remains
missing." Remaining sanctioned gate: "candidate-bound host attestation
and drift/return-request evidence."

**Decision:** accepted as a real, still-open gap — **not dispatched
this pass.** "Real main-session attestation" needs an actual
observable mechanism for confirming a session genuinely returned to
its main/desired execution route (not merely a code-reachability
proof), which is design latitude a briefing this session did not have
time to scope precisely enough to hand to a goldfish without risking a
vague, re-doable dispatch. Queued as a design-then-implement package,
same tier as `2026-07-19-codex-plugin-validator-host-parity.md`'s
host-parity design gap. **Assignment:** pipeline, unassigned pending a concrete
attestation-mechanism design decision. **Date:** 2026-08-18
