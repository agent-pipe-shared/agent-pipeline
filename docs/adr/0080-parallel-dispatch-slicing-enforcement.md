# ADR-0080: Machine-delivered default task-slicing into parallel dispatch

**Governs:** plugins/pipeline-core/hooks/guard-slicing.mjs, plugins/pipeline-core/hooks/guard-slicing.test.mjs, plugins/pipeline-core/hooks/native-slicing.mjs, plugins/pipeline-core/hooks/codex-slicing-hint.mjs, plugins/pipeline-core/hooks/antigravity-slicing-hint.mjs, plugins/pipeline-core/hooks/codex-hooks.json, plugins/pipeline-core/hooks.json

> Agent-Pipeline · Sprint Nova-B · as of 2026-09-06

> **Accepted as ADR-0080 on 2026-09-06.** Numbered in the act of acceptance per
> [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2 — this file and its index
> row in `docs/adr/README.md` are one commit.

**Status:** accepted (2026-09-06, PO decision in session — all five decisions
accepted; Decision 1's precondition, the delivery channel, was met by the
2026-09-06 probe recorded in the addendum below). Numbered at acceptance per
[ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2; until
then this file was `docs/adr/draft-parallel-dispatch-slicing-enforcement.md`.

**Basis:**
`backlog/items/2026-08-29-the-pipeline-defaults-to-sequential-work-with-no-enforced-task-slicing.md`
(open — this ADR is a proposal against its four named open design questions),
with `backlog/items/2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md`
(closed 2026-08-19) and
`backlog/items/2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md`
(closed 2026-08-18) as the two siblings surveyed first. Authored by dispatch
`NVA-B-PARALLELSLICING-DESIGN-1`.

---

## Context

An Elephant session works a batch of independent tasks one dispatch at a time,
even when the batch could be sliced into non-overlapping units and run
concurrently. The PO wants that default changed in the enforcement layer,
because prompt-level guidance has already failed: `docs/operating-model.md`,
the Workflow tool's own description and
`plugins/pipeline-core/skills/pipeline-start/references/workflow-dispatch.md`
all describe parallel dispatch as available and often preferable, and the
2026-08-29 session still ran serial until the PO corrected it live, more than
once.

**Sibling survey (stop-condition check, per the item's own Direction step 1).**
Neither sibling answers the four open questions, so this design is not
redundant:

- `2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md` made
  template-conformance *checking* Workflow-aware — `extractWorkflowDispatches()`
  in `plugins/pipeline-core/hooks/guard-dispatch.mjs`, wired live via the
  `Task|Agent|Workflow` matcher. It checks a Workflow dispatch **once one is
  written**. It has no opinion on whether one is written at all. This design
  must not re-solve or contradict it, and does not: it operates strictly
  *upstream* of the moment guard-dispatch fires.
- `2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md` is the
  risk register, not a design. Its incidents — three in one 2026-08-07 wave,
  recurring twice more (2026-08-09, 2026-08-12) — are the concrete cost of
  getting slicing wrong: a matrix-row edit swept into a sibling's commit; a
  sibling's finished commit destroyed by another dispatch's `git reset
  --soft`; a shared-filename clobber; a staging-area sweep followed by an
  unverified reset; an unscoped `--amend` landing on a sibling's commit.
  (**Corrected 2026-09-06 after T1 Critic finding F-A:** this list previously
  dropped incident 1 and substituted an orphaned commit chain that the item
  does not contain.) Its remedies
  (per-task `dispatch-record-<taskId>.json`, the unverified-self-correction
  stop condition) reduce blast radius; they do not decide when to parallelize.

**What the enforcement surface actually looks like today** (measured, not
assumed — every claim below was read from the file named):

| Fact | Source | Consequence for this design |
|---|---|---|
| `guard-dispatch.mjs` matcher is `Task\|Agent\|Workflow`, live | `hooks/hooks.json:7` | Every dispatch decision already passes through a hook this repo owns. |
| `guard-dispatch-budget.mjs` matcher already includes `TodoWrite` and `Task`, live | `hooks/hooks.json:18` | A tool payload carrying plan shape is **already** routed to a hook. No new wiring is needed to *observe* it. |
| A PreToolUse payload carries `transcript_path`; parent dirname `subagents` distinguishes a dispatched subagent from the orchestrator | `guard-dispatch-budget.mjs` header (empirically confirmed 2026-08-27) | The mechanism can target the Elephant only, and must. |
| `hooks.json` is TP-4 protected **and** on `NEVER_LIFTABLE_KERNEL_PATHS`; no signed window lifts it. The route is an attended operator tool run by the PO outside the session (precedent: `harness/scripts/wire-dispatch-budget-hook.mjs`) | `guard-dispatch-budget.mjs` header; `templates/prompts/agent-obligations.md` §2 | Any *new* hook file costs a PO ceremony. Folding into an existing hook body costs none. |
| `additionalContext` has five emitters in this repo: four under `hookEventName: "SessionStart"` (`staleness-check.mjs`, `codex-session-start-hint.mjs`, `setup-check.mjs:248`, `post-compact-reground.mjs:274`) and one under `"Stop"` (`stop-suggest.mjs:306,386`). There is no `PreToolUse` emitter; the only PreToolUse structured-output precedent is `permissionDecision: "deny"` (`codex-pretool-guard.mjs`) | direct grep, corrected 2026-09-06 after T1 Critic finding F2 — an earlier revision of this row claimed "only under SessionStart", which was false and missed three emitters | **There is no `PreToolUse` non-blocking, model-reaching precedent in this repository.** This remains the single largest risk to the PO's preferred increment; see Decision 1. Note the correction cuts against this document elsewhere: `stop-suggest.mjs` IS a live non-blocking `additionalContext` emitter, so the tension section's "every piece of evidence comes from blocking delivery" is weakened — availability is still not effect, so it is weakened rather than refuted. |
| `TodoWrite` has zero mentions in `roles/elephant.md` and `docs/operating-model.md` | direct grep, 2026-09-06 | Plan-shape visibility is ambient tool behaviour, not a contracted practice. The prospective trigger is opportunistic, not guaranteed. |

**The PO's scope input (2026-09-06).** For a first iteration, a *mechanically
delivered* briefing — one the agent reliably receives, repeatedly, at the moment
it matters — may be sufficient; mechanical *proof* of compliance is explicitly
not required yet. This design takes that seriously as the preferred first
increment and evaluates it honestly rather than endorsing it by default (see
*The tension*).

---

## Decision

Five decisions. Decisions 2–5 answer the item's four open questions; Decision 1
is the precondition that determines whether the PO's preferred increment is
implementable at all.

### Decision 1 — The delivery channel is the first thing to settle, and it is currently unproven

"Mechanically delivered briefing" is only meaningful if the text reaches the
**model**, not the operator's pane. In Claude Code's hook contract, exit 2
stderr is fed back to the model; other non-zero exits surface stderr to the
human. `guard-dispatch.mjs`'s own header calls exit 1 "allow with a warning" —
but a warning read by the PO is exactly today's failure mode restated, because
today's failure mode *is* "the PO notices and corrects it live."

The channel decision, in preference order, each to be **confirmed empirically
before it is built on**:

1. **PreToolUse `hookSpecificOutput.additionalContext` on exit 0.** The
   structurally correct answer: non-blocking, model-reaching, attached to the
   exact tool call. **No `PreToolUse` precedent in this repository** — of the
   five `additionalContext` emitters here, four are `SessionStart` and one is
   `Stop` (`stop-suggest.mjs:306,386`, non-blocking); none is `PreToolUse`.
   (**Corrected 2026-09-06 after T1 Critic finding F-B:** this said
   "SessionStart-only", the same claim the risk table above had already been
   corrected for in round 1 — the correction had not reached the normative
   Decision section a reader arrives at first.) Confirm against the live
   runner first.
2. **PostToolUse `additionalContext` on the same tool call.** Arrives one beat
   later — after the first dispatch of the batch, before the second. Acceptable
   for the retrospective trigger, weaker for the prospective one.
3. **If neither is confirmed to reach the model, a non-blocking increment 1 is
   not implementable, and the design must say so rather than ship a nudge into
   the void.** The smallest model-reaching form that remains is *block once,
   admit an identical retry* — which is Decision 5's increment 2 (disclosure
   enforcement), not increment 1. In that case the honest report to the PO is:
   "delivery-only is not available on this runner; the cheapest real mechanism
   is a one-time disclosure block," and the PO re-decides.

This is stated as a decision rather than an assumption because building
increment 1 on an unverified channel would produce a mechanism that *looks*
delivered, is unit-testable, passes review, and changes nothing — the most
expensive possible outcome for an item whose whole premise is that a previous
"we told it" measure failed.

### Decision 2 — What counts as a standard slice-able batch: the Parallel-Safety Predicate

A batch is slice-able **iff all four conditions hold**. Each is decidable from
the briefings themselves, without running anything.

- **PSP-0 — Size.** N ≥ 3 briefable work packages held simultaneously. Below 3
  the coordination cost (worktrees, record reconciliation, the post-round
  orphan-chain check `workflow-dispatch.md` mandates) exceeds the saving. N = 2
  is permitted but never nudged for.
- **PSP-1 — Write-scope disjointness.** The *declared write scope* of each
  package is pairwise disjoint, **and** disjoint from a fixed shared-surface
  denylist. The denylist is not abstract; it is the actual collision set from
  the 2026-08-07 incidents plus the files every session touches:
  `docs/state.md`, the backlog ledger, `docs/adr/README.md`, any handover file,
  any acceptance/tracking matrix document, and — the general rule that
  subsumes the specific ones — **any path appearing in more than one package's
  write scope**. This requires briefings to declare write scope
  *affirmatively*; today field 4 lists prohibitions and no-go paths, not an
  allowlist. See *Consequences* for that cost.
- **PSP-2 — No dependency edge.** No package's field 2 (Context files) names a
  path that another package declares in its write scope. A detected edge means
  the pair must be sequenced (`pipeline()`), not parallelized.
  **Corrected 2026-09-06 after T1 Critic finding F3:** an earlier revision
  called this "the check that replaces 'use judgment'" on the ground that
  "both sides are already written down in the canonical 6-field briefing".
  Only one side is. Field 2 (Context files) supplies the *read* set; field 4
  is **Forbidden** — prohibitions, not an affirmative write scope
  (`templates/prompts/goldfish-task.md`). Until the template gains a declared
  write scope (Next steps step 7, explicitly out of scope for increment 1),
  PSP-2 is a check the Elephant performs with the write set it must supply
  itself — better than unaided judgment because it names what to compare, but
  not mechanically decidable from today's briefings. Consequences below states
  the same limit; this sentence previously contradicted it.
- **PSP-3 — Commit-surface isolation.** At least one of: every slice runs
  `isolation: "worktree"`; **or** at most one slice commits and the rest hand
  back diffs; **or** the round is sequenced so exactly one commit is in flight
  at a time. The git index is a shared mutable resource that PSP-1 does not
  cover, and the 2026-08-07 item carries two occurrences that show it with
  **clean PSP-1 file scopes**: 2026-08-09 (`PHX-WP-DOC-1`/`-2`, "both writing
  prose to disjoint *primary* doc files but sharing the one physical
  checkout" — "the *shared* surface was the working tree's staging area
  itself, not a named shared file", item `:128-136`), and 2026-08-12
  (`AR05G`/`FAILCLOSED`, disjoint primary files; an unscoped
  `git commit --amend` landed on the *other* dispatch's commit, item
  `:158-176`). **Corrected 2026-09-06 after T1 Critic finding F-A:** this
  previously cited incident 2 of the 2026-08-07 wave and an orphaned commit
  chain. Both citations were wrong, and in the direction that flattered the
  claim. Incident 2's own trigger was `#12`/`#14` material in the shared tree
  and index (item `:46-50`) — the acceptance/tracking matrix, a file this
  document's own PSP-1 denylist names — so it is a PSP-1 breach cascading into
  commit-surface loss, not a clean-PSP-1 case. The orphaned commit chain
  appears nowhere in that item at all. PSP-3 is still grounded; it was cited
  from the wrong two incidents.

**Deliberately not a condition: "each slice is independently verifiable by
running its verify command."** That is the right idea and the wrong mechanism —
checking it means executing every slice's suite before dispatching any of them,
which costs more than the parallelism saves. It is downgraded to a declarative
form folded into PSP-2: *no slice's verify command may reference another
slice's write scope.* Stated here rather than quietly dropped, because a Critic
should be able to see that the strong form was considered and priced.

**PSP is the answer to the item's "must not force parallelism onto dependent
work" requirement.** The predicate is conjunctive and defaults to *not
slice-able*: any unsatisfied condition, and any package whose write scope is
undeclared or unresolvable, makes the batch sequential. The mechanism never
asserts "this is safe to parallelize"; it asserts only "nothing here proves it
unsafe, and the count is high enough to be worth the Elephant re-checking."
Getting PSP wrong in the permissive direction reproduces the 2026-08-07 losses,
so the failure it is tuned toward is the false negative — a missed parallel
opportunity, which costs time and nothing else.

### Decision 3 — Where the enforcement lives: a stateful hook, reading two different signals

**Why a per-call PreToolUse guard cannot see the shape of the plan — and what
part of it it *can* see.** The item's own framing is right for a *stateless*
guard: one `tool_input`, no cross-call memory, no view of a batch. But the
guard union in this repository is not stateless. `.git/agent-pipeline/` already
holds sixteen hook-owned state directories (`dispatch-budget`,
`worktree-count-checks`, `session-descriptors`, …), and
`guard-dispatch-budget.mjs` already counts a dispatched agent's tool uses
across calls. A hook with a session-scoped ledger therefore sees plan shape in
two distinct ways, and it is worth being precise about which:

- **Prospectively, when the plan passes through a tool payload.** A `TodoWrite`
  call's `tool_input` *is* the plan, in structured form, and `TodoWrite` is
  **already** in a live `hooks.json` matcher. This is genuine plan-shape
  visibility with no new wiring. Its limit is honest and material: `TodoWrite`
  is nowhere required of an Elephant (zero mentions in `roles/elephant.md` and
  `docs/operating-model.md`), so this signal is opportunistic. How often it is
  actually present is the ledger's first measurable finding.
- **Retrospectively, from the executed dispatch stream.** K consecutive
  single-dispatch calls in one session with no intervening fan-out is the
  observable footprint of a sequentially-worked batch. **This signal is
  inherently one batch late** — for a batch of exactly K it fires after the
  work is done, and its value is only the *remaining* items. Stated plainly
  rather than left for a Critic to find: the retrospective trigger cannot
  prevent the first K sequential dispatches, by construction.

- **Structurally, at the one moment the whole batch is in a single payload.**
  A Workflow fan-out script is the only tool call whose `tool_input` contains
  *every* briefing in the round at once — and `extractWorkflowDispatches()`
  already recovers each embedded `agentType`/`prompt` pair from it, already
  wired via the live `Task|Agent|Workflow` matcher. That makes **PSP-1 and
  PSP-2 hook-evaluable across the whole set, at exactly the moment a parallel
  round launches**: write scopes can be intersected pairwise, and each
  briefing's field 2 can be intersected against every other's write scope, from
  one payload. This is where a future *safety* check belongs — refusing a
  parallel round whose slices collide, which is the one direction in which a
  hard block is legitimate, because it blocks *unsafe parallelism* and never
  forces parallelism onto sequential work. **Explicitly not increment 1**, and
  not authorized here; recorded because it is the concrete answer to "is PSP a
  real check or an instruction to the Elephant" — it is a real check, and this
  is the surface that could run it.

**Fan-out means either tool, not just Workflow.** The item says "Workflow tool
or comparable subagents". Fan-out is recognized as: ≥2 `agent()` calls
statically recoverable from one Workflow script (`extractWorkflowDispatches()`
already does this recovery, and it is already wired), **or** ≥2 `Task`/`Agent`
dispatch calls in the same turn. Recognizing only the Workflow shape would
penalize an Elephant that parallelizes correctly via the Agent tool — a
false-positive class the mechanism must not create.

**Placement.** A new hook, `guard-slicing.mjs`, wired under the existing
`Task|Agent|Workflow` and `…|TodoWrite|…` matchers. Two honest routes:

- **Clean (recommended).** New hook file + unit test + one `hooks.json` edit.
  `hooks.json` is TP-4 and kernel-protected: the edit **cannot** be made
  in-session by any override, signed or not. It needs an attended operator tool
  run by the PO outside the session — precedent
  `harness/scripts/wire-dispatch-budget-hook.mjs`. This is a known, bounded,
  previously-paid cost, and the follow-up dispatch must be briefed knowing it.
- **Zero-ceremony fallback.** Fold the logic into `guard-dispatch-budget.mjs`
  (already matches `Task` and `TodoWrite`) or `guard-dispatch.mjs` (already
  matches `Task|Agent|Workflow`). Neither hook body is TP-protected, so this
  needs no ceremony at all — at the cost of giving an existing single-purpose
  guard a second responsibility.

Recommend clean; name the fallback so a PO ceremony delay never blocks the
experiment.

**Orchestrator-only, always.** The hook must fire only for the top-level
session. `guard-dispatch-budget.mjs` established the discriminator empirically:
a dispatched subagent's `transcript_path` sits under a directory literally
named `subagents`; the orchestrator's never does. A slicing nudge delivered to
a Goldfish is noise at best, and at worst an invitation for a subagent to
dispatch — which the role definitions deliberately make impossible
(`workflow-dispatch.md`, "Only the Elephant orchestrates fan-out").

### Decision 4 — The trigger, and why the alternatives lost

**Chosen: a two-signal trigger, rate-limited.**

- **Primary (prospective):** a `TodoWrite` payload whose `pending` set has ≥ 3
  items. Fires once per distinct pending set (hashed), never again for the same
  set.
- **Backstop (retrospective):** the **3rd** consecutive single-dispatch call in
  a session with no intervening fan-out. Fires once per run; any recognized
  fan-out resets the run.
  **Corrected 2026-09-06 after T1 Critic finding F4:** this said "2nd", which
  contradicted PSP-0 ("N = 2 is permitted but never nudged for") — the
  backstop would have nudged on an observed two-item run that the predicate
  itself declares out of scope. Raised to the 3rd so the retrospective
  trigger and PSP-0 name the same threshold. The implementation must not
  re-introduce a second threshold: PSP-0's N is the single source.

**Two build decisions taken 2026-09-06, after the first build dispatch
stopped on them.** Recorded here rather than in a briefing so the next
dispatch inherits them as design, not as an Elephant's aside.

- **`extractWorkflowDispatches()` cannot be imported as it stands, and the
  fix is an enabling change, not a workaround.** The function
  (`guard-dispatch.mjs:59`) is not exported, and the module's top-level
  reads stdin and calls `process.exit(0)` unguarded (`:100-105`) — importing
  it kills the importing process. This was verified directly, not taken on
  report. The resolution is to export it and gate the top-level with
  `isDirectInvocation(import.meta.url)` from `lib/entrypoint.mjs`, exactly as
  the sibling `guard-dispatch-budget.mjs:532` already does. A mirrored local
  regex copy is **rejected**: two extractors for one grammar is the drift
  this repository has been paying down elsewhere. That change ships as its
  own package, before the slicing build, because it touches a live guard —
  and `lib/entrypoint.mjs`'s own header records a measured incident where a
  naive entrypoint check silently disarmed six hooks, so the enabling change
  must prove the guard still fires, including through a symlinked
  marketplace root.
- **A `Workflow` tool call always resets trigger A's run, regardless of how
  many dispatches are recovered from its script.** `extractWorkflowDispatches()`
  is regex-based and under-recovers `${...}`-interpolated prompts, so a
  recovered count of 0 or 1 does not mean the script fans out to fewer than
  two agents. Counting it as sequential work would produce a *wrong nudge*;
  over-resetting produces only a *missed* nudge. The design's whole posture
  is to fail toward silence — a nudge that fires wrongly becomes noise the
  model learns to skip, which is the failure this mechanism exists to avoid.
  So the reset does not depend on the recovered count at all.

**Open parameter — RESOLVED 2026-09-06, and not by fixing the number.**
This section previously said fan-out recognition ("≥2 `Task`/`Agent`
dispatch calls in the same turn") has no turn-boundary field available to a
`PreToolUse` hook, so the only available detection is a timestamp window
whose width an implementation dispatch must be briefed with. **Both halves of
that were wrong.** Measured, not argued:

- **A timestamp window does not work at all.** Over 226 dispatch calls in
  this repository's own transcript, same-turn gaps run 6.2–36.8s (streaming
  spreads one message's tool calls over real time) while cross-turn gaps
  start at 13.6s. The populations **overlap**, so no threshold separates
  them. Had the implementation been briefed to pick a width, it would have
  been asked to tune a discriminator that cannot discriminate.
- **A turn boundary is available, and it is exact.** A `PreToolUse` payload
  carries `transcript_path` — `guard-dispatch-budget.mjs` already consumes
  it (`:192`, `:428`). Transcript rows carry `message.id`, which groups tool
  calls by assistant message, i.e. by turn. Over the same 197 dispatch-
  bearing messages: 179 carry exactly one dispatch call, 18 carry two to
  four. Fan-out is an **identity match on `message.id`**, not a threshold —
  so it has no false-positive rate to tune, and Decision 3's false-positive
  concern does not arise for this trigger at all.

**Consequence for the build:** implement fan-out recognition by grouping the
transcript's dispatch calls on `message.id`. Do not implement a timestamp
window; do not add a tunable width.

**One caveat the implementation must respect rather than assume away:**
whether the *current* tool call is already written to the transcript when
`PreToolUse` fires is NOT established here. It does not need to be. Both
triggers are retrospective by construction — the consecutive-single-dispatch
run looks at completed turns, and the fan-out reset only needs a past turn to
have been recognized. An implementation that requires the in-flight call to
be visible has changed the design and must say so.

**Measurement scripts, and the honest limit of this evidence.**
`backlog/evidence/2026-09-06-fanout-window-measurement.mjs` and
`backlog/evidence/2026-09-06-fanout-msgid-grouping.mjs` are tracked, so the
**method** is durable and re-runnable. The **input** is not: it is a
machine-local Claude Code transcript that this repository does not and should
not contain. The numbers above are therefore a recorded measurement, not a
result a reader can reproduce from the repository alone — a reader can re-run
the same analysis against their own transcript and check whether the same
separation holds. (Corrected 2026-09-06: these were first cited at their
`scratch/` paths, which are gitignored, so the citation pointed at nothing a
reader could open.)

**Rate limiting is part of the trigger, not a refinement.** A nudge on every
dispatch becomes ambient noise the model learns to skip — the identical decay
profile as the static documentation this item exists to replace. A mechanism
that fires unconditionally would rediscover the failure it was built to fix.

**Rejected alternatives, with reasons:**

- *A fixed item-count threshold over the backlog/queue.* Nothing puts the queue
  in a tool payload; the hook would have to read and interpret repository state
  to guess at intent. High false-positive rate (an open backlog is not a
  planned batch).
- *A detected batch of same-shaped items.* Shape-similarity is a heuristic over
  content, not a decidable property, and it is orthogonal to safety: three
  identically-shaped items with one dependency edge are not slice-able, and
  three differently-shaped independent ones are.
- *An explicit user cue.* This is the status quo. The PO having to notice the
  sequential pattern and say "mehr parallel" (the PO's on-record German phrase;
  "more parallel") **is the complaint**.
- *A session-start declaration ("state your slicing plan before any dispatch").*
  Fires at the moment of least information — before the batch exists — and
  becomes a ceremony satisfied once and then drifted from. Same decay profile
  as static docs, with extra ritual.

### Decision 5 — What "enforced" means operationally: staged, and increment 1 is not a block

**Increment 1 (this proposal, matching the PO's stated preference).** A
*delivered default*, not a block: the hook fires at the decision point, states
the slicing default and the PSP conditions in the model-reaching channel of
Decision 1, and appends one record to a ledger. The Elephant remains free to
proceed sequentially with no justification. Nothing is refused.

**Increment 2 (proposed escalation path, explicitly NOT authorized here).**
Mandatory *disclosure*, still not a block on sequential work: field 6 of the
Goldfish briefing template gains a required line —

```
Slicing: batch <batch-id> · size N · mode parallel|sequential · reason <one line>
```

— checked by `dispatchFindings()` in `plugins/pipeline-core/lib/dispatch-policy.mjs`,
which `guard-dispatch.mjs` already calls on every `Task|Agent|Workflow` call.
**This reuses existing enforcement surface entirely: no new hook, no
`hooks.json` edit, no PO ceremony.** It is a hard block on a *missing
disclosure*, never on choosing sequential — and it gives the ledger something
to cross-check, since a disclosed `mode: parallel · size 4` that is followed by
four consecutive single dispatches is a mechanically detectable divergence.

**Rejected: a hard block on proceeding without slicing.** Three independent
reasons, any one sufficient. (i) The guard cannot prove the batch was
slice-able — it sees footprint and counts, never the dependency structure PSP-2
needs, unless every briefing is already written. Blocking on a count alone
refuses legitimately-sequential work, which is precisely the failure mode the
item names as "at least as bad as the current gap." (ii) Under **EL-16**
(delegate-first: every execution-phase implementation is a briefed Goldfish
dispatch), a block on dispatch is a block on all execution work — the blast
radius of a false positive is the whole session. (iii) The 2026-08-07 item
records five incidents of what happens when parallel dispatch is chosen
without the predicate holding — three in the 2026-08-07 wave plus recurrences
on 2026-08-09 and 2026-08-12. All five attributed, none left over: incidents
1 and 3 are PSP-1 (a shared matrix row; a shared `dispatch-record.json`
filename); incident 2 is a PSP-1 breach that cascaded into commit-surface
loss; 2026-08-09 and 2026-08-12 are the two clean PSP-3 failures. A mechanism
that *pushes* toward
parallel while a human is the only thing evaluating the predicate is buying
the sequential complaint with a race-condition regression.
**Corrected 2026-09-06 after T1 Critic finding F5:** this read "four
incidents … without PSP-3 holding" — the count matched no reading of the
item, and attributing all of them to PSP-3 over-claimed, since two are PSP-1
failures on this document's own taxonomy. The argument does not turn on the
number; the citation was simply wrong and is now corrected.
**Corrected again 2026-09-06 after T1 Critic finding F-A:** the F5 fix got
the count right and the attribution still wrong — it credited incident 2 and
an "orphaned chain" to PSP-3 and left the 2026-08-09/08-12 recurrences
unattributed entirely. Two rounds on one citation; the lesson is that fixing
a number is not the same as re-reading the source.

**Consistency with EL-16 and EL-18, stated explicitly as the DoD requires:**

- **EL-16** is *satisfied and strengthened*, not strained. EL-16 already
  mandates delegation for execution work and mandates bundling for small
  interlinked packages ("context economy through bundling, never through
  self-implementation"). Slicing a batch into parallel dispatches is the same
  principle applied one level up. Crucially, EL-16 exempts *design-phase*
  thinking from delegation — so the PSP evaluation itself, being a judgment
  about plan structure, stays Elephant work and is never delegated. The
  mechanism informs that judgment; it does not perform it.
- **EL-18** ("one repo, one elephant") governs Elephant sessions, not Goldfish
  dispatches, so parallel Goldfish work does not violate it as written. But its
  *rationale* — two concurrent writers in one working tree is the bull in the
  china shop — is exactly the 2026-08-07 damage. **PSP-3 is the bridge:** it
  extends EL-18's rationale to the dispatch layer by requiring that concurrent
  slices never share a commit surface. A parallel round satisfying PSP-3 has at
  most one writer touching the index at a time, which is what EL-18 is actually
  protecting.

---

## The tension: the PO's first increment vs. the item's acceptance criterion

The backlog item's acceptance criterion 2 reads: *"The mechanism is mechanically
checkable (a guard, a test, or an equivalent enforced artifact) — not solely a
new sentence in CLAUDE.md/`docs/operating-model.md`."* The PO's 2026-09-06 scope
input asks for reliable *delivery* with no compliance proof. **These are in
tension, and naming it precisely matters more than resolving it cleverly.**

**Is decision-point delivery genuinely different in kind from the static
documentation that already failed? Partly — and the honest answer has two
halves.**

Yes, in three specific respects, and they are not cosmetic:

- **Timing.** It arrives at the dispatch tool call, not at session start —
  at the moment of the decision rather than tens of thousands of tokens before it.
- **Repetition.** It fires on every qualifying event, so context decay cannot
  erode it. A document read once at bootstrap competes with everything read
  since; a hook does not.
- **Placement.** It arrives in the tool-result channel adjacent to the action,
  which the session must process to proceed, rather than in a file it may
  choose not to re-open.

This is the same difference that made `guard-dispatch.mjs` worth building:
"The templates were correct; nothing required using them. This is the reader
they were missing."

**No, in the respect that decides whether it works.** It changes *delivery
reliability*, not *compliance*. It converts "may never be read" into "is always
read"; it does not convert "may be ignored" into "cannot be ignored." And here
is the uncomfortable part of the record: **every piece of evidence this
repository has that decision-point delivery changes behaviour comes from
*blocking* delivery.** `guard-dispatch.mjs` blocks. `templates/prompts/agent-obligations.md`
opens by saying agents learned these rules "by being refused." There is **zero
recorded evidence in this repository that a non-blocking decision-point
message changes an Elephant's default.** The PO's preferred increment is a
plausible and cheap hypothesis, and it is an *untested* one by this repo's own
standards of evidence.

**Narrowed 2026-09-06 after T1 Critic finding F2.** The sentence above
originally rested on a survey that missed three `additionalContext` emitters,
one of which — `stop-suggest.mjs:306,386`, under `hookEventName: "Stop"` — is
a live, *non-blocking* emitter. So this repository does carry a non-blocking
`additionalContext` mechanism in production; what it does not carry is any
recorded evidence about whether that mechanism *changes behaviour*. The claim
survives in its load-bearing form — effectiveness is unevidenced — but not in
the stronger form that non-blocking delivery is unprecedented here. Anyone
building increment 1 should read `stop-suggest.mjs` first: it is the closest
existing thing to what this design proposes.

**Recommendation: follow the PO's lighter option — and amend the item's
acceptance criteria in the same act, not silently.**

Follow it because it is cheap, reversible, strictly better than the status quo
even if the hypothesis is weak (the ledger exists either way), and because
increment 2 is a small, surface-reusing step from it rather than a rewrite. But
the ledger is then not optional garnish: **it is the experiment's only
instrument.** Without it, a delivery-only mechanism cannot be distinguished
from having done nothing, and this item would close on the same kind of
unfalsifiable claim that the documentation-only attempt already made.

If increment 1 is built, acceptance criterion 2 must be amended to something
like:

> The mechanism is a unit-tested hook that fires deterministically at the
> dispatch decision point through a channel empirically confirmed to reach the
> model, and records a machine-readable slicing-decision ledger. Compliance
> *enforcement* (a disclosure requirement or refusal) is explicitly deferred to
> a second increment, for which this ledger is the evidence base. A review of
> the ledger after a stated observation window decides whether increment 2 is
> needed.

Written down because the alternative is worse than either option: marking the
current criterion "met" by a mechanism that enforces nothing would leave the
record claiming an enforced mechanism the repository does not have — the exact
divergence between record and built thing that the 2026-09-01 read-containment
incident (`draft-read-scope-containment-boundary.md`) already cost this
repository once.

---

## The cheapest visibility measure: a slicing-decision ledger

Visibility is not enforcement, and this deliberately does not block anything.
The cheapest possible form has one defining property: **the agent does nothing.**
The hook is already running and already computing the trigger; appending one
line is marginal, and no briefing, template or role contract changes.

- **Location:** `.git/agent-pipeline/dispatch-slicing/<session-id>.jsonl`.
  This is machine-regenerated, never gate-cited evidence, and it follows the
  sixteen existing hook-state siblings in the same directory rather than
  inventing a convention. Note honestly:
  [ADR-0063](0063-repository-directory-contract.md)'s tracked/ignored split
  names the ignored root `evidence/` for machine-regenerated material and does
  not itself name `.git/agent-pipeline/`; the placement here rests on the
  hook-state precedent, and the implementation dispatch should confirm the
  directory contract admits it rather than assuming this ADR settled it.
- **Record shape (one JSON object per line):**
  `{ ts, sessionId, event, tool, agentType, fanout, pendingCount, batchHash,
  advisoryEmitted, channel }` — where `event` is `todo-plan` | `dispatch` |
  `fanout`, `fanout` is the recognized parallel-shape boolean, and `channel`
  records which delivery route of Decision 1 was actually used.
- **Read surface:** one read-only reporter script summarizing a window —
  qualifying batches observed, how many went parallel, how often a prospective
  (`TodoWrite`) signal was available at all. Three numbers, and they are exactly
  the three a later reader needs to answer "is this working?"

What the ledger deliberately does **not** claim: it records the *observable
footprint* of the slicing decision, never the decision itself or its
correctness. A session that goes sequential for entirely correct reasons (a
real dependency edge) is indistinguishable in the ledger from one that simply
forgot. That is acceptable at increment 1 — a trend across many sessions is
still informative — and it is exactly the gap increment 2's disclosed `reason`
would close.

---

## Alternatives considered and rejected

Beyond the trigger alternatives in Decision 4 and the hard block in Decision 5:

1. **Documentation only** — another paragraph in `CLAUDE.md` or
   `docs/operating-model.md`. **Rejected on the item's own recorded evidence:**
   the guidance already exists in three places and the 2026-08-29 session still
   ran serial until corrected live, twice. This repository's standing lesson is
   explicit: "a violated rule needs a guard, not another paragraph of prompt."
   Recording this rejection explicitly because a delivery-only increment can be
   *mistaken* for documentation-only, and the distinction (Decision 1's channel)
   is the entire difference between them.
2. **An auto-slicing driver** — a script that reads the backlog or todo list,
   computes the slices and emits a Workflow script itself. **Rejected for this
   increment**, kept as a possible increment 3 with human confirmation. It would
   have to author briefings, which is EL-05/EL-16 Elephant judgment work, not
   mechanical work; and a wrong auto-slice lands directly in the 2026-08-07
   incident class with no human in the loop. Automating the *decision* before
   the *predicate* has ever been measured is the wrong order.
3. **Making parallel the default in the agent definitions** — e.g. a
   `goldfish-*` definition or tool default that fans out. **Rejected:** not an
   available surface (fan-out is Elephant-invoked by construction; the
   `goldfish-*`/`critic` definitions are tool-scoped to exclude Agent/Workflow
   entirely), and it forces parallelism, which is the named failure mode.
4. **A `Stop`-hook retrospective report** — summarize slicing behaviour at
   session end instead of nudging during. **Rejected as the primary mechanism**
   (it cannot change the session it observes) but noted as a cheap, additive
   consumer of the same ledger if the reporter script proves useful.

---

## Consequences

- **New surface required: yes, and it is stated plainly.** One new hook body
  (`guard-slicing.mjs`) plus its unit test, plus one `hooks.json` matcher edit
  requiring an attended PO operator-tool run. Optionally one read-only reporter
  script. "Documentation only" is explicitly **not** an acceptable answer here,
  per the item's own evidence. The zero-ceremony fallback (fold into
  `guard-dispatch-budget.mjs`) trades design cleanliness for immediate
  landability.
- **One template change is implied and should be priced now, not discovered
  later:** PSP-1 and PSP-2 need an *affirmative* write-scope declaration in the
  Goldfish briefing (field 4 currently lists prohibitions, not an allowlist).
  Without it, PSP-2's dependency check has nothing to intersect field 2 against,
  and the predicate degrades to a count. This is a `templates/prompts/goldfish-task.md`
  edit, not a guard change, and it is useful independently of this item.
- **Risk of the mechanism itself:** a nudge that is delivered but never obeyed
  produces a ledger of ignored advisories — which is a *finding*, not a failure,
  and precisely the evidence increment 2 would be built on. The real failure
  mode to guard against is a nudge delivered to the operator instead of the
  model (Decision 1), which produces a ledger that looks identical while
  measuring nothing.
- **No conflict with the closed siblings.** This design operates upstream of
  `guard-dispatch.mjs`'s conformance check and inherits, rather than revisits,
  the 2026-08-07 remedies (per-task dispatch records, the
  unverified-self-correction stop condition).

---

## Addendum, 2026-09-06 (after this document was written): the channel question is answered

Step 1 below was run as a bounded documentation probe the same day, before
any build. **Result: the channel exists.** Per the current Claude Code hooks
reference, a `PreToolUse` hook may return
`hookSpecificOutput.additionalContext` together with
`permissionDecision: "allow"`; the context reaches the model and the tool
call is not blocked. `PostToolUse` supports the same field.

The probe also surfaced a trap this document did not anticipate: **for tool
events, stdout does NOT reach the model.** Exit 0 plus text on stdout is
ignored for `PreToolUse`/`PostToolUse`; only the structured
`hookSpecificOutput.additionalContext` field is delivered. (For
`SessionStart`/`UserPromptSubmit` it is the reverse — stdout is treated as
plain text and does reach the model, which is why this repository's existing
`SessionStart` precedents look the way they do.) A build that writes the
nudge to stdout would deliver it to the operator's pane only — precisely
today's failure mode in new clothing.

**Honest limit of this answer:** it is documentation-based, not measured on
this runner. Given that this same session found an installed guard copy
running stale and a documented denial code that no longer matched reality,
"documented" is not "verified here".

**Corrected 2026-09-06, after T1 Critic review (finding F1, major).** An
earlier revision of this addendum struck Next steps step 1 through and wrote
"the build may proceed", deferring the real check to whoever built step 2.
That was wrong on this document's own terms: Decision 1 makes empirical
confirmation a precondition *before* the channel is built on, and a deferral
with no named owner and no date is exactly what QG-06 classes as a finding
rather than a mitigation. Step 1 is re-instated as blocking below. This
addendum therefore narrows a *documented* claim only: the channel is
specified to exist and the stdout trap is real; whether it behaves that way
on this runner is still unmeasured.

**Why the probe is cheap after all** — the reason the deferral looked
attractive was an assumed cost that does not hold. Wiring a hook through the
repository's own `hooks.json` needs a PO-attended kernel-path ceremony, so a
throwaway probe hook appeared to cost one ceremony plus a second for the real
build. But a hook registered in the *user-level* settings file
(`~/.claude/settings.json`, which currently declares no `hooks` block at all)
sits entirely outside the repository and needs no ceremony. A one-off
`PreToolUse` entry there, emitting a distinctive marker string via
`hookSpecificOutput.additionalContext`, answers the question directly: either
the marker appears in the model's context on the next tool call or it does
not. It is reversible by deleting the entry, and it touches no repository
file. That is the recommended way to satisfy step 1.

This does NOT resolve the row above it in the risk table: that a *non-blocking*
message changes an Elephant's behaviour at all remains unevidenced in this
repository. The channel being available and the nudge being effective are two
different claims, and even after the probe only the first would be settled.

## Next steps

**What a follow-up implementation dispatch would need to build** — strictly in
this order:

1. **Confirm the delivery channel empirically — BLOCKING. PASSED 2026-09-06;
   see the result block at the end of this step.**
   Does a `PreToolUse` hook's exit-0
   `hookSpecificOutput.additionalContext` reach the model on this runner? If
   not, does `PostToolUse`? If neither, **stop and report**: the PO's chosen
   increment is not implementable as specified and needs a fresh decision.
   Steps 2–7 must not start until this is answered by observation.
   - **Owner:** the PO (the recommended form is a temporary `PreToolUse`
     entry in `~/.claude/settings.json`, outside the repository, needing no
     ceremony — see the addendum above). An agent cannot edit that file's
     hook configuration on the PO's behalf.
   - **Pass condition:** a distinctive marker string emitted through
     `hookSpecificOutput.additionalContext` is observably present in the
     model's context on the next tool call, with the call NOT denied.
   - **On failure:** this design's increment 1 is withdrawn, not adjusted;
     re-decide between a blocking delivery and a different channel.
   - **Method note, added 2026-09-06:** the probe session must be a genuinely
     fresh one, NOT `--continue` and not a session that has seen
     `scratch/kanalprobe-hook.mjs`. A session already carrying the marker
     string in its context is not a witness — it can name the marker without
     the hook ever having delivered it. The probe's matcher is `Read|Bash`,
     not `Read`: under the auto-mode instruction a session reads via
     `cat`/`sed -n` and a `Read`-only matcher can never fire, which would
     render as "marker nowhere" and trigger the withdrawal branch on a probe
     artifact rather than on the channel.

   **Static evidence gathered 2026-09-06 — strengthens the prediction, does
   NOT satisfy this step.** A read-only trace of the runner binary
   (`claude` 2.1.263, the version a fresh probe session would run) found the
   chain unbroken end to end: the `PreToolUse` variant of
   `hookSpecificOutput` accepts `additionalContext`; the normalizer preserves
   it (8000-character cap); it is mapped into `additionalContexts` and
   emitted as a `hook_additional_context` attachment; consumption drops it
   only for delegated subagents; and — the load-bearing find — the
   `hook_additional_context` renderer has **no event filter**, in explicit
   contrast to the sibling `hook_success` renderer, which returns `[]` for
   every event except `SessionStart`/`UserPromptSubmit`/`UserPromptExpansion`.
   Two live cross-event confirmations of that renderer were observed in the
   same session's own context: a `SessionStart hook additional context: …`
   line, and a `Stop hook additional context: …` line. The second one matters
   most, because it removes this document's weakest link — that `SessionStart`
   might be a special case. It is not; a non-`SessionStart`, non-blocking
   emitter demonstrably reaches the model here.

   **This is still not the pass condition, and is recorded as evidence rather
   than as clearance for a reason.** The pass condition names an observed
   marker on a `PreToolUse` call; what is now established is every link of
   that chain except the `PreToolUse` emission itself, which remains
   statically read only. Accepting a strong prediction in place of the stated
   observation is precisely the substitution T1 Critic finding F1 recorded
   against an earlier revision of this document — the evidence there was
   weaker, but the move would be the same one. The trace lowers the expected
   cost of the probe (the exact expected string is now known:
   `PreToolUse:Bash hook additional context: KANALPROBE-7X4K: …`); it does not
   replace it.

   It also does not touch the separate claim below: that a non-blocking
   message *changes behaviour*. The `Stop` observation shows delivery, not
   effect.

   ### Result — 2026-09-06: PASSED

   A `PreToolUse` hook's exit-0 `hookSpecificOutput.additionalContext`
   **does** reach the model on this runner. Observed string:

   > `PreToolUse:Read hook additional context: KANALPROBE-7X4K: if you can
   > read this marker, additionalContext reaches the model.`

   The probe ran in a session that already knew the marker string, which by
   itself would make it a weak witness. Three properties make the result
   sound anyway, and they are recorded because the verdict rests on them
   rather than on the marker's mere appearance:

   1. **A negative control emerged by accident and carries the result.** The
      installed matcher was the pre-correction `Read`, while the session was
      operating under an instruction to read via `cat`/`sed -n`. Roughly
      fifteen consecutive `Bash` calls produced **no** marker; the first
      genuine `Read` call produced it. The on/off pattern tracks the matcher
      exactly. A session inclined to confirm a string it already knew would
      not first report fifteen silent calls against its own expectation.
   2. **The rendered prefix is not in the probe script.**
      `PreToolUse:Read hook additional context:` is generated by the runner's
      renderer (`hookName` = `PreToolUse:${toolName}`). It was predicted from
      the binary trace *before* it was observed, and came back
      character-identical.
   3. **It fires on a failing tool call too** — the observed `Read` targeted a
      non-existent path. `PreToolUse` runs before execution, and the context
      is delivered regardless.

   **Residual caveat, and its removal.** As first recorded, this rested on
   one session's self-report — a session that already knew the marker. The
   negative control is what made it credible. That caveat is now closed by an
   accident better than any probe this design could have specified:

   An unrelated Goldfish dispatch (`NVA-B-VERIFYLANE-2`, a static audit of
   `SERIAL_LANE_SUITES` module scoping) ran while the hook was still
   installed. Its briefing said nothing about the probe, the hook, or the
   marker; it had no memory and no session history. Unprompted, in its final
   report, it flagged: *"a hook-injected marker (`KANALPROBE-7X4K`…) that
   appeared in two `Read` tool outputs — noted for the record only."*

   That is a witness in the strict sense the pass condition wanted and this
   document had given up on getting: fresh context, no knowledge of the
   probe, correctly identifying the string as **hook-injected** rather than
   as file content, and observing it on `Read` calls specifically — matching
   the installed `Read`-only matcher. It also confirms the consumption rule
   read out of the binary, that `additionalContext` is dropped only for
   *delegated* subagents: this one is not delegated, and it received the
   context.

   The step is therefore cleared on independent observation, not on a
   self-report plus inference.

   **Consequence:** steps 2–7 are unblocked. The withdrawal branch does not
   fire. The *separate* claim — that a non-blocking nudge changes an
   Elephant's behaviour — remains unevidenced and is unaffected by this
   result; increment 1 is built as a hypothesis to be measured by the ledger,
   not as a proven mechanism.

   **Method finding worth keeping:** the pre-correction `Read`-only matcher
   would have produced "marker nowhere" in essentially any auto-mode session
   and triggered the withdrawal branch on a probe artifact. The design's
   on-failure branch was one matcher string away from firing on nothing.
   - The 2026-09-06 documentation probe is supporting evidence for what to
     expect, never a substitute for this step.
2. **Two decisions the briefing must carry, not the dispatch guess.** Added
   2026-09-06 after T1 Critic finding F-C: both were stated in the body as
   must-fix-before-build but were missing from this ordered list, which is
   what a briefing gets assembled from.
   - ~~**Fix the fan-out detection window**~~ — **RESOLVED 2026-09-06, no
     window needed.** Measurement showed a timestamp window cannot separate
     fan-out from sequential work (the populations overlap), and that
     `transcript_path` + `message.id` gives an exact turn boundary instead.
     See the "open parameter" section above; the build implements the
     identity match, not a threshold.
   - **Confirm ADR-0063's directory contract admits
     `.git/agent-pipeline/dispatch-slicing/`** rather than assuming this
     document settled it. **Owner:** the implementation dispatch, as its
     first step; on refusal it stops and reports rather than choosing another
     location.
3. Implement `guard-slicing.mjs`: orchestrator-only (the `subagents`
   parent-dirname discriminator), the two triggers of Decision 4, the
   rate-limiting, and the ledger append. Fail-open on anything unparseable,
   matching every sibling guard's posture.
4. Unit tests covering, at minimum: orchestrator vs. subagent targeting; the
   `TodoWrite` ≥3-pending trigger and its per-batch-hash rate limit; the
   consecutive-single-dispatch run trigger and its reset on fan-out; fan-out
   recognition via **both** a Workflow script with ≥2 `agent()` calls and ≥2
   `Task` calls; the ledger record shape; and fail-open on malformed input.
5. The `hooks.json` wiring — an attended PO operator-tool run outside the
   session (`hooks.json` is kernel-protected; there is no in-session route).
   Brief this as a known PO handoff, never as something the dispatch can do.
6. Amend the backlog item's acceptance criterion 2 as drafted above, in the
   same work package that lands the mechanism, so record and built thing do not
   diverge.
7. **Not in scope, and must be briefed as such:** the affirmative write-scope
   template field, and increment 2's `Slicing:` disclosure line. Both are named
   here so they are visible decisions rather than surprises.

**Open questions and known weaknesses of this design** — the places it is
most likely to be wrong, recorded for any reader:

> *Retitled 2026-09-06 after T1 Critic finding F6.* This section previously
> told a Critic what to interrogate. That is the author framing the reviewer's
> search surface, which `roles/critic.md` reserves for the Critic — the same
> failure CLAUDE.md records for freehand Critic dispatches ("a review that
> only looks where you told it to look is not a second pair of eyes"), reached
> through the artifact instead of the briefing. Empirically it also failed to
> cover the surface: the review that found it raised three findings this list
> does not mention. The content below is legitimate ADR material as
> self-assessment; it is not an instruction to a reviewer.

- **The channel claim (highest value).** Is exit-0 PreToolUse
  `additionalContext` real on this runner, or did this design build an
  increment on a channel that only exists in the docs? Everything else is
  downstream. If the channel is not model-reaching, increment 1 is theatre.
- **Is PSP-2 actually decidable?** It assumes briefings exist *before* the
  slicing decision. If the Elephant decides to parallelize *before* writing the
  briefings, PSP-2 has nothing to read. Does the mechanism then degrade to a
  bare count — the thing Decision 4 rejected as a trigger?
- **Is the `TodoWrite` trigger load-bearing or decorative?** With zero mentions
  in `roles/elephant.md`/`docs/operating-model.md`, is the prospective signal
  present often enough to matter, or does the design effectively rest on a
  retrospective trigger that is admittedly one batch late?
- **Does the rate limiting undercut the "repetition" argument?** The tension
  section leans on unconditional repetition as what distinguishes this from
  static docs; Decision 4 then limits firing to once per batch. Are those
  consistent, or is this a nudge the session sees twice and then never again —
  i.e. static documentation with extra steps?
- **Is "≥2 `Task` calls in the same turn" actually observable?** A PreToolUse
  hook sees separate events with no turn-boundary field; the only detection
  available is a short timestamp window over the ledger, whose width is a
  tuning parameter this design does not fix. If that detection is unreliable,
  Agent-tool fan-out goes unrecognized and the mechanism nudges an Elephant
  that is already doing it right.
- **Is the three-item threshold defensible or arbitrary?** N ≥ 3 is asserted
  from coordination cost, not measured. Would the ledger even be able to tell?
- **Does anything here re-solve or contradict the closed siblings**, or create
  a path where a nudged parallel round can reach the 2026-08-07 incident class
  with PSP-3 unchecked?
- **Is the acceptance-criterion amendment an honest correction or a lowered
  bar dressed as one?** This is the judgment call the PO should see argued
  against, not just argued for.

## Implementation addendum — native Codex and Antigravity delivery (2026-09-07)

Increment 1 now has separate runner-native advisory adapters. They share only
bounded, private state under the existing git-common-dir helper; state paths
hash the runner session identity and retain hashes, counters, lifecycle IDs,
and invocation groups only. Prompts, transcript paths, and raw tool arguments
are neither logged nor stored. Any parse, storage, or hook failure exits
successfully without a decision, escalation, or child launch.

- **Codex.** `spawn_agent` and `update_plan` are observed through a separate
  `PreToolUse` registration. Three deduplicated serial `spawn_agent` call IDs
  trigger an exit-0 `hookSpecificOutput.additionalContext` advisory. Native
  `SubagentStart`/`SubagentStop` overlap resets that serial run, so a shared
  `turn_id` is never treated as proof of fan-out. This leaves the command and
  write safety adapter's supported-tool set unchanged. The documented channels
  are [Codex hooks](https://learn.chatgpt.com/docs/hooks).
- **Antigravity.** Native `invoke_subagent` arrays are observed before the
  safety adapter normalizes their name. `PreToolUse` carries no `invocationNum`,
  so the preceding `PreInvocation` establishes the active invocation group;
  documented `stepIdx` deduplicates retries and distinguishes separate native
  calls within it. Width >=2 is direct fan-out evidence, while separate calls
  in one invocation are aggregated before serial work is classified. The following `PreInvocation` emits only a due
  `injectSteps[].ephemeralMessage`, then begins the next group. The documented
  channels are [Antigravity hooks](https://www.antigravity.google/docs/hooks/)
  and [Antigravity subagents](https://www.antigravity.google/docs/subagents/).

Fixture tests exercise manifest registration through each native entrypoint,
its runner-native context output, retry deduplication, fan-out reset, malformed
input, and storage failure. They are not live model-delivery evidence. A
bounded live probe for the parent is: in a sanctioned disposable session,
perform three serial native subagent calls, observe the next runner-native
model-context hook payload, then repeat with a two-child fan-out and confirm
that no serial nudge is due. Record only the resulting sanitized pass/fail
receipt; do not capture prompts, transcripts, or session identifiers.
