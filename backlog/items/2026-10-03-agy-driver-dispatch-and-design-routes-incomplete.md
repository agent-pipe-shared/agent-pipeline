---
schema: pipeline.backlog-item.v1
id: pipeline.agy-driver-dispatch-and-design-routes-incomplete
type: defect
owner: pipeline
status: open
created: 2026-10-03
source: "PO observation after the 0.7.0 three-runner greenfield tests, 2026-10-03 (Antigravity test repo docs/pipeline-analyse-greenfield.md)."
sprint: alfred
done_when: manual
---

# Antigravity: driver neglects AGY, dispatches unclean, design cannot complete

## Description

PO observations from the Antigravity greenfield run:

- The onboarding/lifecycle driver does not handle Antigravity sufficiently;
  dispatches did not run cleanly.
- The runner could not produce the design at all, because elementary paths for
  the Critic, the Advisor and the build check (Verify) are missing on AGY.

Findings from the Antigravity analysis (`0.7.0+antigravity.20261003105506.1bd1d7bf`).
Each one must be verified against the source before it is fixed:

- **Befund 2, subagent bootstrap deadlock:** native subagents (`invoke_subagent`)
  inherit `session-<id>/requires-bootstrap.pending`. Every CLI tool call then fails
  with "Mandatory Session Bootstrap" (`hooks/antigravity-pretool-guard.mjs:505-514`).
  Both dispatched subagents were paralysed.
- **Befund 3, stale bootstrap lock after resume:** `armAntigravityBootstrapSession`
  returns `already-armed` without refreshing the lock's mtime, while the preflight
  requires an mtime within 30 minutes
  (`scripts/pipeline-start-preflight.mjs:422`). After a 2 h pause the PO had to
  `touch` the lock manually.
- **Befund 4, mandatory roles unavailable:** profile `feature` requires
  `readiness` and `critic_normal`, but onboarding generates both as
  `unavailable` for Antigravity. `runner-design-readiness-bootstrap.mjs:287`
  stops with `DESIGN-READINESS-ROUTE-UNAVAILABLE`.
- **Befund 5:** a signed override of the routes was undone by the registry
  projection (see `2026-10-03-signature-ceremony-requires-operator-work-and-breaks.md`).
- **Befund 6, scaffold commit circularity:** `resolveV3DutyRoute` reads
  `HEAD:pipeline.user.yaml`, while the draft gate refuses committing that file.
  The PO broke the deadlock with `git commit --no-verify`. See
  `2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes.md`.
- **Befund 7:** trailer `Dispatch: design (elephant)` documented but rejected (see
  `2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard.md`).

## Acceptance

- The AGY runner completes the same greenfield happy path as Claude and Codex
  (`2026-10-03-three-runner-happy-path-with-two-po-approvals.md`).
- Critic, Advisor and Verify routes exist for AGY or degrade through the
  recorded self-dispatch fallback
  (`2026-10-03-role-route-preflight-with-self-dispatch-fallback.md`).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
