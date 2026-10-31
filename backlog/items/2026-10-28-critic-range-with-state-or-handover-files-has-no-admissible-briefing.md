---
schema: pipeline.backlog-item.v1
id: pipeline.critic-range-with-state-or-handover-files-has-no-admissible-briefing
type: defect
owner: pipeline
status: open
done_when: manual
created: 2026-10-28
sprint: alfred
source: "Hit live, 2026-10-28, by a consumer repository: a feature-course Critic stopped with a briefing violation before reading anything; checked afterwards against templates/prompts/critic-review.md, harness/review-protocol.md section 2.2 and roles/critic.md."
---

# A Critic range that contains project-state or handover files, or a retained prior result, cannot be briefed admissibly

## What happened

A consumer reran round 1 of a feature course on a range of 159 commits. The Critic stopped at the reference boundary and read nothing. It found four groups of
forbidden material by path name and git metadata only: the committed result of the earlier round 1, two handover documents, and the project state file
(`docs/state.md`, changed in 21 commits of the range). The briefing had stated the correction-input bindings as not applicable.

## Cause (verified against the canon)

- `roles/critic.md` and the template list "handover, state, history" as forbidden material.
- `harness/review-protocol.md` section 2.2 and the template admit an exclusion only for a positively identified coordinator-only report, with exactly two
  roles: retained prior result, finding-disposition record. A project-state or handover file is neither, and a state file that carries the decision register is
  mixed (it also holds operative contract), which section 2.2 rejects.
- No script or library derives the bindings. The Coordinator has to hand-build a file with blob ids, SHA-256 and mode per touched version, which is where a
  freehand role invention would creep in.
- Every epic range that touches the state file is therefore unreviewable today, not only this one.

## Decision (PO, 2026-10-28)

Add one narrow role, project-state record, and a command that derives the bindings. The Critic boundary stays whole: the paths are excluded, never made readable.

## Slices

1. Canon: template, review protocol section 2.2 and the Critic role admit the role `project-state record`, only for paths the project calibration names as its
   handover or state file (and files matching its handover naming), with blob id, SHA-256 and mode per touched version. An ADR-0014 amendment records it.
2. Command: derives the correction-input bindings of a range (retained prior results found by their evidence location, state records found by the calibration),
   refuses a path it cannot classify, and emits no body, finding or summary.
3. Dispatch preflight refuses a range with forbidden paths and no bindings, before the Critic is started and a claim is spent.
4. Operator note in the Critic skill: bindings are mandatory for any range that contains such paths.

## Not decided

Whether an unclassifiable path is refused or offered to the Coordinator as a typed question (default: refused).
