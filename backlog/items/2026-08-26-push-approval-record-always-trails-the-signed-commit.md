---
schema: pipeline.backlog-item.v1
id: pipeline.push-approval-record-always-trails-the-signed-commit
type: defect
owner: pipeline
status: closed
created: 2026-08-26
sprint: nova
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "PO observation, 2026-08-26, live during a routine push: 'dieses update des push standes wird jetzt aber nicht auf dem anderen pc ankommen. das ist noch eine schwäche im ablauf da die infos verloren gehen' -- caught mid-session, reproduced twice in the same push sequence."
done_when: manual
closed_at: "2026-08-30"
closure_repository: "self"
closure_commit: "3783c88ac6a366ea2082f0db61be638d164d43ee"
closure_evidence: "backlog/evidence/2026-08-30-nova-open-item-code-map.md"
---

# Closed — 2026-08-30

`approve-push` now marks the trailing audit write as pending, and the next
`push-prepare` safely folds only that sole state-file write before evaluating
the remaining push preconditions.  `push-prepare.test.mjs` passed 54/54,
including the real-repository red-to-green reproduction and refusal to absorb
unrelated work.  The referenced code map records the re-verification.

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

## Landed, 2026-08-29 (dispatch NVA-PUSHFOLD-1, commits `8f9c0ea0` + `ce9df141`)

Both parts implemented as the PO decided. **Hint:** `approve-push`'s existing
write now also sets `approvalRecord.pendingAuditWrite = true` on the same
write it already performs (zero extra I/O) — visible the moment a different
machine pulls, before the trailing write can land. **Fold:** new
`foldPendingPushApprovalWrite(dir, deps)` in `push-prepare.mjs`, called as
the first statement in `pushPrepareReport()`; folds ONLY when the resolved
state file is the SOLE dirty path (any other dirty file is left completely
untouched — never silently absorbs unrelated WIP), and clears
`pendingAuditWrite` before committing so the flag never goes stale. Along
the way, fixed a real pre-existing bug in `push-prepare.mjs`'s `gitOutput()`
helper: its `.trim()` was eating the leading porcelain status-code column,
which the fold detection needed intact.

Verified: `push-prepare.test.mjs` 48/48 (5 new tests), `pipeline-state.test.mjs`
1/1 unmodified, `check-consumer-safe-paths.test.mjs` 9/9,
`push-release-flow-docs-contract.test.mjs` 6/6, `check-section-citations.test.mjs`
17/17. `docs/push-release-flow.md` updated to document the new behavior.

Gap (2) from the dispatch's own disclosure is now closed: all 13 test files
in this repository referencing `lastApproved` were run individually by the
Elephant after landing — `critical-human-proof-gate.test.mjs`,
`pre-push-hook-install.test.mjs`, `guard-push-scratch-advisory.test.mjs`,
`critical-action-authorization.test.mjs`, `governance-event-store.test.mjs`,
`nova-candidate-freeze.test.mjs`, `guard-push-external-ledger.test.mjs`,
`guard-push-attestation-diagnostics.test.mjs`,
`guard-push-decision-reference.test.mjs`, `guard-push.test.mjs` (168/168),
`guard-git.test.mjs` (230/230) — all pass, confirming no regression from the
new `pendingAuditWrite` field.

**Not yet closing.** One gap remains: no new coverage in
`pipeline-state.test.mjs` for `pendingAuditWrite` itself — it is
TP-protected, so coverage lives only in `push-prepare.test.mjs`'s end-to-end
integration test instead, not a dedicated unit test at the write site.
