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

- **Decision:** accepted; template wording plus a refusal for a misplaced record.
- **Rationale:** RECPATH-d (`e8fb0729a`, `specs/sprint-alfred-epic/evidence/night-2026-10-05/dispatch-record-path.md`): the writer and readers use root `evidence/` only, but a direct Write of `dispatch-record-*.json` elsewhere is admitted (`lib/guard/dispatch-record-lane.mjs` returns null for a non-root path, mirrored in the live monolith `hooks/guard-lifecycle-ready.mjs`), so a misplaced record escapes ownership and collision protection; two misplaced records are tracked under `specs/sprint-alfred-epic/evidence/`. The live refusal sits in a protected hook (PB-GUARD-HOOKS), so it needs a signed package after S2 package 1 lands.
- **Assignment (if accepted):** (1) template wording "repository-root `evidence/`" in `goldfish-task.md` and its vendored copy (ordinary edit); (2) RED test then refusal in the split lane once S2 package 1 is applied (protected, PO signature); (3) decide whether to move the two tracked misplaced records. Reader coverage of the diagnosis is partial (listed in the note).
- **Date:** 2026-10-06
