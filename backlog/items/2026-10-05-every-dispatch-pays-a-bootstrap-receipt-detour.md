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

## Findings 2026-10-05 (BRCPT investigation, read-only)

- The receipt is not written by `pipeline-start-preflight.mjs`. The writer is
  `recordBootstrapPreflightReceipt` in `hooks/guard-lifecycle-ready.mjs` (~6155-6182, not
  exported). It runs as a PreToolUse side effect when a subagent's Bash command is the
  sanctioned preflight invocation (`isSanctionedStartPreflightInvocation`, exported ~5474).
- Schema `pipeline.bootstrap-receipt.v1` `{schema, agentId, agentType, observedAt}` at
  `<git-common-dir>/agent-pipeline/bootstrap-receipt/<agentId>.json` (dir mode 0o700). Binding
  is `agentId` + `agentType` only, both available to a SubagentStart hook per the host contract
  (not verified live). Reader `evaluateBootstrapReceiptGate` (~6207-6259, not exported) checks
  existence and JSON parse only. `hooks/hooks.json` has no `SubagentStart` entry.
- Design tension: the guard docstring (~6142-6146) and `skills/pipeline-start/SKILL.md` frame
  the receipt as proof that the agent's own process ran the preflight. A receipt recorded at
  SubagentStart changes that meaning, so this needs a PO decision.
- Options: (A) a SubagentStart hook drives the exported `evaluateLifecycleReadyGuard` with a
  synthetic preflight Bash payload (no format duplication; couples to the frozen guard's input
  shape; same semantic weakening). (B) Export the writer in the signed guard package and import
  it from a new SubagentStart hook (protected edit + `hooks.json` wiring, TP-4). (C) Briefing
  step 0 runs the preflight (no code; still one call, no refusal). Interim: the Elephant's
  briefings use C from 2026-10-05 23:40.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
