---
schema: pipeline.backlog-item.v1
id: pipeline.lifecycle-event-schema-has-no-non-dispatch-correlation-shape
type: defect
owner: pipeline
status: open
created: 2026-08-17
sprint: nova
tracking: "Reassigned from phoenix to nova on 2026-08-28 by PO decision, after the Phoenix line was intaked into Nova"
source: "L-AC-01 investigation (PHX-WP-LAC01-REMAINING, 2026-08-17) plus this session's own re-check of validateLifecycleGovernanceEvent and the approve-push call site, specs/sprint-phoenix-epic/evidence/acceptance-evidence-map.mjs POINTERS['L-AC-01']. Migrated verbatim from the Phoenix checkout (agent-pipeline-share_phoenix, branch sprint_phoenix) into this Nova repository's backlog on 2026-08-19 per explicit PO instruction — see Migration note below."
---

# Lifecycle event schema has no correlation shape for a non-dispatch governance action

## Description

`validateLifecycleGovernanceEvent` (`plugins/pipeline-core/lib/lifecycle-governance-events.mjs:84`)
requires every event's `correlation` object to carry the exact key set
`{packageId, dispatchId, attemptId, workerId, correlationId, queueRevision}`,
all five string fields ID-pattern-validated, `queueRevision` a non-negative
integer. This shape is a queue-dispatched worker execution's identity — it
models "which package, which dispatch, which attempt, which worker, which
retry lineage." Two of L-AC-01's nine named triggers (`dispatch`, `status`)
are genuinely that kind of event and have real producers today
(`continuity-cas`, `continuity-integrate-final`, commits `fd57d390`/
`8e4be420`).

The other seven named triggers split into two structurally different
problems, confirmed by direct source reading this session, not assumption:

1. **`candidate-invalidation`, `status-cancellation-variant`** — these ARE
   dispatch-queue concepts in principle, but no real code path constructs
   them: `planInvalidation` (`pipeline-state.mjs`) is only ever read and
   deleted, never assigned; `LIFECYCLE_TERMINAL_STATUS` only recognizes
   `succeeded`/`failed`, never a cancel state. Blocked on a missing state
   machine transition, not a schema gap.
2. **`verification`, `review`, `gate`, `recovery`, `reconciliation`** — these
   are NOT dispatch-queue concepts at all. Checked directly against the most
   promising candidate this session (`approve-push`, `pipeline-state.mjs:6870`,
   the H-AC-12 `decisionReference`-bound "gate" transition): its call path
   carries no `packageId`/`dispatchId`/`attemptId` at all — a push approval is
   a candidate-commit-level human authority action, not a queued worker
   execution. The same is true of `approve-deploy`, guard overrides, Critic
   review completion, and `session-cleanup-recovery`/`reconcile-backlog-ledger`.
   Representing any of these through the CURRENT schema means either
   fabricating dispatch identity that does not exist (the exact
   caller-invented-to-satisfy-a-criterion anti-pattern already reverted once
   in this campaign, `cc43a182`, and named in
   `design/agent-decision-journal-production-producer.md` §5), or extending
   the schema with a second, non-dispatch correlation shape.

## Triggering situation

`PHX-WP-LAC01`/`PHX-WP-LAC01B` (2026-08-17) built the two real producers
above and correctly stopped rather than guess further. `PHX-WP-LAC01-REMAINING`
(2026-08-17, investigation-only) confirmed the capability gap generalizes
across all 7 remaining kinds and named the design question explicitly. This
session (2026-08-17, continued) re-verified both halves directly against
current source (`lifecycle-governance-events.mjs:84`, `pipeline-state.mjs`'s
`approve-push` case) before writing this item, and concluded a same-night
fix is not honest: this needs a reviewed schema decision, not a quick patch.

## Affected artifact

`plugins/pipeline-core/lib/lifecycle-governance-events.mjs` (the closed
schema and its validator), and every real or potential producer for the five
non-dispatch kinds (`pipeline-state.mjs`'s `approve-push`/`approve-deploy`,
Git-guard override consumption, `critic-*` review completion,
`session-cleanup-recovery.mjs`, `reconcile-backlog-ledger.mjs`). Consumers
(`governance-replay*.mjs`, the Evidence Viewer) would need to render the new
shape too. `specs/sprint-phoenix-epic/acceptance.md` L-AC-01.

