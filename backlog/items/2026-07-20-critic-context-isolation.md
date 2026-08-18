---
schema: "pipeline.backlog-item.v1"
id: "pipeline.critic-context-isolation"
type: "workflow-improvement"
owner: "pipeline"
status: "closed"
created: "2026-07-20"
closed_at: "2026-08-18"
closure_repository: "self"
closure_commit: "47c6d7fcfafde2823be4111234a8e8482408fcab"
closure_evidence: "plugins/pipeline-core/hooks/guard-dispatch.test.mjs"
source: "Public V3 Foundation stabilization close retro: an independent Critic run was discarded after an out-of-band coordinator status message reached its context"
due: "2026-07-27"
expires: "2026-08-03"
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

- **Renewal (2026-08-18):** expired 2026-08-03, never triaged — found during
  a systematic sweep for the same expired-unread-item pattern this session
  caught repeatedly tonight. Renewed with current evidence.
- **Decision:** accepted, closed. `plugins/pipeline-core/hooks/guard-dispatch.mjs`
  (landed `47c6d7fc`, "feat(guard): preflight subagent dispatches against
  their templates") directly implements this item's Proposal: a
  deterministic, structural checklist assertion that a Critic/Goldfish
  dispatch was built from its template and carries no coordinator prose,
  hunt-list, or steer beyond paths/refs/metadata — observed blocking
  exactly that failure mode live, twice, earlier in this same session. A
  dedicated Critic review (`e4d4fa3f..47c6d7fc`, functional-equivalent-
  read-only) returned **PASS, no findings** — independently traced every
  contamination-detection regex against the real, shipped templates by
  hand, then confirmed the test suite does the same from disk rather than
  a hand-written stand-in (`node --test`: `dispatch-policy.test.mjs`
  12/12, `guard-dispatch.test.mjs` 9/9, both re-run directly).
- **Rationale:** the mechanism was already built, tested, and in active
  daily use — what was missing was purely the triage/closure step, the
  same shape as this session's other renewed-and-closed items tonight.
- **Assignment:** closed, no further work.
- **Date:** 2026-08-18
