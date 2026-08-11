---
schema: pipeline.backlog-item.v1
id: pipeline.authority-revision-receipt-dedup-and-recovery-integrity-gaps
type: defect
owner: pipeline
status: open
created: 2026-08-11
source: "Recorded in docs/state.md as F5/F6 (minor) findings from the PX0-AC-05 authority-revision receipt review chain: real, tracked, not yet fixed at the time of that checkpoint, but left without an owner or due date in the handover prose itself. Filed as a proper owned, dated backlog item per QG-06 (a known gap with no due date is a finding, not a mitigation), without altering the docs/state.md checkpoint narrative."
due: 2026-09-10
---

# Authority-revision receipt: append-dedup and roll-forward recovery integrity gaps (F5/F6, minor)

## Description

Two residual minor risks against the authority-revision receipt lifecycle, both real and tracked
per `docs/state.md`'s PX0-AC-05 checkpoint note, neither yet fixed:

- **F5 — append-dedup keys on `intentSha256` alone, with no content check.** The dedup mechanism
  for the authority-revision receipt append path treats two entries as duplicates purely on
  `intentSha256` equality, without an accompanying re-derivation or comparison of the underlying
  content the hash was computed over.
- **F6 — roll-forward recovery doesn't re-validate the postimage's PRD/Spec artifact bytes against
  the frozen digest.** During roll-forward recovery, the postimage's PRD/Spec artifact bytes are not
  re-checked against the digest that was frozen at the point the digest was recorded, so a mutated
  postimage artifact would not be caught by the recovery path itself.

## Related

- `docs/state.md` — PX0-AC-05 checkpoint entry originating this note (search "F5/F6 minor").
- `guardrails/quality-gates.md` QG-06 — the rule this filing satisfies (no undated/unowned known gap).
