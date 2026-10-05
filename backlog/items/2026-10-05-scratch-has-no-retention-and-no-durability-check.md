---
schema: pipeline.backlog-item.v1
id: pipeline.scratch-has-no-retention-and-no-durability-check
type: defect
owner: pipeline
status: open
created: 2026-10-05
source: "Observed in the Windows checkout on 2026-10-05 (Alfred session, round 3b drafts); PO rule 2026-10-05."
sprint: alfred
done_when: manual
---

# `scratch/` has no retention and no durability check

## Description

On 2026-10-05 the Windows checkout's `scratch/` held 566 MB in 31,243 files (repository staging copies of already committed packages, tarballs, CPU profiles); 498 MB were removable. At the same time durable content (Fable reports, working plan, PO addendum, Verify results, parked RGGRAM work) existed only there and would have been lost on a device switch.

PO rule 2026-10-05: nothing durable only in scratch.

## Affected artifact

The `scratch/` lifecycle (no sweep) and the handover/push checks (no durability check).

## Proposal

- A sanctioned scratch sweep that removes staging copies once their package commit exists.
- A handover/push check that refuses or warns while `scratch/` holds files marked durable (or any `*.md` decision/plan file) with no tracked counterpart.

Matrix: all runners and platforms; consumer repositories too.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
