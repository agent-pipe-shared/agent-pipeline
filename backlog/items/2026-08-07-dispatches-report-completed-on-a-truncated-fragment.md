---
schema: pipeline.backlog-item.v1
id: pipeline.dispatches-report-completed-on-a-truncated-fragment
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: "Observed six times in one Elephant session (2026-08-07) across both Goldfish and Critic dispatches. Recorded with the detection and recovery that worked, because the failure is silent by construction."
---

# Dispatches signal "completed" while returning a one-sentence fragment

## Description

A dispatched subagent's task-notification reports `status: completed`, but the
returned result is a single sentence — an announcement of the *next* step, not a
result. Observed six times in one session:

| Dispatch kind | Returned fragment | Actual state |
| --- | --- | --- |
| Critic | "The shell guard requires one simple command per call. Let me comply." | review done, report never emitted |
| Critic | "Now let me verify the load-bearing code claims in the design against the actual source." | review done, report never emitted |
| Critic | "Now let me verify the design's source claims against the actual modules." | unknown at time of writing |
| Goldfish | "Now the HGO half of the receiving contract (F3):" | **work in progress, uncommitted** |
| Goldfish | "Now §II.5 (inventory/ACs) and §II.6 (the boundary decision)." | **work in progress, uncommitted** |
| Critic | "I need to check one line-number claim about `docs/state.md`. I will read a bounded 4-line window only (disclosed in my report), not the narrative." | review in progress, report never emitted |

The last row is the most informative sample so far, and it was recorded after the
first six: the fragment is not a closing remark at all, it is an *announcement of
the next tool call*. The agent stated its intent, and the run ended there with
`status: completed`. That is evidence for the output-truncation reading in
proposal 3 rather than for a genuine early stop — the agent had no reason to stop
at that point and every intention of continuing.

Two distinct sub-cases, and they need different recoveries:

1. **The work is finished, the report was not emitted.** The agent had completed
   its review or task and lost only the final message. Asking for the mandated
   report returns it in full.
2. **The work is genuinely unfinished.** The agent stopped mid-task with
   uncommitted changes in the working tree and no commit carrying its dispatch
   trailer. Asking for a report here would invite a reconstructed-from-memory
   result, which is worse than an honest incomplete one.

## Why this matters more than an annoyance

The Elephant's contract is to verify dispatch results, and a `completed` status
is the signal that a result exists to verify. An Elephant that trusts the status
line will book half-finished packages as done — and in sub-case 2 the evidence
that it is *not* done sits only in `git status`, which nothing forces anyone to
look at. The failure is silent by construction: nothing errors, nothing warns,
and the fragment often reads like a plausible closing remark.

It also interacts badly with the Critic round cap (at most four rounds per
package). A fragment mistaken for a verdict either burns a round on nothing or,
worse, gets recorded as a PASS that no reviewer issued.

## Triggering situation

An Elephant session running several Goldfish and Critic dispatches in parallel
on 2026-08-07. All were recovered without data loss, but each cost a detection
step and a re-dispatch round trip.

**A second defect surfaced during the seventh recovery, and it is the
Elephant's, not the harness's.** A Critic reads the live working tree. While that
review was running, the dispatching session committed twice to `docs/state.md` —
so the file the Critic was about to consult for a line-number claim no longer
matched the reviewed commit. Here it was harmless: `docs/state.md` is forbidden
input for a Critic anyway, and the resume message could redirect the check to
`git show 84876f1:docs/state.md`. The same edit against `CLAUDE.md` or a guardrail
file — both of which a Critic reads as law — would have silently invalidated
citations in a verdict, with nothing to notice it.

The rule that follows is narrow and cheap: **while a dispatch is open, the
dispatching session does not modify any file in that dispatch's reference set.**
It belongs next to the acceptance check in proposal 1. A related but distinct
item on parallel dispatches racing on a shared checkout exists on `main` and
arrives with the 0.5.3 merge; this one is about the *orchestrator* writing under
its own worker, not two workers colliding.

