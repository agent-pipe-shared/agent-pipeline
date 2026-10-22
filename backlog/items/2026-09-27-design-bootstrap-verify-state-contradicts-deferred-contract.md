---
schema: pipeline.backlog-item.v1
id: pipeline.design-bootstrap-verify-state-contradicts-deferred-contract
type: workflow-improvement
owner: pipeline
status: open
created: 2026-09-27
source: "Codex/WSL greenfield review B8; current consumer project/pipeline.json has verify: null while onboarding guidance intentionally defers the real command."
sprint: none
done_when: manual
---

# Design bootstrap needs an explicit state for a deferred Verify contract

## Description

A fresh project can be ready for design while its real Verify command remains
unknown. The 2026-09-27 consumer calibration has `verify: null`, and current
onboarding guidance intentionally waits until the approved design-to-
implementation handover to choose the command. The report describes this as
a bootstrap contradiction. The actual bootstrap result's Verify wording has
not yet been captured here, so this is a workflow contract review rather
than a claim that the gate falsely passed.

## Triggering situation

The Codex/WSL Feature greenfield session before any game code or tests exist.

## Affected artifact

`pipeline-start` preflight, project calibration, onboarding Driver guidance
and the handover from design to implementation.

## Proposal

Define a typed `verify-deferred-until-implementation` design state or require
a real Verify command earlier. Keep implementation and release gates closed
until a real command is configured and run. Report the design-stage state
without a misleading general PASS.

## Acceptance

- A fresh test-less project receives an unambiguous design-stage readiness
  result with `verify: null`, distinct from a passing Verify result.
- Implementation authority and release Verify reject the deferred state.
- A real command can be supplied once and yields an exact subsequent readback
  without repeating unrelated onboarding questions.

## Triage

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **PO-DECISION** (decided: D124) — Decide whether the newer baseline-implementation policy replaces A2 (implementation authority rejects the deferred Verify state)
  Question: does the newer baseline-implementation policy supersede contract A2, i.e. is a typed verify-deferred design state (verify: null) still the intended design-stage result, with implementation authority and release Verify rejecting it?
