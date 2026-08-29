---
schema: pipeline.backlog-item.v1
id: pipeline.long-dispatches-truncate-before-emitting-their-report
type: defect
owner: pipeline
status: open
created: 2026-08-08
sprint: alfred
due: 2026-08-22
source: "Three occurrences in one unattended block, 2026-08-07/08: two Goldfish dispatches and one Critic dispatch ended mid-sentence with the work done and no report."
done_when: contains templates/prompts/goldfish-task.md Never start a background job and end your own turn before holding its result.
---

# A long dispatch can finish its work and lose its report

## What happened, three times in one block

Two Goldfish dispatches and one Critic dispatch ended with a final message that
was a fragment of working narration — *"Now let me run the probe to see whether
the claude flow completes."*, *"Now the full verify sweep — the long suite in the
background, the shorter ones in sequence."*, *"Let me review the remaining four
diffs and map them against the backlog items."* — rather than the contractual
report their briefing required.

In every case the substantive work existed. Two had written complete source
changes; one had reviewed most of an enumerated commit set. What was lost was
the only artifact the dispatch contract actually delivers: the report.

All three shared one shape. The dispatch was long, and the truncation fell
during or just before a **verification sweep** — the phase where an agent runs
several suites in sequence and holds their results in working context in order
to quote real counts.

## Why this is a defect and not merely bad luck

The Goldfish and Critic contracts are report-based by design. The implementing
session is discarded; the report plus the commit is the entire deliverable. An
agent that finishes its work and loses its report has, from the dispatcher's
side, produced an unverified diff — which the operating model treats as no
delivery at all (P4).

The consequence is worse for the Critic than for a Goldfish. A Goldfish's work
sits in the tree and can be inspected. A Critic's work is *only* the judgement;
a truncated Critic run has consumed a full review budget and produced nothing
that can be acted on, and there is no way to tell from the outside whether it
had found something.

## What already helps, and what it does not cover

`templates/prompts/goldfish-task.md` field 6 carries a **report-early duty**: for
packages expected to need more than roughly twenty-five tool uses, keep a running
report skeleton in `dispatch-record.json`, updated at each milestone, so the
final report condenses a persisted log rather than being composed from scratch.
That duty is why two of the three cases were cheap to recover.

It does not cover the case that actually occurred. The running log preserves the
*findings*; it does not cause the *report* to be emitted. Nothing in the contract
makes the report itself durable, and the Critic template carries no equivalent
duty at all.

## What worked as recovery, and should be written down as practice

Resuming the agent with a message naming only what remained. The transcript is
intact, so the agent still holds its own findings; a short procedural instruction
— finish, emit the report in the mandatory format, scope the verdict to what you
actually examined, and say what you did not reach — produced a complete report on
the next turn in each case. For one Goldfish it was cheaper still for the
dispatcher to re-run the suites itself, since it re-runs them anyway.

Recovery must stay procedural. A resume message to a Critic that characterises
the review object, or hints at what was expected, is the same contamination the
dispatch template exists to prevent — and a resumed Critic is *more* susceptible
to it, not less, because it arrives with the hunt already framed.

## Direction, not a design

Not designed here. The questions:

1. **Should the report be persisted rather than emitted?** If the contractual
   report were written to a known artifact path as the agent's last act before
   returning, a truncated final would cost the prose and not the deliverable.
   This is the report-early duty carried one step further, to the report itself.
2. **Does the Critic template need the report-early duty at all?** It currently
   has none, and it is the role where truncation costs the most.
3. **Should a verification sweep be structured to survive it?** The pattern in
   all three cases was several suites run in sequence near the end. Requiring
   each result to be appended to the dispatch record as it lands — rather than
   accumulated for one final summary — would make the loss recoverable without a
   resume.
4. **Is truncation detectable by the dispatcher?** A final message that fails to
   match the mandatory report shape is mechanically recognisable. Whether the
   dispatcher should be required to check it, rather than noticing by reading,
   is a separate question worth asking.

Question 1 is the one that most directly protects the contract; question 2 is the
cheapest and closes the worst case.