**Note (Nova checkout, 2026-08-19):** the exact files named above
(`lifecycle-governance-events.mjs`, `pipeline-state.mjs`, `governance-replay*.mjs`,
the Evidence Viewer) and the `specs/sprint-phoenix-epic/acceptance.md`
reference are as they exist in the Phoenix checkout at migration time — not
verified against this Nova repository's own current source, since Nova B
(the sprint this item is assigned to) has not started. Whoever picks this up
for Nova B must re-verify the affected artifact list against Nova's own
source before designing a fix, exactly per this repo's own standing rule
("Re-verify an inherited 'still open' claim before dispatching work on it").

## Proposal

Either (a) split `correlation` into a discriminated union keyed by `kind`,
with `{packageId, dispatchId, attemptId, workerId, correlationId,
queueRevision}` required only for `dispatch`/`status`/`candidate-invalidation`/
`status-cancellation-variant`, and a second, smaller shape (e.g.
`{packageId, queueRevision}`, both still required, everything else typed
absent) for `verification`/`review`/`gate`/`recovery`/`reconciliation`; or
(b) accept that these five kinds structurally do not belong in this schema
at all and scope L-AC-01's acceptance text to the four dispatch-queue kinds
plus a *separate*, new closed schema for governance-action lifecycle events.
Either path is real schema design plus multi-file wiring plus new consumer
handling, not a quick fix — do not attempt it without a dedicated design pass
first (mirrors the H-AC-11 O-4 and PX0-AC-13 disposition class already used
in this epic).

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** deferred
- **Rationale:** genuine schema-design work with multi-file blast radius
  (validator, ≥5 candidate producer call sites, ≥2 consumers); not safely
  attemptable as a same-session extension without a reviewed design doc,
  the same standard already applied to H-AC-11/PX0-AC-13 in this epic.
- **Assignment (if accepted):** **Nova B** (PO decision, 2026-08-17) — the
  sprint that rebases Phoenix's own work onto it; not an unnamed future
  increment. Owner `pipeline`, review trigger = Nova B's own planning
  (Phoenix is already building toward this shape, so a same-night Phoenix
  extension would likely be redone there anyway). Phoenix's own L-AC-01
  stays formally `partial` at 2/9 in the meantime, per the acceptance.md
  amendment this item is referenced from.
- **Date:** 2026-08-17

### Migration note, 2026-08-19 — moved from Phoenix into Nova's own backlog

PO instruction (chat, 2026-08-19): this item is deliberately NOT to be
solved inside Phoenix — its 2026-08-17 Triage already assigned it to Nova B,
and the PO now wants that assignment made concrete by tracking the item
where Nova B work actually lives, rather than leaving the only copy sitting
in the Phoenix checkout's backlog. Copied verbatim (frontmatter, Description,
Triggering situation, Affected artifact, Proposal, and the original 2026-08-17
Triage unchanged) from `agent-pipeline-share_phoenix` (branch `sprint_phoenix`)
into this repository. The PO will remove the Phoenix copy entirely once this
migration is confirmed landed — this Nova copy is the sole forward-tracked
instance from this point on.

**Status stays `open`, Decision stays `deferred`** — nothing about the
item's own disposition changed, only its tracking location. It is not part
of the current Nova A (`feat/sprint-nova-codex-v046`) Wave 5 batch and
should not be picked up before Nova B's own planning starts, per the
original Triage's own Assignment text.

**merge_note (2026-08-26, PHX-ITEMX-5):** the Phoenix checkout's own copy of
this item independently recorded its own supersession on 2026-08-19 —
Decision "deferred (2026-08-17), superseded 2026-08-19 — rejected here as
duplicate tracking", with an added `- **Superseded (2026-08-19, PO):**`
bullet stating that this item is now tracked in Nova's own backlog (commit
`cacb9fb5` on the Nova checkout), `status: rejected` there per
`backlog/README.md`'s Merge-duplicates convention, with this Nova copy named
as the sole tracked instance going forward. This is consistent with, not
contradicting, this document's own Migration note above — both branches
agree this Nova copy is authoritative. Resolved during the
`origin/sprint_phoenix` merge by keeping this document's `status: open` /
`Decision: deferred` (the live, forward copy) and folding the Phoenix side's
traceability detail (commit `cacb9fb5`, the Merge-duplicates convention) in
here rather than discarding it.
- **Date:** 2026-08-19
