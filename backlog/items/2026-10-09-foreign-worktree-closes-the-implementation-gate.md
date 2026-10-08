---
schema: pipeline.backlog-item.v1
id: pipeline.foreign-worktree-closes-the-implementation-gate
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-09
source: "toil log 2026-10-06-07, row T87"
sprint: alfred
done_when: manual
due: 2026-10-31
---

# A foreign worktree closes the implementation gate

## Description

While one WSL-registered throwaway worktree existed (`.git/worktrees/wt-preflight-564c6a47`, gitdir under `/mnt/`,
invisible to the Windows-side `git worktree list`), the Windows-side implementation gate failed closed for every
dispatch and the Elephant: `DWP2-PHYSICAL-OR-GIT` on every implementation Edit and `node` run, every `specs/` docs
Edit, and every commit (commit-msg hook `GUARD-DEVPLAN-LIFECYCLE`, even for `specs/` docs). It also failed on the
gate's own named diagnosis command (`design-advisory-admission.mjs inspect`, refused as opaque execution).
Onboarding `inspect` then claimed "the approved PRD is immutable and its architecture evidence is invalid" and offered
`reopen-design`: a full design reopen for a transient foreign-worktree condition. The reader's catch-all
(`design-workflow-package-v2.mjs:142`) hides the real exception. Confirmed: the first commit after the worktree was
removed passed unchanged (`40852a076`).

## Triggering situation

Toil row T87 (2026-10-08 late). Cost: whole fan-out blocked for at least 15 minutes; 8 dispatches stopped or partial
(R4-S1c, R5-F4b, R6-F2, R7-3-F1c, HOOKREFRESH-F1, ADR0085-D, TOILRES-D2b, CANDBIND-T3 commit) plus the Elephant
commit; one stray uncommitted line left in `pipeline-state.mjs`.

## Affected artifact

`plugins/pipeline-core/` design-workflow package reader (`design-workflow-package-v2.mjs`), the implementation gate
(`DWP2-PHYSICAL-OR-GIT`), onboarding `inspect` and its `reopen-design` offer.

## Proposal

- The reader keeps the underlying error code (no catch-all collapse).
- A registered worktree outside the native view is a typed environment condition, never "architecture evidence
  invalid".
- The named read-only diagnosis is admitted while the gate is closed.
- `reopen-design` is offered only for a verified content drift, never for an unexplained exception.
- ADR-0085 C2 (legacy re-read without course store/candidate) removes this hot-path read entirely.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
