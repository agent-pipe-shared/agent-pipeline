# Agent decision journal — where the production producer lives

**Status:** design pass, 2026-08-16. Answers the scoping question left open by
`backlog/items/2026-08-11-agent-decision-journal-has-no-production-producer.md`
("accepted, unassigned — needs a scoping/design pass before it can be sequenced").
No code is written or dispatched by this document.

**Predecessor:** `class-b-multi-dispatch-plan.md`, section *The unifying finding*,
which established the root cause and then correctly stopped, saying the remaining
question was "sized well above 'pick a Class B criterion and dispatch it'".

---

## 1. The question this document answers

Quoted from the backlog item's Proposal, unchanged:

> should this repository grow a real integration point between live agent sessions
> (this conversation, a Goldfish dispatch, a Critic review) and its own
> governance/journal/lifecycle event stores, and if so, where does that integration
> point live and who builds it first?

## 2. The answer, and why the premise needed splitting first

**The premise "the decisions happen at the chat-harness level, outside the repo"
is true for orchestration and false for the journal.** That conflation is what made
the question look bigger than it is, and separating the two halves is the whole
contribution of this pass.

- **Orchestration** — which agent is dispatched, with which briefing, in what order —
  genuinely happens outside this codebase. `class-b-multi-dispatch-plan.md` proved
  this for L-AC-01 by ruling out both candidate producers at source. Nothing here
  changes that finding, and this document does not propose an in-repo orchestration
  layer.
- **Guard and gate decisions** — refusing a command, offering a human a copy-only
  command, admitting an override, consuming an approval — happen **inside this
  repository's own code**, in hooks and scripts that execute during real agent
  operation. That is an integration point that already exists and already runs. It
  does not need to be created; it needs to be tapped.

So the answer to "should this repository grow a real integration point" is: **for the
journal, it does not need to grow one — it needs to use the one it already has.**

## 3. Evidence that the `command-offer` shape was designed for exactly this seam

Read from source rather than inferred from the criterion text:

1. **The mandatory omissions match a hand-off, not an execution.**
   `validateCommandOfferEvent` (`plugins/pipeline-core/lib/agent-decision-journal.mjs:154`)
   requires `omissions` to contain all four of `raw-command`, `arguments`,
   `private-coordinates`, `unrestricted-output`. The event is structurally incapable
   of recording the command it describes. That is the shape of "the pipeline handed a
   human a command", not "the pipeline ran something".
2. **`offerOrigin` has exactly the two values a guard produces.**
   `"pipeline-initiated"` and `"user-requested-pipeline-supplied"` — a guard refusing
   an agent action and volunteering a recovery command, versus a guard rendering the
   command a human asked for. There is no third shape in the enum because there is no
   third shape in the guard family.
3. **Every transition is already implemented; only the first event is missing.**
   `external-command-offer.mjs` exports the attempt, acknowledge, recovery and outcome
   transitions (lines 27, 71, 102, 148, 158), each taking an existing `offer` and
   producing the next event. The module is a complete state machine whose initial
   state nothing ever constructs.
4. **An audit append path already exists in the same family.**
   `human-guard-override.mjs` writes an `audit.jsonl` (line 315) through a fsync'd
   write helper (line 342), and the repository already carries a populated
   `.claude/guard-override.log.jsonl`. Appending a journal event is not a new
   capability for this code; it is a second consumer of a write path it already owns.
5. **The seam fires often, in ordinary operation.** The 2026-08-16 session alone
   triggered three distinct guard hand-offs that each returned an `external-operator`
   copy-only command for a human to run (a shell-grammar refusal, a cross-repo write
   refusal, and the GS-2 refusal on the gate-strength policy file). None was recorded
   anywhere machine-readable.

## 4. What this closes, stated per event kind rather than per criterion

The backlog item groups four criteria under one root cause, which is correct as a
diagnosis but misleading as a plan: the module validates **three independent event
kinds**, and a producer for one does not produce the others.

| event kind | criteria it can satisfy | producer candidate | confidence |
|---|---|---|---|
| `command-offer` | **R-AC-08** (rollback/cleanup as occurred events) | the human-guard-override / external-operator hand-off | high — evidenced in §3 |
| `agent-decision` | **A-AC-01** (record before dependent action), **A-AC-05** (selection/escalation/fallback identity) | the continuity course-decision machinery (`continuity-select-course`, `continuity-apply-decision`) | medium — needs its own scoping step, see §6 |
| `legacy-import-observation` | **H-AC-08** | none identified | low — see §5 |

A-AC-01 additionally requires ordering (*record before the dependent action*), not
merely recording. The guard seam is unusually favourable for that: a PreToolUse hook
runs **before** the action by construction, so "record before dependent action" is
the natural control flow there rather than something to retrofit. That is an argument
for starting at the guard seam even for the `agent-decision` kind, and it should be
tested by §6's scoping step rather than assumed here.

## 5. H-AC-08 is probably an amendment, not a build — flagged, not decided

`legacy-import-observation` describes importing a pre-Phoenix or external
approval/override/deploy record whose authority cannot be reproven. The prior
measurement already confirmed by repo-wide search that **no code path imports or
migrates a legacy record at all** — not that the producer is missing, but that the
activity does not occur in this product.

Building a producer for an activity the product does not perform would be building a
caller to satisfy a criterion, which is the exact anti-pattern this epic has caught
and reverted before (`cc43a182`, the reverted orphan check). The honest options are an
`acceptance.md` amendment in the H-AC-11 / PX0-AC-13 style, or leaving the criterion
open with its reason recorded. **This is a PO decision and is deliberately not taken
here.**

## 6. Recommended sequencing

1. **Build the `command-offer` producer at the guard hand-off seam.** Smallest,
   best-evidenced, closes R-AC-08's producer half, and proves the integration shape
   end-to-end against a state machine that is already complete and tested. One
   dispatch, bounded scope.
2. **Run the `agent-decision` scoping step** against the continuity course-decision
   machinery: does `continuity-select-course` / `continuity-apply-decision` carry the
   selection/escalation/fallback semantics A-AC-05 names, and is there a point that
   is genuinely *before* a dependent action for A-AC-01? Elephant-context
   investigation, not a dispatch — the same pattern that made `PHX-WP-PAC06-ORPHAN`
   a clean single-pass result.
3. **Put H-AC-08 to the PO** as an amendment question (§5), together with the other
   already-parked amendment candidates, rather than as its own build.
4. **L-AC-01 stays out of scope.** Its gap is orchestration, which §2 separates out;
   nothing in this plan brings it closer, and it remains the PO/architecture question
   `class-b-multi-dispatch-plan.md` recorded.

## 7. What this document does not claim

It does not claim any criterion is closer to `implemented` — no code changed. It does
not claim the `agent-decision` producer candidate in §4 is correct; that row is marked
medium confidence precisely because its scoping step has not been run. It does not
resolve H-AC-08. And it does not revisit L-AC-01's finding, which stands as recorded.
