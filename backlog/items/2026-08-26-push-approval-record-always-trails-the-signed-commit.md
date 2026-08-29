---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-record-always-trails-the-signed-commit
type: defect
owner: pipeline
status: open
created: 2026-08-26
sprint: nova
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "PO observation, 2026-08-26, live during a routine push: 'dieses update des push standes wird jetzt aber nicht auf dem anderen pc ankommen. das ist noch eine schwäche im ablauf da die infos verloren gehen' -- caught mid-session, reproduced twice in the same push sequence."
done_when: manual
---

# `approve-push`'s own audit-trail write structurally can never be part of the push it records

## Description

`pipeline-state.mjs approve-push` consumes a signed proof and writes the
result into `project/pipeline-state.json` (`pushApproval.lastApproved`,
`consumedApprovals`). That write happens strictly AFTER the signature was
produced, and the signature is bound to a fixed `subjectSha256` computed
from the exact candidate commit/tree at signing time — so the write can
never be included in the commit that was actually signed and pushed. Two
consequences, both observed live in the same session:

1. `docs/state.md`'s own "recorded a push" narration has the identical
   problem one level up: any commit that says "we pushed commit X" is, by
   definition, written after X, so it cannot be part of X's own push either.
2. Every `approve-push` run leaves the working tree dirty with exactly one
   trailing, uncommitted `project/pipeline-state.json` change immediately
   after a successful push. If that trailing commit is chased with its own
   fresh signature ceremony (as this session did once, to close the gap
   immediately), the SAME `approve-push` write recurs for THAT push too —
   the lag is structural, not a one-off bug, and cannot be closed by
   repeating the ceremony.

Net effect: on a machine that only pulls `origin/<branch>` between
sessions, the most recent "we pushed" state and the most recent push-
approval audit record can lag one commit behind the actual pushed tip,
until the next ordinary push happens to carry it along. Low severity (the
missing commit is metadata/narration, not source), but a real, repeatable
multi-machine sync gap worth a documented fix rather than silent
tolerance.

## Possible directions (not evaluated, no design work done yet)

- Accept it as permanent, structural residue and document the expectation
  explicitly (e.g. in `docs/push-release-flow.md`): "the tip you observe on
  another machine may be one non-source commit behind local HEAD until the
  next push; this is by design, not a sync failure."
- Batch differently: have `approve-push` write its record BEFORE computing
  the signed subject (i.e., sign a subject that already includes "approval
  recorded" as part of the same tree) — likely reopens the chicken-and-egg
  problem one level up (the record would then need to know its own future
  commit hash) and may not be solvable without a two-phase commit scheme.
- Treat the lag as acceptable but make it self-limiting: fold the trailing
  `pipeline-state.json` write into the START of the NEXT push-prepare run
  automatically, rather than requiring a human/session to notice and
  commit it by hand each time.

## Triage

- **Decision:** open, unassigned. Low severity, cross-cutting (push-release
  flow, not any one sprint) — pick up when convenient.

## PO decision, 2026-08-29

**Decision:** direction 3 (auto-fold the trailing `pipeline-state.json`
write into the START of the next `push-prepare` run), augmented with an
upfront hint: at the moment `approve-push` succeeds — before the trailing
write can land — record a visible, human-readable marker (e.g. in
`docs/state.md`'s narration or the push-approval record itself) stating that
a push was approved and its audit-trail write is still pending, so a session
that resumes on a DIFFERENT machine (one that only pulled `origin/<branch>`)
can see "a push was planned/completed elsewhere; the trailing proof record
will arrive with the next push" instead of silently missing context.
**Rationale:** PO explicitly wants the cross-machine visibility gap closed,
not just the mechanical fold — the scenario that prompted this item was
exactly a different-machine session missing this information.
**How to apply:** dispatch an implementor/deep task targeting
`plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`) and
`plugins/pipeline-core/scripts/push-prepare.mjs`: (1) have `approve-push`
write a lightweight, immediately-visible marker as part of its own commit
context (not the trailing write itself — that still structurally can't be
part of the signed commit) that a later session/machine can read; (2) have
the next `push-prepare` run automatically fold the trailing
`pipeline-state.json` write in, rather than requiring a human/session to
notice. `pipeline-state.mjs` is a file other dispatches have touched this
session — re-check its live state before editing.
