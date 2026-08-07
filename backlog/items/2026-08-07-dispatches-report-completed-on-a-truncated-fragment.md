---
schema: pipeline.backlog-item.v1
id: pipeline.dispatches-report-completed-on-a-truncated-fragment
type: defect
owner: pipeline
status: open
created: 2026-08-07
source: Observed six times in one Elephant session (2026-08-07) across both Goldfish and Critic dispatches. Recorded with the detection and recovery that worked, because the failure is silent by construction.
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
on 2026-08-07. All six were recovered without data loss, but each cost a
detection step and a re-dispatch round trip.

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

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
