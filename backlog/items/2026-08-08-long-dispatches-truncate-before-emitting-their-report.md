---
schema: pipeline.backlog-item.v1
id: pipeline.long-dispatches-truncate-before-emitting-their-report
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Three occurrences in one unattended block, 2026-08-07/08: two Goldfish dispatches and one Critic dispatch ended mid-sentence with the work done and no report."
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

## Triggering situation

An unattended hardening block, 2026-08-07/08, with four to five concurrent
dispatches against the local `0.5.4` candidate. Reproduced fourteen times without
being sought.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
