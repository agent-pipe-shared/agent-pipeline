---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-record-ownership-binds-an-attempted-creation
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Round-1 finding F-3 (minor) of the Alfred guard bundle review, deferred from the signed bundle commit 866be2139; Alfred session 2026-10-05."
sprint: alfred
done_when: manual
---

# Dispatch-record ownership binds an attempted, not a landed, creation

## Description

Round-1 finding F-3 (minor): dispatch-record ownership binds to an attempted
creation, not to one that actually landed. A fix (RC-1a) was withdrawn before
the signed bundle (commit `866be2139`): a worktree-local landed-check broke
RC-1/RC-2 across linked worktrees that share the claim registry (round-2
finding F-NEW-1).

## Proposal

Target round R3, inside the worktree-per-Goldfish identity design: bind
ownership to a landed creation in a way that holds across linked worktrees
sharing the claim registry. Verification: a test in which two linked worktrees
share one claim registry and RC-1/RC-2 still hold.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
