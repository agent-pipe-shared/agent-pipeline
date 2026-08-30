---
schema: pipeline.backlog-item.v1
id: pipeline.pipeline-defaults-to-sequential-work-with-no-enforced-task-slicing
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-29
sprint: nova-b
tracking: "Nova B — PO request, 2026-08-29 (German verbatim): 'es stört mich das die Pipeline immer nur sequentiell von sich aus arbeitet. ich möchte ein durchgesetztes system per Maschine haben was für Standardmäßiges slicen von Aufgaben ohne Überschneidungen sorgt die dann mit workflow tool oder vergleichbaren subagenten arbeiten. wir müssen designen wie wir das in die Durchsetzungsschicht bekommen da die vergangenen Versuche dafür zu sorgen gescheitert sind'. Deliberately NOT Nova A: this needs a real design pass, not a same-session patch, and the candidate must not grow new enforcement surface before its current diff is reviewed."
source: "PO request, live in the same 2026-08-29 session that ran the 0.6.0 candidate's Critic 1+1. The PO explicitly named this a design problem ('wir müssen designen'), not a mechanical fix, and explicitly named that past attempts to secure this have already failed."
done_when: manual
---

# The Pipeline defaults to sequential work; the PO wants machine-enforced default task-slicing into parallel Workflow/subagent execution

## What the PO is asking for

By default, an Elephant session works through a batch of independent tasks one dispatch at
a time — sequentially — even when the tasks could be sliced into non-overlapping units and
run concurrently via the Workflow tool or comparable parallel subagent dispatch. The PO
wants this changed from an occasional choice into a machine-**enforced** default: a system
that, for standard multi-task batches, performs the slicing (into non-overlapping units) and
routes execution through the Workflow tool or comparable subagents, without depending on the
Elephant remembering or choosing to do so turn by turn.

The PO frames this explicitly as requiring real design work to land in the *enforcement
layer* — not prompt guidance, not a documentation update — because, in their words, past
attempts to secure this have already failed.

## Evidence that prompt-level guidance alone does not produce this default

This is not a hypothetical failure mode; it recurred inside the very session that produced
this request. `docs/operating-model.md`, the Workflow tool's own description, and this
session's `workflow-dispatch.md` reference all already *describe* parallel dispatch as
available and often preferable. Despite that, this session defaulted to serial,
one-dispatch-at-a-time work across most of its backlog-closure phase, and only shifted to
parallel Workflow-tool dispatch after the PO explicitly asked, more than once, for "mehr
parallel und mehr Workflow tool wenn möglich" — and again, later the same session, for the
5-bucket parallel split of the Critic 1+1 round (`AskUserQuestion`, "Parallel nach Themen
aufteilen"). Each time, the PO had to notice the sequential pattern and correct it live.
This matches the standing lesson already on file for this repository: **"Technical
enforcement is the USP — a violated rule needs a guard, not another paragraph of prompt."**
A description of the capability is not the same as a default that reaches for it.

The sibling item `2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md` (closed
2026-08-19) is adjacent but distinct: it made template-conformance *checking* aware of
Workflow-embedded dispatches once one is written. It does not touch whether a Workflow-tool
dispatch is chosen *at all* for a slice-able batch of work in the first place — that decision
today is entirely the Elephant's own judgment call, unenforced.

## Why this is a design problem, not a mechanical fix

Filed rather than patched inline because every candidate mechanism raises a real design
question with a wrong-answer failure mode on both sides (forced-parallel where work is
actually sequential/dependent is at least as bad as the current gap):

- **What counts as "standard slicing"?** Not every multi-item batch is safely parallel —
  see `2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md` (concurrent
  non-isolated dispatches sharing a checkout) and this same session's own discipline of
  verifying disjoint file scope before launching concurrent Workflow tasks. A slicing rule
  that ignores dependency/overlap analysis would trade a sequential-work complaint for a
  race-condition regression.
- **Where does the enforcement actually live?** A PreToolUse guard can observe and block a
  *single* tool call, but "should this batch have been sliced into N parallel dispatches"
  is a judgment about the *shape of the plan*, not about any one tool call's own payload —
  closer to what a planning-stage check or a session-start/task-count heuristic would need
  to evaluate than what `guard-dispatch.mjs`'s per-call matcher does today.
- **What is the actual trigger?** A fixed item-count threshold, a detected batch of
  same-shaped backlog/TODO items, an explicit user cue, or something else — each has a
  different false-positive/false-negative profile.
- **What does "enforced" mean operationally** given EL-16 (every implementation is a
  briefed Goldfish dispatch) and EL-18 (one repo, one Elephant) already constrain who may
  dispatch what: does enforcement mean a hard block on proceeding without slicing, a
  mandatory disclosure/justification when NOT slicing, or a default template the Elephant
  must actively opt out of with a stated reason?

## Direction (not prescriptive — the open questions above are the actual scope)

1. Survey what already tried to solve this and failed, per the PO's own framing — at
   minimum the sibling item above, and this session's own repeated live corrections — to
   avoid re-proposing an approach already shown not to hold as a default.
2. Define a concrete, testable definition of "a standard slice-able batch" (size,
   independence, file-scope disjointness) before proposing any enforcement mechanism.
3. Propose where the enforcement actually sits (guard, planning-stage check, session-start
   nudge that becomes a hard requirement, or another mechanism) and what a violation looks
   like mechanically, matching this repo's own standing principle that a violated rule
   needs a guard, not another paragraph of prompt.
4. Design against the failure mode this item itself calls out: forcing parallel/Workflow
   execution onto genuinely sequential or dependent work must not become the new default
   failure.

## Acceptance criteria

- A design decision (register entry and/or ADR, per EL-04) exists naming the concrete
  enforcement mechanism, its trigger definition, and how it avoids forcing parallelism onto
  dependent work.
- The mechanism is mechanically checkable (a guard, a test, or an equivalent enforced
  artifact) — not solely a new sentence in CLAUDE.md/`docs/operating-model.md`, per the
  evidence above that documentation-only guidance already failed to produce this default.

## Related

- `2026-08-18-guard-dispatch-has-no-workflow-tool-awareness.md` — adjacent: enforces
  template conformance for a Workflow dispatch once written; does not enforce that one is
  chosen.
- `2026-08-07-parallel-goldfish-dispatches-race-on-shared-checkout.md` — the concrete risk
  a slicing mechanism must design around, not ignore.
- `2026-08-28-the-push-path-has-no-driver-so-its-five-layers-are-walked-by-hand.md` — a
  different Nova B driver-automation item; related pattern (turn-by-turn work replaced by a
  machine-driven default), different subsystem.