## Measured frequency, updated 2026-08-08

The count is now **fourteen** occurrences across the 2026-08-07/08 blocks, not
three. Seven fell in the first block; four more fell in the decisions wave that
followed, two of them in the *same* dispatch after a procedural resume; three
more fell in the runner-neutrality wave, the last of them detailed below.

Three facts the larger sample adds, none of which were visible at three:

1. **A resumed dispatch truncates again.** Resuming is a recovery, not a fix; a
   long task can consume two or three resumes before it lands. Any direction
   below that assumes one recovery per dispatch is calibrated to the wrong number.
2. **The verification sweep is not the only site.** The original three all fell
   during or just before a sweep. Later ones fell while writing tests and while
   diagnosing a hung child process — i.e. anywhere in a long run, which weakens
   "hold fewer suite results in context" as a sufficient answer.
3. **Report durability changed the cost, not the rate.** `GF-09-D` / `CR-06-D`
   landed mid-block. Dispatches after it still truncate at the same rate; what
   changed is that the material survives. That is the correct division — but it
   means this item stays open on its own terms, because durability is mitigation
   and the truncation is the defect.

One practice earned its place from the larger sample: **instruct the dispatch to
commit as soon as its suites are green, rather than after the last DoD check.**
A commit that exists survives a truncation; a commit that was planned does not.

## Fourteenth occurrence, 2026-08-08 — and the first with a measured cost

`SEEDINT-1` truncated after 60 tool uses and roughly 148k subagent tokens, mid
sentence, immediately before writing the pinning tests its DoD required. The
usage figures are recorded here because they are the first quantitative data
this item has: every prior occurrence was noted qualitatively as "long".

What it adds to the picture:

4. **The commit-early practice above was not followed and the cost was
   immediate.** Two source files carried uncommitted modifications and no commit
   existed, so a truncation that should have cost a report cost the whole
   diff's durability instead. The practice is recorded in this item and was not
   written into the briefing — which makes this an orchestration failure, not a
   dispatch failure. **Any direction taken from this item must put the
   commit-early instruction into `templates/prompts/goldfish-task.md`, where a
   briefing is actually built from, rather than leaving it as a lesson recorded
   in a backlog item that nobody reads while dispatching.**
5. **The truncation point was a task boundary, not a sweep.** It stopped between
   "existing tests pass" and "write the new tests" — reinforcing point 2 above
   and further weakening any context-volume explanation.

## The first measured sample, 2026-08-08

The PO asked for this to be investigated rather than only counted. Six dispatches
from one block, with the figures the runtime reports:

| Dispatch | Tool uses | Subagent tokens | Outcome |
|---|---|---|---|
| RESTART-1 | 39 | 108k | clean stop |
| AUTHAPPLY-1 | 42 | 82k | completed |
| MEMPATH-1 | 59 | 156k | **truncated** |
| SEEDINT-1 | 60 | 148k | **truncated** |
| DOCS-1 | 76 | 105k | **truncated** |
| SCRATCH-1 | 79 | 194k | **truncated** |

Continuations after a procedural resume: SEEDINT-1 completed at 47 uses,
SCRATCH-1 at 44, MEMPATH-1 at 73.

**What this supports:** truncation correlates with run length. **What it does not
support:** a token-volume threshold — DOCS-1 truncated at 105k while RESTART-1
finished at 108k — nor a hard tool-count cliff, since MEMPATH-1's continuation ran
to 73 uses and finished. Tool-use count is the better of the two predictors in
this sample, and neither is a mechanism.

**The environment question is open and cheaply answerable.** Every observation so
far comes from one machine, a WSL Ubuntu host. Whether the same rate appears on
the repository's second machine is the single measurement that would separate an
environment cause from a general one, and it has not been taken. Until it is,
"long dispatches truncate" and "long dispatches truncate *here*" are both
consistent with the evidence, and this item must not assert the first.

## Cheap diagnosability, adopted 2026-08-08

The PO asked whether dispatches could write debug information without much budget.
The mechanism already half-existed and failed for one reason:

