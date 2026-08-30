---
schema: pipeline.backlog-item.v1
id: pipeline.codex-worker-dispatch-fails-session-capability-probe-root-does-not
type: defect
owner: pipeline
status: open
created: 2026-08-30
sprint: nova
tracking: "NOW / Nova A -- PO-raised 2026-08-30 from the Codex/WSL greenfield retrospective; confirmed via code trace to be a genuinely separate defect from the resume-hint enforcement gap and the design-binding gap raised alongside it."
source: "Codex-060-77 greenfield retrospective, section on root/worker capability mismatch. Confirmed live: root runner was session-ready after bootstrap; two dispatched Codex workers (a generic author, an explicit implementor) each got repository-control-path-invalid/session-capability-unavailable and failed closed, no change made."
---

# A dispatched Codex worker fails the session-capability probe that the root runner passes

## What happened

Root and worker Codex sessions have different functional capability in the
same repository. The root runner is session-ready after bootstrap. Two
dispatched Codex workers (a generic author, an explicit implementor) both
failed closed with `repository-control-path-invalid` /
`session-capability-unavailable` and made no change, blocking Codex
dispatch entirely.

## Mechanism, confirmed by code trace

`plugins/pipeline-core/lib/codex-onboarding-capabilities.mjs`:

- `control-path-invalid` fires from `validateLocalRepository()`/
  `gitEntryType()` failing on the worker's own view of the repository root
  (~line 608/619/645), before the session probe even runs.
- `session-capability-unavailable` fires from `sessionProbe()`
  (~line 222-261): the `intent === "session"` check (~line 656-668) writes
  a disposable session-descriptor JSON file into
  `<repository.commonDir>/agent-pipeline/session-descriptors/active/`, then
  immediately retires (deletes) it, verifying the calling session can
  actually create/read/delete files in the shared `.git`-adjacent
  directory. Any throw during that write/read/delete round-trip sets
  `component.status = "session-capability-unavailable"`.

## Not the same as the resume-hint or design-binding gaps

Explicitly checked and ruled out during triage: this fires at
**worker-dispatch time** (spawning a Codex worker session), not at session
start/resume (the resume-hint mandatory-read-duty gap) and not at a
`pipeline-state.mjs` plan-lifecycle transition (the design-binding gap).
No code path overlaps with either.

## Direction

Root cause not yet established -- plausible candidates, unconfirmed: worker
sandbox/workspace isolation not sharing root's `.git` view, a
permissions/timing race on the shared descriptor directory, or a
Codex-specific spawn environment gap. Needs a live reproduction of an
actual Codex worker dispatch to diagnose further -- this cannot be
determined from static code reading alone, and this backlog item
deliberately does not guess a fix without that reproduction.

## Acceptance criteria

- A live-reproduced Codex worker dispatch either passes the session
  probe, or the exact reason it cannot (with the round-trip's real
  failure captured, not just the resulting status code) is established.
- Root and worker sessions converge to the same capability outcome for the
  same repository, or the divergence is a deliberate, documented,
  necessary constraint (not an accidental defect).

## Triage

- **Decision:** accepted, Nova A
- **Rationale:** PO-prioritized 2026-08-30; blocks Codex dispatch entirely,
  a genuine happy-path blocker distinct from the two gaps raised alongside
  it in the same review pass
- **Date:** 2026-08-30
