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

### Dispatch result, 2026-08-18 — clause 1 proven closed; clause 2 stopped clean on a real design gap

`NVA-T1GOVPREFLIGHT-1` mapped the AC's two clauses. **Clause 1**
("packets include governance paths") is fully proven:
`critic-packet-governance.mjs`'s `deriveCriticPacketGovernance`/
`buildPacket` derives and fails closed on governance paths;
`critic-packet-preflight.mjs` embeds the result into every packet and
re-validates it before every claim/result/consume; covered end-to-end
by `CPG01/CPG02/CPG05/CPG06` and `CPP01`. All three suites green
(7/7, 58/58, 6/6) before any change — no code was touched.

**Clause 2** ("an honest gate ETA or `unknown`") correctly triggered a
stop rather than a guess: the three named T1 modules and their tests
have zero ETA/gate vocabulary, and the packet schema
(`PACKET_SCHEMA`) has no ETA-shaped field to omit or fabricate — there
is nothing to fail closed on. The "honest ETA or typed-unknown"
PATTERN this AC describes does exist elsewhere
(`lib/continuity-status.mjs`'s `gateEta`/`sourcedEta()`/
`unknownEta()`), but that module is a different subsystem (continuity/
resume status), out of this dispatch's scope. Genuinely unclear
without a design ruling: should the T1 packet schema gain a new
`gateEta` field sourced from `continuity-status.mjs`, or is this AC's
"gate ETA" wording stale relative to the current T1 packet
architecture?

**Status stays `in_progress`, not closed.** Needs a design decision
before further dispatch: either specify the `gateEta` wiring point (T1
packet schema ← `continuity-status.mjs`) or formally reword/retire the
AC's second clause. Queued, unassigned.
