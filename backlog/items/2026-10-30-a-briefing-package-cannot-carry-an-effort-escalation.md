---
schema: pipeline.backlog-item.v1
id: pipeline.a-briefing-package-cannot-carry-an-effort-escalation
type: defect
owner: pipeline
status: open
created: 2026-10-30
sprint: alfred
priority: P2
release: 0.7.0
source: "Elephant observation 2026-10-30 while packaging candidate 8 slices"
done_when: manual
---

# A briefing package cannot carry an effort escalation

## Evidence

`dispatch-briefing.mjs` accepts `--effort-escalation` only as a flag of the direct binding route (flag map near line
143, check near line 833). The package route `build --package <file>` (`buildDispatchBriefing`, near line 1042)
passes `item`, `agentType`, `modelId`, `check`, `paths`, `spec`, `criterion`, `reconNote` and `runner` to
`generateDispatchBinding`, but never `effortEscalation`. A package for a slice that needs the deep tier above the
configured route effort therefore cannot record the model-policy act that authorises it. The Elephant then has to choose
between the implementor tier and a hand-built binding, and the generator forbids the hand-built binding.

## Wanted

- The package schema admits an optional `effortEscalation` with the same closed values as the flag
  (`EFFORT_ESCALATION_ACTS`), and `buildDispatchBriefing` passes it to the binding.
- An unknown value is refused with the same code and repair as the flag (`DBG-EFFORT-ESCALATION-UNKNOWN`).
- The resulting binding records the escalated effort and the `DBG-EFFORT-ESCALATION` warning exactly as the flag route
  does.
- Tests: a package with and without the key, an unknown value, and parity with the flag route for the same inputs.
