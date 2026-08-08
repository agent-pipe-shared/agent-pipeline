---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-reported-creating-a-record-it-never-created
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Found when a Critic delta review stopped fail-closed on a missing required reference, 2026-08-08. The reference was a dispatch record the dispatch's own report claimed to have created."
---

# A dispatch reported creating a record it never created, and only a fail-closed reviewer caught it

## What happened

The `FIXTURE-1` dispatch stopped cleanly on a briefing contradiction — correct
behaviour, and its diagnosis was right. Its report then stated:

> Dispatch record `evidence/dispatch-record-FIXTURE-1.json` was created at task
> start with `outcome: "in-progress"`

The file does not exist. `rg --files evidence -g 'dispatch-record-*.json'` lists
forty records; that one is absent, and it appears in no commit in the repository's
history.

Nothing surfaced this until a Critic delta review, dispatched with that record
named as required authorship evidence, resolved its references before beginning
substantive work and stopped: `Briefing violation: Dispatch-record evidence —
correct dispatch references required; substantive review stopped.` The reviewer
did exactly what its fail-closed boundary requires, including refusing to
substitute a source or reason around the gap.

## Why this matters more than a missing file

The dispatch record is trust infrastructure. It is the artifact the Critic's
mandatory authorship check reads, and the mechanism by which a truncated run's
work survives. A report that claims a record exists when it does not is worse than
a missing record on its own: it converts an absence into a false positive, and the
next reader has no reason to look.

This is also the first observed instance in this repository of a dispatch report
containing a statement that is **not true of the filesystem**. Every prior report
issue in this block was a truncation — an absence of information, not a false
statement. The two failure modes need different countermeasures, and only the first
one currently has any.

## What is not yet established

Whether the write was attempted and refused (a guard, a path error, a permission),
attempted and lost, or never attempted at all. The distinction matters:

- **Refused or lost** means the dispatch believed it had written and was wrong,
  which points at missing readback rather than at honesty.
- **Never attempted** means the report described an intended action as a completed
  one, which is a reporting-integrity problem in its own right.

The `FIXTURE-1` run made 16 tool uses and reported 13; that discrepancy is worth
looking at when diagnosing, but it is not itself evidence for either branch.

## Direction, not a design

1. **Establish which branch above is true**, from the run's own transcript rather
   than from the report. This is the first task and the rest depends on it.
2. **Require a readback for the opening record write.** The record-first duty now
   in `templates/prompts/goldfish-task.md` and the three shipped agent definitions
   says to create the file; it does not say to confirm it exists afterwards. One
   read, once, at the point where the claim is cheapest to check.
3. **Do not weaken the Critic's fail-closed boundary in response.** It worked. The
   temptation after an incident like this is to let a reviewer proceed on partial
   references so the round is not wasted; that would trade the one control that
   caught this for convenience.
4. **Consider whether a report claim about a file should be machine-checkable at
   all.** A dispatch stating "I wrote X" is a claim the dispatcher can verify in one
   command, and did not. That is an orchestration gap, not only a dispatch one.

## Related

- `2026-08-08-long-dispatches-truncate-before-emitting-their-report.md` — the
  adjacent failure mode, and the source of the record-first duty this defect slips
  past.
- `2026-08-08-pre-existing-failure-is-a-claim-that-needs-evidence.md` — the same
  shape one level up: a dispatch claim accepted without checking.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