- **The dispatch record is created last, so a truncated run leaves none.**
  MEMPATH-1 ended with the words "now let's write the dispatch record". `GF-09-D`
  asks for the `log` to be appended as work lands, but a record that is created at
  the end exists exactly when it is no longer needed.

Two changes to `templates/prompts/goldfish-task.md`, both costing one write and no
new tool or permission:

1. **Create the record as the opening act**, with `outcome: "in-progress"` and an
   empty `log`, before any other work.
2. **Each `log` entry carries the phase entered and the running tool-use count.**
   A run that never emits a final report is then still legible: which phase it
   reached, how far into its budget, what its last completed step produced.

Deliberately nothing more. Richer instrumentation would cost the budget the PO
asked to protect, and the two fields above are what the six-row table above was
missing when it was assembled by hand from runtime notifications.

## PO direction, 2026-08-08 — make the budget a handover, not a cliff

The PO proposes a durable fix rather than a larger number:

> when the budget is exceeded, deliberately allow a timely close and handover —
> then the Elephant can decide whether to dispatch again for the rest, or adjust
> the briefing

That is the right shape, and it inverts today's rule. TB-09 currently makes
reaching the cap a *stop condition*, which is honest but leaves the dispatcher with
a stopped run and no structured statement of what remains. A budgeted **closing
allowance** — a small reserve beyond the cap, spendable only on committing what is
green, writing the record, and emitting the report — converts an exhausted run into
a usable handover. The work already done stops being lost, and the decision about
the remainder returns to the role that should make it.

Two design points a proposal must settle rather than assume:

1. **The allowance is spendable on closing only.** A reserve that can be spent on
   "just one more fix" is simply a larger budget, and the cap stops meaning
   anything. The permitted acts are: commit what is already green, write the
   dispatch record, emit the report.
2. **The handover must be structured, not prose.** "I ran out" is what happens
   today. What the Elephant needs is: what is committed, what is green, what
   remains, and what the next briefing would have to say differently — the last of
   which is the part that prevents a second dispatch failing the same way.

### The PO's own observation on dispatch leadership, recorded because it generalizes

From a parallel line of work, verbatim in substance: two of three dispatches ran
out without a final report, both at the tool budget. The first lacked a convention
the dispatcher had not passed on (the evidence wrappers); the second was given it
and came through at 76 of 80. **The error was the dispatcher's in both cases, not
the dispatch's, and both reported honestly that they were at the limit rather than
concealing it.**

That is the same pattern as this block's own record: every stop this session was
correct, and the briefings were what needed fixing. A dispatch that reports being
at its limit is behaving well; the cost is the dispatcher's to prevent.

### One correction to the causal claim, from this block's measurements

The budget is **a** cause, not the only one. Of the truncations measured here,
several occurred *before* the cap was reached — 39, 50 and 54 tool uses against
caps of 45 to 70 — and at least one fell in a pure reading phase with no edits
made. A closing allowance therefore recovers the budget-exhaustion class and does
nothing for the rest, which still needs the record-first change already adopted
above. Both are worth having; neither is sufficient alone.

## Triggering situation

An unattended hardening block, 2026-08-07/08, with four to five concurrent
dispatches against the local `0.5.4` candidate. Reproduced fourteen times without
being sought.

## Consolidation, 2026-08-11 — this is now the canonical tracking item

Two related items are folded into this one rather than tracked separately:
`backlog/items/2026-08-07-dispatched-agents-return-truncated-mid-step.md`
(the original discovery — WSL hypothesis, the 57-68-vs-21 tool-use
correlation) and
`backlog/items/2026-08-09-goldfish-critic-dispatch-truncation-costs-recurring-recovery-time.md`
(PO-deferred-until-after-ship, now resumed). Both are marked
consolidated in their own Triage sections and kept as historical evidence
rather than merged/deleted.

**Three measured occurrences from this same 2026-08-11 session, all Critic
dispatches, all stopping mid-Phase-A (before Phase B/report) on their FIRST
leg — two of three genuinely independent dispatches (fresh Agent calls, not
resumes of each other), the third each one's own resumed continuation:**

