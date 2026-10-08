---
schema: pipeline.backlog-item.v1
id: pipeline.evidence-artifacts-carry-no-commit-identity
type: workflow-improvement
owner: pipeline
status: open
created: 2026-10-08
source: "Critic records specs/sprint-alfred-epic/evidence/critic-2026-10-07/ (rv-s1s4-full.md RV-F7, fsync-full.md Trajectory, ac34-full.md Trajectory)"
sprint: alfred
done_when: manual
---

# Evidence artifacts carry no commit identity

## Description

`plugins/pipeline-core/scripts/capture-evidence.mjs` writes command, label, exit code and output but no
`git rev-parse HEAD`, tree or dirty flag. A Critic therefore cannot bind a trajectory to a SHA.

## Triggering situation

Critic records `specs/sprint-alfred-epic/evidence/critic-2026-10-07/rv-s1s4-full.md` (RV-F7),
`fsync-full.md` (Trajectory) and `ac34-full.md` (Trajectory) each could not tie the captured evidence to a commit.

## Affected artifact

`plugins/pipeline-core/scripts/capture-evidence.mjs` and its test.

## Proposal

The evidence header records HEAD, tree and a dirty flag, and a test pins it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted.
- **Rationale:** evidence that cannot be bound to a commit cannot be audited.
- **Assignment (if accepted):** to be assigned.
- **Date:** 2026-10-08
