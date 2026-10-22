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
due: 2026-11-04
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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **WINDOWS-INTEROP-RUN** — A native Windows run of the win32 cases (CRHS-INPUT measurement and the typed skip of RC12C001) is missing
  Run plugins/pipeline-core/lib/design-workflow-package-v2.test.mjs as one file with Windows node via cmd.exe on a /mnt/d clone; closes when RC12C001 reports the typed host-limitation skip and the measured CRHS-INPUT field is recorded. Single file, expected minutes.
- **PO-DECISION** (decided: D126) — Decide whether the typed host-limitation skip on Windows resolves the item or the host store must work on Windows
  Question: is a typed, measured host-limitation skip of RC12C001 on Windows acceptable, or must createCodexDesignReadinessHostStore work on native Windows?
