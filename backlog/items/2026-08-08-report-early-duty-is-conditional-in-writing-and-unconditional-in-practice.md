---
schema: pipeline.backlog-item.v1
id: pipeline.report-early-duty-is-conditional-in-writing-and-unconditional-in-practice
type: defect
owner: pipeline
status: open
created: 2026-08-08
source: "Elephant self-observation across the Phoenix gate-integrity phase, 2026-08-07/08: six dispatches ended at or past budget, four with no report at all; recorded in docs/state.md before being filed here."
---

# The report-early duty is written as conditional and is in practice unconditional

## Description

`templates/prompts/goldfish-task.md` frames the duty to start writing the report
early as advice for packages expected to exceed roughly 25 tool uses. Under this
repository's closed shell grammar — one simple command per tool call, every
piece of evidence captured through a Node wrapper — nearly every dispatch crosses
that threshold, so the condition is almost always true. A duty that is in
practice unconditional but written as conditional is read as optional, and the
observed consequence is a dispatch that spends its whole budget on work and
returns nothing.

The failure is expensive in a specific way: the work is usually done and often
correct, but it dies with the subagent's context. The orchestrator then either
re-dispatches the same package or reconstructs the result from the diff, and
both cost more than the report would have.

## Triggering situation

Six dispatches in the Phoenix gate-integrity phase ended at or past budget, four
with no report at all — one at 52 tool uses with nothing written. The pattern
continued into the review lane: the round-2 Critic of 2026-08-08 stopped at 46
tool uses having completed its analysis, and produced its report only after the
orchestrator explicitly asked for it. Every dispatch that carried an explicit
"begin writing your report at N tool uses" block did report, including
`PHX-QG06-DATE` the same day.

## Affected artifact

- `templates/prompts/goldfish-task.md` — the conditional framing.
- `templates/prompts/critic-review.md` — carries no report-budget clause at all,
  and the Critic lane shows the same failure.
- `roles/goldfish.md` GF-07 — the honest-stop contract, which a silent
  budget death violates without anyone being able to see it.
- `.claude/pipeline.json` — the alternative location, if the duty is calibrated
  per project rather than stated in the templates.

## Proposal

Two options, deliberately both stated rather than one recommended, because the
choice is about where a repository-specific fact belongs:

1. **Amend the templates.** Drop the ~25-tool-use condition and state the duty
   unconditionally: name a report point as a number in every dispatch, and make
   a report due in every outcome including a stop. Cost: the templates carry a
   rule that is only load-bearing in repositories with a constrained shell.
2. **Record it in calibration.** Leave the templates general and add the
   report-point requirement to this repository's calibration, where the closed
   shell grammar that causes it is already a local fact.

Either way the acceptance test is the same and is measurable: over the next ten
dispatches, no dispatch ends without a report, and each one names its report
point in field 5.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
