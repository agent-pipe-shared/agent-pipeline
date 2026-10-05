---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-records-land-under-specs-evidence
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed live, Alfred session, 2026-10-05."
sprint: alfred
done_when: manual
---

# Dispatch records land under specs/.../evidence instead of the repository-root evidence/

## Description

Two read-only dispatches were briefed to write
`evidence/dispatch-record-<ID>.json`. Both wrote it under
`specs/sprint-alfred-epic/evidence/` instead. The relative path was ambiguous
next to a result file in that directory.

## Triggering situation

Two read-only dispatches in the 2026-10-05 session.

## Affected artifact

`templates/prompts/goldfish-task.md` (dispatch-record path wording) and the
dispatch-record writer/guard.

## Proposal

State the dispatch-record path in the template as the repository-root
`evidence/`, and make the guard or record writer reject a dispatch record
outside it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
