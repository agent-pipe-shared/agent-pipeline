---
type: workflow-improvement
status: new
created: 2026-07-20
owner: Pipeline Elephant
due: 2026-07-27
expires: 2026-08-03
source: Public V3 Foundation stabilization close retro: an independent Critic run was discarded after an out-of-band coordinator status message reached its context
---

# Keep independent Critic contexts isolated from coordinator status traffic

## Description

An independent Critic review loses its fresh-context property if coordinator
status traffic reaches the active reviewer. The correct response is to discard
that review rather than treating its output as independent, but the avoidable
restart adds latency and review cost.

## Triggering situation

During the Public V3 Foundation stabilization close on 2026-07-20, one Critic
run was discarded after a status message reached it. A fresh path-only review
was then used for the actual findings.

## Affected artifact

The Critic dispatch and monitoring procedure, including the path-only briefing
contract and the coordinator's agent-status workflow.

## Proposal

Make active Critic monitoring read-only and out-of-band: use agent-status
observation only while a Critic is running, and reserve follow-up messages for
after it has completed or been explicitly abandoned. Add a deterministic
dispatch checklist assertion that a Critic receives paths and references only,
with no coordinator prose after launch.

## Ownership and expiry

The next Pipeline Elephant owns triage and an accepted implementation package.
The triage due date is **2026-07-27**. If no decision is recorded by
**2026-08-03**, this item expires and must be renewed with current evidence
rather than silently retained as an active commitment.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
