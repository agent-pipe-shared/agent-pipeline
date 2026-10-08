---
schema: pipeline.backlog-item.v1
id: pipeline.git-push-classifier-misses-env-s-and-editor-bang
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "Critic record pr-s1-full.md PR-F1 (shared gaps)"
sprint: alfred
done_when: manual
---

# git push classifier misses env -S and editor bang

## Description

`commandIsGitPush` returns false for `env -S 'git push origin main'` and for `vim -c '!git push origin main'`.
Both are shared gaps named in `pr-s1-full.md` PR-F1.

## Triggering situation

Critic record `pr-s1-full.md` finding PR-F1.

## Affected artifact

`commandIsGitPush` and its tests.

## Proposal

Refuse both forms. Acceptance: both are refused; the pinning tests land first.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** a push can bypass the guard through these wrappers.
- **Assignment (if accepted):** to be assigned.
- **Date:** 2026-10-08
