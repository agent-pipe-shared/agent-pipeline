# NVA-B-TRIMKEY: the item was already satisfied when it was picked up

Measured 2026-09-03 while selecting a Nova-B batch. The item
`pipeline.the-denial-trim-state-is-keyed-per-session-not-per-agent-as-its-comment-claims`
carried `status: open`, and its own text set a precondition — "settle the host
behaviour first" — that the repository had already settled two days earlier.

## What the item asked for

The item recorded a comment in `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
claiming the denial-trim state followed "the same convention" as
`bootstrapReceiptDir()`, when the state was keyed on `session_id` and the receipt
tree on `agentId`. It named the deciding question explicitly: if a dispatched
subagent inherits its orchestrator's `session_id`, the defect is a keying error
and the comment is only its visible symptom; if not, the comment correction
stands alone.

## What is in the tree

Commit `15bb35994d83b8147b22c9316561c3767ef81037`
(`fix(guard): key the denial-trim state per dispatched agent, not per session`,
2026-09-01) answered the question by measurement rather than inference — the
commit message records the method: a subagent's PreToolUse/Stop payload carries
its orchestrator's `session_id` and never one of its own, cross-checked against
three already-live state trees keyed by `session_id` or `agentId`.

Both halves of the item are therefore satisfied in the shipped code:

- **The keying.** `isFirstDenialThisScope()` (renamed from
  `isFirstDenialThisSession`) resolves a scope key per dispatched-subagent
  `agentId` via `subagentIdentity()`, falling back to `session_id` for the
  orchestrator itself and for any unresolved or invalid identity.
- **The comment.** The header above `guardDenialClassesDir()` now states the
  keying it actually implements, and says in its own words that the state is
  "NOT keyed purely on `session_id`, and deliberately NOT full parity with
  `bootstrapReceiptPath()`'s pure per-agentId keying either" — the precise claim
  whose absence the item recorded.

The commit also added an `NVA-B-TRIMKEY AC-4` regression test pinning that a
fresh subagent identity renders full denial text on its own first denial of a
class already seen under its orchestrator's shared session id.

## Why this is recorded rather than quietly closed

This is the second measured instance in two days of an item that was resolved in
the tree while its `status:` field still read `open`, and the second time the
cost landed on a dispatcher who was about to brief work against it. The first
instance is recorded in
`backlog/items/2026-08-27-resolved-backlog-items-can-keep-status-open-indefinitely.md`.

Both instances share a mechanism worth naming: the item file is the artifact a
dispatcher reads, and it is the one artifact that does not change when the defect
is fixed. Reading the item is not sufficient; `git log` over the paths the item
names is what actually answers whether the premise is still live.
