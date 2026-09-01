---
schema: pipeline.backlog-item.v1
id: pipeline.the-denial-trim-state-is-keyed-per-session-not-per-agent-as-its-comment-claims
type: defect
owner: pipeline
status: open
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
