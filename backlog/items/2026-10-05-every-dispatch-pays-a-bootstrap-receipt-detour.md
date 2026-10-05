---
schema: pipeline.backlog-item.v1
id: pipeline.every-dispatch-pays-a-bootstrap-receipt-detour
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Live observation, Agent-Pipeline Claude/Windows session 2026-10-05: SST2, QP5-PREP and NULSWEEP2 dispatches."
sprint: alfred
done_when: manual
---

# Every dispatch pays a bootstrap-receipt detour

## Description

Each dispatched subagent's first Write is refused with `GUARD-BOOTSTRAP-RECEIPT-MISSING`
until it reads files and runs `pipeline-start-preflight.mjs`. That costs 2-3 tool calls,
5-15 % of a 15-40-call budget (observed in SST2, QP5-PREP and NULSWEEP2, 2026-10-05).

## Acceptance

- The receipt is recorded without agent cost (for example by the SubagentStart hook), or
  the template's step 0 runs the preflight.
- A regression test shows the first Write of a freshly started dispatch is admitted.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
