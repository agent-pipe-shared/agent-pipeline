---
schema: pipeline.backlog-item.v1
id: pipeline.the-denial-trim-state-is-keyed-per-session-not-per-agent-as-its-comment-claims
type: defect
owner: pipeline
status: closed
closed_at: 2026-09-03
closure_repository: self
closure_commit: 15bb35994d83b8147b22c9316561c3767ef81037
closure_evidence: backlog/evidence/2026-09-03-nva-b-trimkey-stale-open-measurement.md
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Critic round NVA-CR-D against commit 1314edec, 2026-09-01: finding F2 (minor), plus the candidate it dropped under CR-05 for want of primary evidence, which is the reason F2 matters."
---

# The denial-trim state is keyed per session, not per agent as its comment claims

## The stated finding

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` introduces its new state
tree as a sibling of `bootstrapReceiptDir()` using "the same convention". The
dependency-injection shape does match. The identity key does not:

- `bootstrapReceiptPath(commonDir, agentId)` keys per **agent**, with `agentId`
  derived from `transcript_path` via `subagentIdentity()`
  (`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`).
- `guardDenialClassesPath(commonDir, sessionId)` keys per **session**, from
  `input.session_id`.

The comment is the only place a future maintainer learns the intended scoping of
this state, and it asserts equivalence on the single dimension where the two
differ. QG-09 treats an unbacked claim in a comment as a finding, not a style nit.

## The open question that decides whether this is cosmetic or load-bearing

Because the key is `session_id` alone, a fresh-context subagent could receive the
TRIMMED denial on its FIRST grammar denial, if the orchestrator already triggered
that class in the same session. That would defeat the trim's own requirement that
the first denial of a class renders in full — for exactly the reader who most
needs it, since a fresh-context subagent has no prior denial to remember.

The reviewer dropped this under CR-05 rather than assert it: it depends on the
host fact that a subagent's PreToolUse payload carries the parent's `session_id`,
which could only be inferred from the absence of `session_id` in
`subagentIdentity()`. A repository-wide search for documented session-scoping
semantics returned nothing.

**Settle the host behaviour first.** If a subagent inherits the parent's
`session_id`, the fix is a keying change, not a comment change, and the comment
was the visible symptom of a real scoping error. If it does not, the comment
correction stands alone.

## Why it was parked rather than fixed on discovery

Recorded because the reasoning is the point. The file is a PreToolUse guard, so
even a comment-only diff is trigger row T1 under `harness/review-protocol.md` —
a mandatory review round on the higher-capability model, regardless of diff size.
That round did not fit before the 2026-09-01 release freeze.

Shipping a guard-code change whose owed review is skipped is worse than shipping
an inaccurate comment whose inaccuracy is recorded. The trim's behaviour itself
was reviewed and found correct; only this comment and the scoping question remain.

## Not in question

The reviewer verified and explicitly cleared: positional-argument correctness at
both call sites; the opt-in default leaving every non-grammar caller unchanged;
the no-throw path; the first-denial guarantee holding structurally rather than
only by test; the override ceremony text identical in both renderings. The
non-atomic read-modify-write and a torn state file both fail open, worst case a
redundant full rendering.

## Closure

Closed 2026-09-03 against `15bb35994d83b8147b22c9316561c3767ef81037`, which
landed 2026-09-01 — two days before this item was picked up, while the item's own
`status:` field still read `open`.

The deciding question this item posed was answered by measurement, not inference:
a dispatched subagent's PreToolUse payload carries its orchestrator's
`session_id` and never one of its own. So the item's first branch applied — this
was a real scoping error whose visible symptom was the comment, not a comment
defect standing alone. The fix keys the state per resolved subagent `agentId`
with a `session_id` fallback, corrects the header to describe that keying, and
pins the first-denial guarantee for a fresh subagent with a regression test.

Nothing was dispatched for this item. The measurement is in
`backlog/evidence/2026-09-03-nva-b-trimkey-stale-open-measurement.md`, and the
stale-status mechanism it exhibits is recorded as a second instance in
`backlog/items/2026-08-27-resolved-backlog-items-can-keep-status-open-indefinitely.md`.

## Correction, 2026-09-03 — this closure was premature and the item is being reopened

The closure above is wrong on the merits, and this section records why rather
than quietly amending it.

`15bb3599` implements per-agent keying correctly. It never executes.
`NVA-B-SUBIDENT-2`, dispatched later the same day and measuring through its own
live calls, established that `subagentIdentity()` does not return
`kind: "subagent"` for a real dispatched subagent's PreToolUse payload — so
`denialClassesScopeKey()` always falls back to the orchestrator's `session_id`,
which is precisely the pre-fix behaviour. Evidence is in
`backlog/items/2026-09-01-subagent-identity-may-never-resolve-so-per-agent-scoping-is-inert.md`.

**The defect this item names is therefore still live, and was reproduced after
the closure.** That dispatch's own first-ever Bash call was denied
`GUARD-PARSE-UNSUPPORTED` and rendered with the trimmed remedy text — a
fresh-context subagent receiving the short form on its first encounter with a
class, which is the exact scenario this item's "open question" section predicted
and the exact reader the first-denial-renders-full guarantee exists for.

**What went wrong in my own reasoning.** The closure rested on the fix's commit
message, its code, and a passing regression test. All three are genuine, and all
three are about the same layer: whether the scope key is *selected* correctly
once a subagent identity exists. None of them touches whether that identity is
ever *produced*. The AC-4 test in particular manufactures the transcript shape it
needs, so it proves the branch is right without proving the branch is reached.

The `git log` check I applied that morning — verify the premise against the paths
the item names before dispatching — worked as intended and found the fix. It
cannot detect a fix that landed and is inert. That is a distinct failure mode
from the stale-open one, and it is the more dangerous of the two: a stale-open
item wastes a dispatch, an inert fix closes a live defect.

**Reopening is deferred by minutes, not declined.** A status flip creates
unreconciled ledger debt, and a concurrent dispatch is working inside
`backlog/transitions.ndjson` right now; interleaving a reconcile with it would
risk the hash chain. The reopen and its ledger reconciliation follow immediately
once that dispatch reports. Until then this section, not the `status:` field, is
the accurate record.

## Placeholder-marker-for-append
