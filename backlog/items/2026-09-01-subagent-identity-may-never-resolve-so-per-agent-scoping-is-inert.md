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

## CONFIRMED by direct self-observation, 2026-09-03 — no probe was needed

The finding is confirmed, and the confirming evidence is stronger than the
instrumented probe this item was waiting for. `NVA-B-SUBIDENT-2` was dispatched
as a subagent precisely so that its own calls would be the measurement.

**The proof is positive, not an absence argument.** The dispatch's own
first-ever Bash call was denied `GUARD-PARSE-UNSUPPORTED` and rendered with the
**trimmed** remedy text rather than the full grammar. That short form is
`GRAMMAR_DENIAL_REMEDY_SHORT`, selected only when `isFirstDenialThisScope()`
returns false — impossible on a first call unless the scope the payload resolved
to had already seen that class. The only state file present was keyed on the
**orchestrator's** `session_id`, with an mtime predating the dispatch, and it
already listed `GUARD-PARSE-UNSUPPORTED`. No `agent-*.json` file exists.

So `kind !== "subagent"` for a real dispatched subagent's payload, and
`15bb3599`'s per-agent branch never executes. Its scoping is a no-op in
production today, not merely at round-F's time.

This is also a live reproduction of the exact failure the original denial-trim
item predicted: a fresh-context subagent receiving a trimmed denial on its first
encounter with a class — for the reader who most needs the full text and has no
prior denial to remember.

**Two corroborating observations**, secondary to the above:
`dispatch-budget/` holds only an `orchestrator-seen/` entry for the orchestrating
session, with zero `agent-*.json` counters and zero `unresolved.jsonl` entries
across 15+ matched calls — which eliminates "unresolved" and "invalid identity"
and leaves "orchestrator" by elimination. And no `bootstrap-receipt/` directory
exists at all, which is the sibling mechanism this item flagged as carrying the
identical question; it does.

**Why the AC-4 regression test passes anyway, which is the methodological point.**
`guard-lifecycle-ready.test.mjs`'s `NVA-B-TRIMKEY AC-4` synthesises the subagent
identity through a fixture that manufactures a nested `subagents/agent-<id>.jsonl`
transcript path — a shape never observed live. The test validates the scope-key
selection logic and nothing about production. A test that constructs the input it
needs proves the branch is correct, not that the branch is reached.

**One process note worth keeping.** The dispatch's first reads were against the
repository checkout rather than the installed marketplace copy that actually
fires. An advisor call caught it, and it then confirmed the two byte-identical
and confirmed the installed copy already carries `15bb3599`. Measuring the guard
that runs, rather than the guard in the tree, is what made this evidence hold.

**No fix.** The stop condition applied: the remedy needs harness instrumentation
or an attended operator, which is a design decision rather than a small
correction. Nothing was changed.

## Confirmed 2026-09-06 — the question is settled, and the remedy is smaller than assumed

Live payload capture, run against two dispatched goldfish agents through a
temporary user-level `PreToolUse` hook, closes both readings this item left
open. Record:
`backlog/evidence/2026-09-06-dispatch-budget-guard-discriminator-measured.md`.

`subagentIdentity()` resolves `kind: "orchestrator"` for a real dispatched
subagent — not through a fixture gap, and not through an unresolved or invalid
identity. It resolves that way because the fact it consumes does not exist:
**no `PreToolUse` payload carries a `subagents/agent-<id>.jsonl` transcript
path.** A subagent's payload carries the PARENT session's `transcript_path` and
`session_id`, exactly like the orchestrator's. The by-elimination conclusion
recorded above was correct, and the mechanism behind it is now measured rather
than inferred.

What actually discriminates the two callers is the payload's key set: a
subagent's payload carries `agent_id` and `agent_type`, an orchestrator's does
not.

**Fixed for the budget guard, still open here.** `NVA-B-BUDGETGUARD-2`
(`b1ecbef2`, `6372b984`) added `dispatchBudgetCallerIdentity()`, which keys on
`agent_id`, and deliberately left the exported `subagentIdentity()` untouched
because this file's consumer was outside that dispatch's scope. Proof that the
budget guard now counts: `evidence/NVA-B-BUDGETGUARD-2-probe.txt` — the
subagent payload moves the counter from 1 to 2, the orchestrator payload leaves
it at 2 and lands in `orchestrator-seen/` instead.

`guard-lifecycle-ready.mjs` still imports `subagentIdentity` (line 85) and uses
it at three sites (around lines 4314, 4366 and 4474), so the per-agent
denial-trim scoping this item is about remains inert.

## Correction 2026-09-06 — the remedy is NOT uniformly small, and one third of it is a PO decision

A dispatch briefed to key all three sites on the measured discriminator
(`NVA-B-GLIDENT-1`) stopped before touching anything and reported why. It was
right to, and the sentence above about a "small correction" is only true for
one of the three sites.

**The three sites are not equivalent.** Sites 1 and 2
(`recordBootstrapPreflightReceipt` and `evaluateBootstrapReceiptGate`, the
GL-09 bootstrap-receipt gate) are dead today for the same reason: every real
subagent classifies as the orchestrator, so GL-09 never gates it. Correcting
the discriminator does not merely re-scope their state — **it activates the
gate.** A real subagent would then be denied its first `Edit`/`Write`/
`NotebookEdit` until a preflight receipt exists. That is a change in what the
guard admits, for every dispatched agent in every session, and it is very
probably the behaviour GL-09 was built for. It is still not something to infer
from a re-scoping task and ship silently.

Site 3 (`denialClassesScopeKey()`) is admission-neutral: it only decides which
key a denial-trim state lands under, and correcting it changes nothing about
what is admitted or refused. That one is the small correction.

**A second flip, narrower.** A payload with a present-but-relative
`transcript_path` is denied today through the 2026-08-29 invalid-identity
sentinel. An `agent_id`-only discriminator has no analogue for that state, so
that case would flip from denied to admitted. It needs its own answer.

**The test blast radius is about a dozen cases, not one.** The suite's
`subagentInput()` helper (around line 7438) never carries `agent_id` or
`agent_type`, and it backs roughly ten cases besides AC-4 — including
meta-file-missing, corrupt-meta and spawn-depth states that exercise
`subagentIdentity()`'s multi-state model, for which a two-state
`agent_id`-presence check has no equivalent at all. Any correction has to
decide what those cases become.

**Also measured:** `dispatchBudgetCallerIdentity()` is not exported from
`guard-dispatch-budget.mjs`, so this file cannot simply reuse the sibling's
corrected function; it needs a local equivalent or a deliberate export.

**Split, therefore.** Site 3 plus its probe is ordinary work and can proceed on
its own. Sites 1 and 2 are a GL-09 activation decision — filed for the PO, not
for an implementor.

The AC-4 regression test's own weakness stands as recorded: it manufactures the
transcript shape it needs, so it will keep passing either way and has to be
replaced by fixtures carrying the two real key sets.
