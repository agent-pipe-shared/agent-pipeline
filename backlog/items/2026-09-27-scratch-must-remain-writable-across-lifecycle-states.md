---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-must-remain-writable-across-lifecycle-states
type: requirement
owner: pipeline
status: open
created: 2026-09-27
sprint: alfred
done_when: manual
source: "PO ruling, 2026-09-27: 'scratch muss immer gehen'; live Alfred design/draft write probe and guard-lifecycle-ready.test.mjs session-capability-unavailable fixture."
---

# Keep contained scratch writes available in every lifecycle state

The PO requires the repository's own `scratch/` to remain available for notes,
reports and correction preparation even when the pipeline blocks protected
work. A write in Alfred's current design/draft state succeeded, but
`guard-lifecycle-ready.test.mjs` currently expects a contained scratch write
to be refused under `session-capability-unavailable`. Existing fixes cover
individual intake and restart states; they do not establish an all-state
contract.

## Required behavior

- Admit ordinary `Write` and `Edit` of physically contained `scratch/` files in
  every supported lifecycle and readiness state, including error and recovery
  states. Provide a safe way to create a missing nested scratch directory.
- Preserve symlink/outside-root containment and protection of machine state.
  Do not treat this requirement as permission for arbitrary shell mutation.
- If the host itself denies an admitted scratch write, report that boundary
  honestly and provide a usable host-level route; no silent success claim.

## Acceptance

A state-sweep fixture covers every supported readiness status and the ordinary
scratch write/create lanes. Live readback confirms a blocked session can save
a report without a PO override. Near-miss paths escaping `scratch/` remain
refused. Reconcile the skill's scratch promise with the guard and tests.

## Triage

- **Decision:** pending
- **Assignment:** Alfred release preparation
- **Date:** 2026-09-27
