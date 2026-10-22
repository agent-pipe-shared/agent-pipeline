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

### Blocker analysis 2026-10-22

Read-only survey of the open clauses that the delivery remeasure assigned to native-host, verify-wsl, po-decision or po-signature (evidence: `specs/sprint-alfred-epic/evidence/blocker-analysis-2026-10-22/`). Status key: LINUX-RUN and WINDOWS-INTEROP-RUN are runs an agent can do from the WSL host; HOST-SESSION-NEEDED, PO-DECISION and PO-SIGNATURE are not agent work.

- **LINUX-RUN** — The landed-creation cases (OWN-5, OWN-6) skip on a non-Linux host; run them on native Windows
  A skip on non-Linux means a native Windows run would only skip again; WSL is Linux, so run the owning suite here with node scratch/run-in.mjs and confirm OWN-5/OWN-6 execute and pass (0 skip). Not verified: I did not read the test to confirm the skip condition; if the cases need a real win32 implementation, reclassify as WINDOWS-INTEROP-RUN.