| Dispatch | Tool uses | Duration | Stopped right before |
|---|---|---|---|
| Critic review of a 50-commit range | 46 | 504,340 ms | reading the sealed nova-a8 benchmark JSON record (its own words: "Now the benchmark record against §5.6") |
| Critic review of 6 commits (independent fresh dispatch, corrected guardrails/scope, NOT a resume of the row above) | 65 | 578,161 ms | concluding a check on Verify suite registration (its own words: "Neither new suite is registered or present in the verify evidence. Let me confirm how verify enumerates suites before concluding.") |
| (row 2's own resumed continuation, after a purely procedural resume message) | not yet known — in progress at time of writing | — | — |

Both independent dispatches (rows 1-2) are exact, machine-reported data (the
harness's own `task-notification` `usage` block), not a reconstruction — the
same standard the 2026-08-08 six-row table already set. They add two data
points to the "where does it stop" question this item's own direction #2
asks, and the two do not point the same way: row 1 stopped right before what
would have been reading a large (2671-line) JSON evidence file, consistent
with (not yet confirmatory of) a large-tool-output-before-cutoff hypothesis
this item had not previously tested; row 2 stopped mid-reasoning about a
mechanical fact (how Verify enumerates suites) with no obvious large read
pending, which does not fit that same hypothesis as cleanly. Neither stopped
mid-verification-sweep, matching the 2026-08-08 `SEEDINT-1`/`DOCS-1` cases
that already weakened "sweep" as the trigger site. Both dispatches used a
tool-count in the 46-65 band, consistent with this item's existing
correlation (not a hard cliff, but the higher end of observed ranges).

## Forensic-analysis findings, 2026-08-11 (`references/transcript-forensics.md` method, general-purpose dispatch against this session's own raw transcripts)

**Source correction (methodological, worth keeping):** subagent turns do NOT
live inline in the main session JSONL as `isSidechain:true` entries in this
harness version — that field appears (3,722 times) but never as `true`. Each
dispatch is its own file: `<session-dir>/subagents/agent-<id>.jsonl` +
`agent-<id>.meta.json` (carries `agentType`, `toolUseId` linking back to the
dispatching `Agent`/`Task` tool_use, `model`). The `/tmp/.../tasks/*.output`
files are byte-identical mirrors of the same file, not a separate source.

**Large-tool-output-before-cutoff hypothesis — refuted, not merely
unconfirmed.** Of 4 confirmed truncations found (excluding two still-running
dispatches caught and correctly excluded via a live re-`stat`, not
misclassified), 3 were preceded by SMALL tool results (160-1,748 characters);
the fourth's preceding result was 7,985 characters — still far short of
"large". This closes off the hypothesis this item's own 2026-08-11 data (the
two-Critic-dispatch table above) had raised but not settled — it does not
hold up against this session's own transcripts. Retire it; do not carry it
into the fix design.

**Tool-use-count / token-volume — correlates, still no hard cliff, margin
narrower than previously known.** Confirmed-clean max 50 tool uses; confirmed-
truncated min 54 — only a 4-use gap, and actively undercut by a dispatch that
passed 63 uses live without truncating (it went on to complete cleanly at 65).
`cache_read_input_tokens` (a token-volume proxy) shows the same non-cliff
shape this item's original 105k/108k pair already showed: one clean run
reached 211,260 tokens, one truncated run died at only 117,522.

**New correlation this item did not previously have: truncation was
tier-exclusive in this session.** 4 of 7 `goldfish-deep` dispatches truncated
(57%); 0 of 4 `goldfish-implementor`/`goldfish-mechanic` dispatches did.
Confounded with task length (deep-tier tasks run longer by design), so this
is not yet causal — but no prior data in this item broke the sample down by
effort tier, and this is worth carrying into any fix that might scale the
closing-allowance size by tier rather than using one fixed reserve.

**A second, mechanistically distinct failure mode exists.** One dispatch's
last message was a COMPLETE, grammatical sentence explicitly announcing a
deliberate pause ("I'll stop polling now... to preserve the ~7 calls
remaining for the completion sequence") — not a mid-word cutoff — and then
simply never resumed on its own. This is not the same defect as the other
three (which do look like the classic runs-out-of-turn pattern); a fix aimed
only at "recognize a report-shaped final message" would not catch this one,
since there was no final message to recognize as wrong-shaped — there was no
further turn at all.

**Engineering note for any future auto-detection:** `stop_reason` in the
transcript is NOT a usable truncated/clean signal on its own — `null` appears
on the final block of both a confirmed-clean and confirmed-truncated
dispatch in this sample.

**The sharpest signal for the fix design comes from pairing with this item's
own live data, not from the forensic dispatch alone:** both 2026-08-11 Critic
dispatches truncated on their first leg, then their PURELY PROCEDURAL resume
completed in a handful of calls — 46 tool uses then resumed to completion in
4; 65 tool uses then resumed to completion in 5. In both cases the dispatch
already HELD everything needed to finish; it was not missing information or
still reasoning toward an answer, it had simply run out of room to say it in
the frame it was given. This is direct, first-party evidence for exactly the
mechanism the PO's "closing allowance" design (below) targets — a small
reserve to close out costs far less than the 4-65 uses already spent, because
the material already exists.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted — investigation resumes now per explicit PO
  instruction (2026-08-11: "ja zusammen legen die recherche und fixes aber
  jetzt machen weil jetzt zeit ist"). Forensic-analysis dispatch completed
  (see section above) — the large-tool-output hypothesis is retired, the
  tool-count/token correlation stands but stays soft, and the
  resume-completes-fast pairing confirms the PO's own already-designed
  "closing allowance" mechanism (this item, "PO direction, 2026-08-08"
  section) as the fix to implement first — it is cause-agnostic (works
  whether the underlying trigger is a host turn-limit, a context-budget
  effect, or something else never identified), already has PO sign-off on the
  shape, and this session's data now directly supports its mechanism rather
  than only its plausibility. Implementation goes through a `goldfish-deep`
  dispatch (`templates/prompts/goldfish-task.md`/`critic-review.md` are
  canon/template files, not stage-0-exempt — Elephant-direct edits here would
  repeat the exact EL-01/EL-16 authorship violation a Critic review just
  flagged elsewhere this same session), held until no other dispatch is
  concurrently reading/writing `evidence/verify-latest.json` or
  `evidence/security-latest.json` (a goldfish-deep's own DoD Verify sweep
  would overwrite those files exactly as this session's earlier
  evidence-mutation mistake did, if run concurrently with another dispatch
  reading them).
- **Rationale:** the PO's own proposed design already answers "what should the
  fix look like" (a small reserve beyond TB-09's cap, spendable only on
  commit/record/report, converting a stop into a structured handover); what
  remains is confirming/sharpening the mechanism against real data before
  committing template text, and sequencing the write dispatch safely around
  the two dispatches already in flight this session.
- **Assignment (if accepted):** forensic-analysis dispatch (general-purpose,
  background) dispatched and completed 2026-08-11 (findings above);
  template-fix `goldfish-deep` dispatch planned, not yet sent — held pending
  the concurrently-running Critic review clearing `evidence/*.json`.
- **Date:** 2026-08-11

### Update, 2026-08-16 — the fix landed the same day it was planned; status was stale

Re-checked while triaging the PO's explicit "#5: don't defer, start the
investigation now" instruction from this session's decision matrix. The
"template-fix `goldfish-deep` dispatch planned, not yet sent" line above was
already stale five days before being read: it landed the SAME day.
`templates/prompts/goldfish-task.md` carries the full closing-allowance
mechanism (`git log`: `ba4f0e0e9b69292aa49f7a2058ff6ed788c8b6f8`, 2026-08-11,
"feat(templates): fund a closing allowance when a goldfish hits its tool
budget" — base cap + 5 spendable-on-closing-only tool uses, structured
handover report shape, record-created-first with a mandatory readback).
`templates/prompts/critic-review.md` got the companion fix the same day
(`9b66e401`, "feat(templates): give the critic dispatch a tool budget and a
closing allowance"). **This item's primary design question (1) is therefore
implemented, not merely planned** — leaving it open with a "not yet sent"
line was itself an instance of the pattern this whole session has been
correcting (stale backlog/status text understating shipped work; see also
the `docs/adr/0062-...` correction the same session made for A2/A4).

**What is genuinely still open, distinct from the shipped mechanism:**

- **Question 2's "second, mechanistically distinct failure mode"
  (2026-08-11 forensic-analysis section) has no fix at all.** A dispatch
  that ends a COMPLETE, grammatical sentence announcing a deliberate pause
  ("I'll stop polling now... to preserve the ~7 calls remaining...") and
  then simply never resumes is not caught by the closing-allowance
  mechanism, which only fires when the base cap is reached mid-work — this
  failure mode stops voluntarily, with budget left, and there is no
  transcript fragment to recognize as wrong-shaped. Not designed here.
- **No calibration data yet on whether the shipped fix actually reduced the
  truncation rate** post-2026-08-11 (the item's own "Measured frequency"
  table stops at that date). This will accumulate naturally as sessions
  dispatch goldfish/critic work rather than needing a dedicated run.
- **A fresh, possibly-related data point from THIS session (2026-08-16):**
  a forked verify.mjs run (`Agent` tool, `subagent_type: "fork"`, task-id
  `ac10576e92f6de34a`) started `node harness/scripts/verify.mjs` in the
  background and then ended its own turn with a placeholder result
  ("Waiting for the background verify run to finish before compiling the
  report") instead of blocking on it — a task-notification fired reporting
  the fork "completed" with no real report. This is NOT the same shape as
  either of the two failure modes above (not a mid-sentence cutoff, not an
  announced-then-abandoned pause) — it looks like a third, distinct pattern:
  an agent that starts its OWN nested `run_in_background` job and then
  exits its turn without the harness reliably resuming it when that job
  finishes. Recorded here as a new observation, not yet investigated —
  worth a look if this pattern recurs, but one instance is not enough to
  act on alone.

**Revised status:** keep `open` (the two items above are real, unaddressed
gaps), but the "Assignment" line above is superseded — there is no
outstanding template-fix dispatch to send; that work is done and shipped.
Next concrete step, if picked up again, is designing a fix for the
announced-then-abandoned-pause failure mode, which needs its own dedicated
thought (not a mechanical follow-on to the closing-allowance fix).

- **Date:** 2026-08-16

### Update, 2026-08-18 — release-bar triage: queue the remaining gap for dispatch

- **Decision:** decided, queued for dispatch. The primary mechanism (the
  closing allowance) is shipped and does not need further triage. The two
  gaps left open by the 2026-08-16 update — (a) the "announced-then-
  abandoned-pause" failure mode with no fix, and (b) the newly observed
  nested-background-job non-resumption pattern — are real, unresolved
  defects that need investigation and a design pass, not a same-session
  patch: neither has a known mechanism yet, and any fix candidate would
  need to be proven against reproduced instances before it could be
  trusted, which this read-only triage pass cannot do.
- **Rationale:** this item is a defect with `status: open`, not yet tied to
  a named future sprint; per the 2026-08-18 release-bar sweep it must carry
  an explicit, bounded decision rather than sit on a "keep open, revisit
  later" line with no owner. Queuing for dispatch (rather than closing) is
  correct because the fix is unknown, not merely unimplemented — the
  2026-08-16 update's own words ("needs its own dedicated thought") already
  say so.
- **Assignment (if accepted):** a dedicated `goldfish-deep` investigation +
  design dispatch, scoped to exactly the two open gaps above (not a
  re-litigation of the shipped closing-allowance mechanism): (1) find or
  rule out a detectable signal for the announced-then-abandoned-pause
  pattern, given there is no wrong-shaped final message to catch; (2)
  determine whether the nested `run_in_background` non-resumption pattern
  recurs, and if so scope a fix. Sprint: Alfred — matches its confirmed
  scope ("mechanical governance, measurable rigor, and control integrity",
  `docs/adr/0043-post-go-live-sprint-model.md`, 2026-08-17 amendment)
  precisely, and sits alongside the other dispatch-reliability items already
  assigned there.
- **Date:** 2026-08-18

### Pull-forward decision, 2026-08-19

PO decision: pull the two still-open gaps forward into the Nova A final
wave, explicitly overriding the 2026-08-18 Alfred assignment above for
this item specifically (PO: "dann aufbereiten und in die finale welle
planen was sinnvoll ist rest schließen"). This session directly
experienced and worked around the exact ~50-tool-call termination cliff
this item documents (the step-6 onboarding-coordinator dispatch,
`NVA-W5-COORD-STEP6-1`, hit it 5 separate times) — the shipped
closing-allowance mechanism is real and helped, but did not eliminate
truncation, matching this item's own "durability changed the cost, not
the rate" finding. Scoped for the final wave, exactly the two gaps named
above, nothing broader: (1) a detectable signal (or a ruled-out absence of
one) for the announced-then-abandoned-pause failure mode; (2) whether the
nested `run_in_background` non-resumption pattern recurs, and if so a
scoped fix. Not a re-litigation of the shipped closing-allowance mechanism,
which stays as-is.

### Nova A final-wave investigation, 2026-08-20 — both gaps remain unclosed

- **Decision:** no implementation and no closure. The two requested gaps were
  investigated independently and neither has both a deterministic observable
  signal and a safe, bounded fix that can be implemented within this task's
  allowed paths. Nova B was not inspected, implemented, or dispatched.

- **Gap 1 — announced pause, then no resume:** the announcement itself is an
  observable transcript event, but abandonment is defined by the *absence* of a
  later turn. The repository has no durable pause record, resume deadline, or
  host liveness/turn-delivery event that binds that absence to the paused
  dispatch. `stop_reason` is explicitly ruled out by the prior forensic
  evidence: `null` occurred on both a confirmed-clean and a confirmed-
  truncated final block. A report-shape check also cannot help because the
  observed last message was complete and grammatical. Therefore no
  deterministic detector can distinguish “deliberate pause awaiting a later
  turn” from “deliberate pause abandoned” using the currently documented
  dispatch evidence.

- **Gap 2 — nested `run_in_background` does not resume its parent:** the
  repository-local continuity contract makes only the broader host capability
  observable. Without explicit host evidence, `continuity-status` projects
  `resume-on-next-turn` and says the host has no guaranteed background wakeup;
  with explicit evidence it projects `immediate`. That contract does not model
  a nested background job, a parent-dispatch identity, a child completion
  event, or a parent-wakeup acknowledgement. No repository-local dispatch
  contract found in the scoped search supplies those correlations. The
  2026-08-16 fork observation therefore remains a candidate observation, not
  proof of a recurring defect.

- **Ruled-out fixes:** changing the shipped closing allowance would target a
  different budget-exhaustion mechanism and is forbidden here. A prompt-only
  “resume after pause” instruction cannot prove that a host will deliver a
  later turn. A generic background-capability flag cannot prove nested
  parent/child delivery. Neither is deterministic or testable from the
  permitted backlog/ADR paths, so neither was implemented.

- **Smallest next authorized experiment:** run a Nova-A-only controlled probe
  outside this backlog-only change with (a) a durable parent dispatch ID,
  explicit pause announcement, remaining-budget value, and bounded expected
  resume deadline, and (b) a unique nested-job ID, parent ID, child completion
  event, task-notification event, and parent-resumed/parent-terminal event.
  Repeat each scenario across the available host modes and record the event
  sequence from machine output, not transcript reconstruction. The experiment
  may support a design only if it reproduces the failure and supplies a stable
  predicate such as `pause-record + deadline-expired-without-resume` or
  `child-complete + no-parent-wakeup`. Any implementation would then require a
  separately authorized runtime/orchestration change and focused behavioral
  tests; it is outside this task.

- **Verification and limitations:** repository HEAD matched the expected base
  `ec49e8d34a0829f888b7d049f4971a8db8ccf5e9`; the supplied dispatch record was
  pending with no commits. No runtime/orchestration code, template, Nova B
  material, or closing-allowance mechanism was changed. This update is a
  backlog-only investigation record; no implementation test applies. The
  required `git diff --check` was run. Full Verify was not run or claimed.

- **Status:** `open` — no fabricated closure; Nova-A scope is preserved.

### Prevention fix landed, 2026-08-25 — a bounded mitigation for Gap 1 and Gap 2, not a detector

Re-triaged per explicit PO instruction (2026-08-25, AFK-mode sweep: "work
through these now, making reasonable assumptions; implement means actually
building it, not just designing it"). The 2026-08-20 investigation above
correctly answered "can we *detect* abandonment after the fact?" — no,
neither gap has a deterministic repository-local signal. It did not ask "can
we *prevent the loss* in the first place?", and its own "ruled-out fixes"
paragraph only considered and rejected a *promise* about host behavior ("a
prompt-only 'resume after pause' instruction cannot prove that a host will
deliver a later turn"). A *prohibition* that assumes nothing about host
behavior was not considered, and both gaps admit one:

- **Gap 1:** a dispatch must never voluntarily end a turn while budget
  remains and work is unfinished — no announced-pause-awaiting-a-later-turn.
  If budget remains, keep working (poll/wait in-turn) until either the work
  finishes or the base tool-budget cap is actually reached; only reaching the
  cap opens the already-shipped closing allowance.
- **Gap 2:** a dispatch must never start a nested `run_in_background` job and
  end its own turn before holding the result, since no repository-local
  contract guarantees the harness delivers a further turn when that child job
  completes. Stay in-turn until the result is held, or do not background the
  work inside a dispatch.

This is structurally identical to the two turn-discipline fixes this item
already got shipped and accepted (record-created-first, commit-as-soon-as-
green) — a briefing-level prohibition in the file a dispatch is actually
built from, per this item's own bolded instruction above ("must put the …
instruction into `templates/prompts/goldfish-task.md`"). Both new rules were
added to `templates/prompts/goldfish-task.md` (field 6, next to the
closing-allowance text) and to `templates/prompts/critic-review.md` (the
equivalent closing-allowance section), regenerated into the two vendored
copies under `plugins/pipeline-core/templates/prompts/` via
`node harness/scripts/generate-vendored-canon.mjs` (byte-identical, per the
generator's own manifest — no hand-copy).

**Verification:** `node --test harness/scripts/generate-vendored-canon.test.mjs`
(8/8), `node --test harness/scripts/check-consumer-safe-paths.test.mjs` (9/9),
`node --test plugins/pipeline-core/scripts/check-vendored-template-sync.test.mjs`
(4/4 — includes "real repo templates are byte-identical"), and
`node --test harness/scripts/check-doc-contracts.test.mjs` (36/36), all exit 0.
Confirmed via the array itself that neither template file is a
`NEVER_LIFTABLE_KERNEL_PATHS` entry, and no new import edge was added to any
kernel file (templates are prose, not JS modules) — the kernel-closure suite
was not run, per this dispatch's own DoD condition for skipping it.

**Scope discipline — what this does NOT close:** this is prevention, not
detection. It reduces how often a dispatch *creates* an unrecoverable pause
or an abandoned background job; it does not give the dispatcher a mechanical
way to tell, from outside, whether an already-silent dispatch is paused-and-
will-resume versus paused-and-abandoned. The 2026-08-20 investigation's
"Ruled-out fixes" / "Smallest next authorized experiment" paragraphs for
*detection* remain accurate and unaddressed by this update. Do not read this
Triage entry as closing Gap 1/Gap 2 as originally framed — it closes the
"can we stop the pattern from happening" half, which is the half a
backlog-only, template-scoped dispatch could safely reach.

- **Commit(s):** see the dispatch record
  (`evidence/dispatch-record-AGY-SWEEP-long-dispatches-truncate.json`).
- **Status left unchanged** by this dispatch (`open`) — the Elephant
  reconciles `status:`/closure centrally after collecting the sweep.
- **Date:** 2026-08-25
