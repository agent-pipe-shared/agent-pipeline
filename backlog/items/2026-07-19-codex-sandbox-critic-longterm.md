---
schema: "pipeline.backlog-item.v1"
id: "pipeline.codex-sandbox-critic-longterm"
type: "defect"
owner: "pipeline"
status: "in_progress"
created: "2026-07-19"
source: "specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md"
tracking: "Sentinel recovery baseline; no completion claim."
---

# pipeline.codex-sandbox-critic-longterm

This public baseline record was recovered from the Sentinel PRD. It records scope and status only; it does not claim implementation, verification, or closure.

## Triage, 2026-08-18

Sentinel is a closed sprint; this bare baseline record would otherwise
never be revisited. Confirmed still real:
`specs/2026-07-19-sprint-sentinel-epic/backlog-acceptance-matrix.md`
row `pipeline.codex-sandbox-critic-longterm` — "open, partial";
host/preflight/select/runtime contracts cover the intermediate
(weaker, read-only-asserted) lane already. The remaining sanctioned
gate — "original upstream, shadow, T1, isolation, and PO evidence for
the strong lane" — is the PRD's own documented closure route: the
strong, fully input-confined/network-denied lane was scoped from the
start to close only via its original upstream gate (a durable
selected-sandbox capability, tracked as GitHub Issue #29 in the
project's issue history), which is outside this repository's control.

**Decision:** accepted as a real, still-open gap for the intermediate
lane's own remaining local ACs, but the strong lane's closure route is
genuinely, structurally external — **not dispatchable by any goldfish
task**, same class of blocker as Nova A's own NVA-A8-5 PO-run pilot.
Not conflated with a Nova-owned code gap; documented here so a future
session doesn't re-diagnose it as one. **Assignment:** pipeline for
whatever local-AC remainder the intermediate lane still needs (needs
its own dedicated read to scope, not done this pass); the strong lane
stays externally gated. **Date:** 2026-08-18
