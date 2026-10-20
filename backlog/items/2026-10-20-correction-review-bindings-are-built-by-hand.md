---
schema: pipeline.backlog-item.v1
id: pipeline.correction-review-bindings-are-built-by-hand
type: defect
owner: pipeline
status: open
created: 2026-10-20
source: "Ordinal-2 delta Critic of e6fec04a0..f62b5143a, 2026-10-20: the first dispatch stopped at the reference boundary because its briefing called the correction input bindings not applicable although the range added a retained Critic result"
sprint: none
done_when: manual
---

# Correction-review input bindings are built by hand

## Description

`templates/prompts/critic-review.md` asks the Coordinator for correction input bindings whenever
a correction range carries a committed Critic result or disposition. These bindings are the
base/head commits and trees, the commit parents, a role for every changed path, and the blob,
SHA-256 and mode of every version of each excluded report. `harness/review-protocol.md` describes
the procedure. No shipped script produces them, and `guard-dispatch` does not check that a range
carrying such a report has them.

On 2026-10-20 the ordinal-2 dispatch filled the field as "not applicable". The range had added
`specs/sprint-alfred-epic/evidence/critic/pf54-pf55-e6fec04/critic-notes.md`. The Critic stopped
correctly at the boundary, which spent one dispatch. The re-dispatch used a scratch prototype that
derives the bindings from Git objects.

Two channels are not covered by a path partition:

- Commit message bodies that cite prior findings. The prototype marks them coordinator-only and
  names a trailer-only read, but `guard-push` refuses `%(trailers:…)` because of its parentheses.
- Mixed coordinator files, such as the handover and the PO list, that carry prior severities.
  They had to be excluded as disposition records.

## Acceptance

- A shipped script derives the correction input bindings from the range. The Critic template
  names it.
- `guard-dispatch` refuses a correction dispatch whose range adds or changes a file under
  `specs/*/evidence/critic/` while its bindings field says not applicable.
- The commit-message channel has an admitted read route for trailers alone.
