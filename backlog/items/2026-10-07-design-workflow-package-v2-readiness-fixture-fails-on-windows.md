---
schema: pipeline.backlog-item.v1
id: pipeline.design-workflow-package-v2-readiness-fixture-fails-on-windows
type: defect
owner: pipeline
status: open
created: 2026-10-07
source: "CLOSEOUT-T2 dispatch stop report, evidence/dispatch-record-CLOSEOUT-T2.json"
sprint: alfred
done_when: manual
due: 2026-10-20
---

# The design-workflow package v2 readiness fixture fails on Windows

## Description

The single case RC12C001 of `plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs` exits 1 on a Windows host with
`CRHS-INPUT`, raised in `readinessFixture` → `createCodexDesignReadinessHostStore`. The suite's only valid approval-request
build sits inside that case, so on Windows none of its assertions are exercised.

## Triggering situation

CLOSEOUT-T2, 2026-10-07: baseline run of RC12C001.

## Affected artifact

`plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs` (fixture), possibly the host-store input validation it calls.

## Proposal

Measure the rejected input first (which field `CRHS-INPUT` names), then decide test-fixture vs production defect;
test-first either way. Owner: pipeline; due before the 0.7.0 release candidate.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** Windows is a first-class platform; a case that never runs there is silent coverage loss.
- **Assignment (if accepted):** read-only measurement dispatch, then test-first fix; 0.7.0 candidate.
- **Date:** 2026-10-07
