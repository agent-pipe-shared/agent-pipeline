---
schema: pipeline.backlog-item.v1
id: pipeline.a-push-approval-occupies-a-single-slot-so-destinations-cannot-be-prepared-together
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
source: "Measured live during the 2026-09-01 0.6.0 release: three-destination push (feat/sprint-nova-codex-v046, main, stable) required three fully separate sign -> approve-push -> push cycles."
done_when: manual
---

# A push approval occupies a single slot, so destinations cannot be prepared together

## Description

`approve-push` (`plugins/pipeline-core/scripts/pipeline-state.mjs`, around
line 9039) writes `pushApproval: { lastApproved: approvalRecord }` into the
whole-state object it returns from `writeState`. This is a single named slot,
not a keyed collection: approving a second destination replaces the first
recorded approval rather than adding to it. A human who wants to sign for
multiple destinations in one sitting cannot — each destination needs its own
sign, record, and push before the next signature can be requested, because
signing the next destination overwrites the previous one's still-unconsumed
approval.

## Triggering situation

Measured live on 2026-09-01 releasing 0.6.0: the release needed pushes to
three destinations — `feat/sprint-nova-codex-v046`, `main`, and `stable`. The
human could not sign all three in one sitting and let the agent push them in
sequence; each destination required its own complete sign -> `approve-push` ->
push cycle, with the human present for each, because a second `approve-push`
call would have overwritten the first destination's still-pending approval.

Compounding it: the signed subject binds `{sourceCommit, remote, destination,
threatModel}` (`docs/push-release-flow.md`, "Ordering rule" section), and
`push-prepare.mjs`'s `checkEvidenceFreshness` (around line 158) separately
refuses whenever `data.commit !== headCommit`. Any commit landing between
destinations (the push commit itself moves HEAD) therefore forces a fresh full
verify run before the next signature is even possible. For this release, at
~10 minutes for 505 suites, the plain cost was three signing ceremonies plus
up to three full verify runs to move one release across three destinations.

This is a specific, measured instance of the general shape recorded in
`backlog/items/2026-08-16-every-gate-binds-the-whole-tree-so-any-later-commit-voids-it.md`
(every gate binds the whole tree, so any later commit voids it) — this item
narrows that shape to the push-approval slot specifically.

## Affected artifact

`plugins/pipeline-core/scripts/pipeline-state.mjs` (`approve-push`,
`pushApproval.lastApproved`); `plugins/pipeline-core/scripts/push-prepare.mjs`
(`checkEvidenceFreshness`); `docs/push-release-flow.md` (Ordering rule
section, subject binding).

## Proposal

No fix decided here. Two directions worth naming without deciding between
them:

- A keyed approval store — one recorded approval per destination (e.g.
  `pushApproval.byDestination[destination]`) instead of one shared
  `lastApproved` slot, so signing destination B does not overwrite the still-
  pending approval for destination A.
- One approval covering an explicitly enumerated destination set inside a
  single subject — the human signs once for `{main, stable,
  feat/sprint-nova-codex-v046}` together, and each push consumes its share of
  that one approval.

Either direction still has to reconcile with the existing whole-tree HEAD
binding (`checkEvidenceFreshness`, the signed-subject `sourceCommit`) — a
multi-destination approval does not by itself remove the fresh-verify-per-
commit cost unless that binding is also revisited, which is out of scope for
this item.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** {{accepted | deferred | rejected | merged-into-<filename>}}
- **Rationale:** {{mandatory for rejected/deferred; optional for accepted}}
- **Assignment (if accepted):** {{phase/release}}
- **Date:**
