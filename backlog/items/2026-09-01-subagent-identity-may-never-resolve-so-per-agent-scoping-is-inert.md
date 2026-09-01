---
schema: pipeline.backlog-item.v1
id: pipeline.subagent-identity-may-never-resolve-so-per-agent-scoping-is-inert
type: defect
owner: pipeline
status: open
created: 2026-09-01
sprint: nova-b
done_when: manual
source: "Round-F Critic finding F-1 (scratch/findings-registry-round-F.md), corroborated by an independent live investigation dispatched as NVA-B-SUBIDENT (scratch/subagent-identity-investigation.md); both verified against plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs live source."
---

# `subagentIdentity()` may never resolve `kind: "subagent"`, which would make the per-agent denial-trim scoping a no-op

## The mechanism at issue

`denialClassesScopeKey()` (`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`,
around line 3794) yields a per-agent scope key (`agent-<agentId>`) only when
`subagentIdentity()` returns `identity.kind === "subagent"` with a non-empty
`agentId`. Every other resolved shape — including `kind: "orchestrator"` and any
unresolved/invalid identity — falls back to the shared `session_id` as the scope
key. This fallback is exactly the pre-fix behaviour that commit `15bb3599`
(NVA-B-TRIMKEY) was built to replace, so that a fresh dispatched subagent does not
inherit a trimmed (short-form) grammar denial from a class its orchestrator
already triggered in the same session.

## The finding

Two independent rounds report that `kind === "subagent"` may never actually be
produced for a real dispatched subagent's PreToolUse payload, which would make
`15bb3599` a no-op in production:

- **Round-F Critic (F-1, major):** live state shows
  `.git/agent-pipeline/dispatch-budget/` contains only `orchestrator-seen/` — no
  per-`agentId` counter file and no `unresolved.jsonl` — while
  `guard-dispatch-budget.mjs` writes a counter on every counted call of a
  RESOLVED subagent identity, under an installed matcher that covers the tool
  types a review actually uses. Subagent transcripts and their `.meta.json`
  siblings exist in the shape `subagentIdentity()` expects to consume, so
  fixture absence is not the explanation — resolution happens from
  `transcript_path`, not from those files. The AC-4 regression test that backs
  `15bb3599` cannot distinguish the two readings, because it synthesizes
  `transcript_path` directly into the payload — the very resolution step in
  question.
- **NVA-B-SUBIDENT (independent live probe, same day):** a dispatched subagent
  (`agentType: pipeline-core:goldfish-deep`, confirmed via its own transcript and
  sibling `.meta.json`) made write calls that were allowed with zero trace in
  `agent-pipeline/bootstrap-receipt/` (which does not exist at all under the git
  common dir) and produced no per-agent counter under `dispatch-budget/` despite
  25+ calls against a match-all matcher. By elimination against
  `evaluateBootstrapReceiptGate()`'s own branches (a resolved `kind: "subagent"`
  identity with no receipt is an unconditional block; unresolved/invalid
  identities record an observation before allowing; neither happened), the only
  remaining branch is `identity.kind === "orchestrator"` — the one branch that
  returns `null` unconditionally with no recording at all. The investigation
  ruled out three alternative explanations (detection not firing at all, state
  directory misresolution, hooks not wired for subagents) using the hooks'
  visible side effects on the dispatch's own calls, and treated a fourth
  (selective cleanup of only the per-agent/bootstrap-receipt subtrees) as
  eliminated on the balance of evidence rather than proven impossible.

Both rounds converge on the same practical claim from two different angles (a
sibling consumer, `bootstrapReceiptPath()`, sharing the same `agentId` keying
scheme; and the trim's own `dispatch-budget` sibling): the harness's
`transcript_path` value for a dispatched subagent's tool calls appears to carry
the orchestrating session's own top-level transcript path, not the subagent's
correctly-nested one, so `subagentIdentity()`'s structural check
(`basename(dirname(transcript_path)) === "subagents"`) never matches for a live
dispatch.

## Stated limit of the evidence

Neither round could read the raw PreToolUse hook payload directly — no tool
available to a dispatched subagent, or to a read-only reviewer, exposes it. Both
conclusions are inference from side effects (absence of expected state-file
traces across dozens of historical dispatches, elimination of alternative
explanations by their own observable behaviour), not a direct observation of the
literal `transcript_path` string. NVA-B-SUBIDENT rates its own empirical claim
"high confidence" and the root-cause explanation "medium-to-low confidence".

## The remedy both rounds name

A live probe of `subagentIdentity()`'s actually-resolved `kind` under a real
dispatch, reading the raw hook stdin directly — described by NVA-B-SUBIDENT as
needing either a harness/runtime change log documenting what `transcript_path` is
set to for a Task/Agent-tool dispatch, or an attended operator temporarily
instrumenting the installed guard's entrypoint to log the raw payload once, live,
then removing the instrumentation — explicitly out of scope for a normal
dispatch's own permissions. Until that probe runs, `15bb3599`'s per-agent
scoping should be treated as unconfirmed in production, and the sibling
`bootstrapReceiptPath()`/`GUARD-BOOTSTRAP-RECEIPT-MISSING` mechanism (which keys
on the same `agentId` resolution) should be treated as carrying the identical
open question.
