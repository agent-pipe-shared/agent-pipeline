---
schema: pipeline.backlog-item.v1
id: pipeline.interruption-receipts-adapter-tripwire-reaches-a-json-schema
type: defect
owner: pipeline
status: open
created: 2026-10-17
source: "Sprint Alfred Claude continuation 2026-10-17, triage of interruption-receipts.test.mjs after fixture fix e06c3df08; PO decision 2026-10-17 (backlog, after 0.7.0)."
sprint: alfred
done_when: manual
---

# Interruption-receipts adapter tripwire case reaches a JSON schema through its import graph

## Description

`plugins/pipeline-core/lib/interruption-receipts.test.mjs` has one case that
acts as a tripwire for the receipt adapter. It preloads the adapter's import
graph and asserts that the graph stays within a closed set of modules.

Since the fixture fix in `e06c3df08` the suite is 100 pass, 1 fail, 6 skip on
native Windows. The one red is this tripwire. It was masked before the fix,
because the earlier fixture failure stopped the suite first. The preloaded graph
now reaches a JSON schema file, which is outside the closed set the tripwire
expects.

It is open whether the schema dependency is legitimate, so that the tripwire's
allowed set must grow, or whether the adapter should not load the schema at
all. That is a design question, not a mechanical fix.

## Proposal

1. Find which import edge first reaches the schema and since which commit.
2. Decide whether the adapter may depend on the schema.
3. Either extend the tripwire's allowed set with a stated reason, or cut the
   edge so that the adapter graph stays schema-free. Never weaken the tripwire
   without a stated reason.

## Evidence

- `specs/sprint-alfred-epic/evidence/windows-verify-sample-20261017.md`,
  triage table, row interruption-receipts.
