---
schema: pipeline.backlog-item.v1
id: pipeline.adr-0056-conflict-scope-text-narrower-than-code
type: defect
owner: pipeline
status: closed
created: 2026-08-18
source: "Incremental handover-rotation extraction pass (ADR-0066 Decision 6/7), 2026-08-18, over docs/state.md lines 3489-5929 (the T5 round entry, ~2026-08-06). Finding surfaced by a read-only research fork, verified against current source before filing."
---

# `docs/adr/0056-push-approval-mode.md` §5 describes `CRITICAL-PROOF-MODE-CONFLICT` more narrowly than the code that implements it

## Description

`docs/state.md`'s T5-round entry (from the 2026-08-06 "Nova (afternoon)"
block, now archival material) records that `CRITICAL-PROOF-MODE-CONFLICT`
was widened during that round to fire for proof-source values
`uncommitted`, `invalid`, `unreadable`, and `unsafe` — not only an
explicit `signature` value. ADR-0056 §5 still describes the conflict as
scoped only to the case where the source is explicitly `signature`.
Verified still true today by direct read:
`plugins/pipeline-core/lib/critical-human-proof-policy.mjs:408` returns
the conflict code from several branches, including the `unsafe`/
non-regular-file case at line ~164, while
`docs/adr/0056-push-approval-mode.md` §5 (lines ~88-94) documents only
the "explicit `signature` in the source" case. The ADR's own text is
narrower than the behavior it is meant to describe — a documentation
drift, not (as far as checked) a code defect.

## Triggering situation

Incremental extraction pass over `docs/state.md`'s oldest, clearly-closed
sections before that range can be rotated into `docs/state-archive/`
(ADR-0066 Decision 6/7). Every other durable conclusion in the reviewed
range already has a home (a pinned guardrail check, an ADR, or an
existing backlog item); this one does not.

## Affected artifact

[ADR-0056](../../docs/adr/0056-push-approval-mode.md) §5 (needs its text
widened to match the actual conflict-trigger set), cross-checked against
`plugins/pipeline-core/lib/critical-human-proof-policy.mjs`.

## Proposal

Not yet designed in detail. Likely a small, low-risk ADR-text amendment
(list all four conflict-triggering source values, not only `signature`)
rather than a code change — the code's broader behavior appears
intentional (defense-in-depth), just under-documented.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** not yet decided — filed to preserve the finding.
- **Rationale:** documentation-only, non-urgent; found while doing
  unrelated handover-rotation extraction work, not itself the task at
  hand.
- **Date:** 2026-08-18

## Closure, 2026-08-19 (verified live against current code, not against status text)

Confirmed resolved in code by an independent, code-first verification pass
(Workflow task wdyd7rk9g, 2026-08-19) run in response to a PO directive to
actively check every open backlog item against current code rather than
trusting frontmatter status. The item's own frontmatter/Triage text had not
been updated to reflect the landed fix; this closure catches that drift.

Read docs/adr/0056-push-approval-mode.md §5 (lines 88-102) directly. Current text: "The conflict is not scoped to an explicit signature value only: it fires for every source value except default ... that is, for an explicit signature, and equally for uncommitted, unsafe, invalid, and unreadable" — this is exactly the widened enumeration the item's own Proposal asked to be written ("list all four conflict-triggering source values, not only signature"). The item's claim that the ADR "still describes the conflict as scoped only to the case where the source is explicitly signature" does not match the current file. Cross-checked against plugins/pipeline-core/lib/critical-human-proof-policy.mjs's readGateApprovalMode() (lines 149-179), which does return the distinct source values default/uncommitted/unsafe/invalid/unreadable that feed CRITICAL-PROOF-MODE-CONFLICT (line 408) — the doc now matches the code's actual behavior. The gap described (ADR text narrower than code) is not present in the current ADR file; likely already fixed in an earlier round (the text itself cites 'T4 Critic finding'), making the item's 'verified still true today' claim itself stale.