**It happened a second time, an hour later, and the rule as first written would
not have caught it.** The eighth fragment came from a *Goldfish*, not a Critic,
and the same session had again committed to `docs/state.md` mid-run — this time
while that Goldfish was building a check over coordinates in exactly that file.
Two corrections follow from the repeat: the rule is not Critic-specific (hence the
wording above), and knowing the rule is demonstrably not enough to follow it. The
durable fix is mechanical — a dispatch declares its reference set, and the
orchestrator's writes are checked against open dispatches — not another line of
prose telling an Elephant to remember. Recorded as the second data point rather
than as a resolution.

## Affected artifact

The dispatch/subagent harness rather than any repository file: the mismatch is
between the task-notification's `status` field and the returned result. No
Pipeline artifact currently states what an Elephant must check before accepting
a dispatch result.

## Proposal

**Owner: PO.** Two parts, and the cheap one should not wait for the expensive
one.

1. **Process, cheap, no tooling — write down the acceptance check.** Before an
   Elephant treats any dispatch as complete it MUST confirm, independently of
   the status line: (a) for a Goldfish, that a commit exists carrying the
   expected `Dispatch: <TASK_ID> (goldfish)` trailer and that
   `git status --porcelain=v1` shows none of that dispatch's files still dirty;
   (b) for a Critic, that the returned text contains the mandated report
   sections, not merely prose. A result that fails either check is not a result.
   The natural home is `roles/elephant.md` alongside the existing dispatch
   duties, or `harness/checklists/goldfish-dispatch.md`.
2. **Recovery, already proven — resume rather than re-dispatch.** Sending the
   same agent a message resumes it from its transcript with context intact, and
   recovered all six cases. A fresh dispatch would have discarded finished work
   and, for a Critic, would have consumed a review round. The resume message
   should state which sub-case is suspected — for unfinished work it must tell
   the agent to re-read its own current file state first and forbid restarting
   from the beginning, and it must say plainly that an honest incomplete result
   is acceptable while a reconstructed verdict is not.
3. **Diagnosis, and only then any tooling.** Establish whether the fragment is
   an output-truncation artifact or a genuine early stop, because the two imply
   different fixes. Six samples are recorded above; the transcripts exist. Do
   not build a detector before knowing which failure it would be detecting.

## Resolution in flight (PO, 2026-08-08)

**The next Nova plugin version carries a fix: dispatched agents will write their
final report to a file rather than only returning it into the session.**

That closes the defect at its cause rather than detecting it after the fact, and
it is the right shape for a reason the proposals above only half-anticipated.
Proposal 3 asked for a diagnosis before any tooling — truncation artifact or
genuine early stop. **Writing the report to a file makes the distinction stop
mattering**: whichever it is, the report survives the message that failed to
carry it. Fourteen recorded occurrences in this repository were all recovered by
resume, so no report was ever actually lost — but every recovery cost a detection
step, and detection depended on someone thinking to run `git status`.

**It also makes proposal 1's acceptance check mechanical instead of behavioural.**
As written, that proposal asks an Elephant to *remember* to verify a trailer and
a clean tree before booking a dispatch as done. With a report file, the check
becomes: the file exists and is complete, or the dispatch did not finish. That is
the same move this repository made for the verify gate — replace a rule an agent
must remember with a state a check can read.

**What the fix does not cover, stated so it is not assumed away.** The second
defect recorded in this item is the *orchestrator* writing under its own running
worker (twice, an hour apart, the second time after the rule forbidding it had
been written down). A report file does nothing about that: it is a
reference-set-collision problem, not a message-delivery problem, and its durable
fix is still the mechanical one named above — a dispatch declares its reference
set, and the orchestrator's writes are checked against open dispatches.

**Sub-case 2 also survives.** A report file distinguishes "finished, report lost"
from "never finished" far more cheaply than today, but an agent that genuinely
stops mid-task still leaves uncommitted work. The resume recovery in proposal 2
remains the right response there, and re-dispatching remains the wrong one —
it discards finished work and, for a Critic, consumes a review round.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Accepted; resolved upstream.
- **Rationale:** Fixed at the cause in the next Nova plugin version — agents write
  their final report to a file. Supersedes the detector contemplated in proposal 3
  and makes proposal 1's acceptance check mechanical. Proposals 1's second half
  (orchestrator writes under an open dispatch) and proposal 2 (resume, not
  re-dispatch) remain open and are not covered by it.
- **Assignment (if accepted):** Nova session (plugin); the reference-set rule
  stays with the Pipeline.
- **Date:** 2026-08-08
