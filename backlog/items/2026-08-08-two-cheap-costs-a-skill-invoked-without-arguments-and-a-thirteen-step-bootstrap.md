---
schema: pipeline.backlog-item.v1
id: pipeline.skill-arguments-and-bootstrap-length
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "PO, 2026-08-08, findings D5 and D6 from the Claude greenfield transcript against the 0.5.4 local candidate. The PO's framing for the whole review was token waste: 'das verschwendet total viele token'."
---

# A skill that accepts an empty argument list, and thirteen steps before the first line of code

Two findings from the same transcript that share nothing except being cheap to
fix and expensive to leave.

## D5 — the Critic skill ran with no arguments and burned roughly 22k tokens

The session invoked the Critic skill without arguments. `$ARGUMENTS` was empty,
the dispatch proceeded anyway, and it ended by reporting a dispatch defect —
after spending roughly twenty-two thousand tokens discovering that it had nothing
to review.

The skill carries an `argument-hint`. A hint is advisory: it tells a caller what
to pass and does nothing when they do not. The dispatch contract, by contrast, is
not advisory — `roles/critic.md` and the dispatch template both state that a
briefing without its required references is a defect the Critic must return
rather than work around. The Critic did return it. It returned it at the end
instead of the beginning.

The correction is at the invocation point, not in the Critic: a skill whose
contract requires arguments should refuse an empty argument list before any model
work happens. The cost of the current behaviour is paid every time, and it is
paid by the caller who is least likely to know what went wrong — a first-time
adopter following a slash command.

Note this is the second finding in the same review where an advisory signal was
mistaken for an enforcing one; the first is the `argument-hint`'s cousin in
`SKILL.md`, where the design-package instruction omits the markers the gate
enforces. Advisory-where-enforcing-was-assumed is worth watching as a pattern.

## D6 — the bootstrap is thirteen digest-bound steps before the first line of code

The observed sequence: preflight → inspect → plan → apply-seed → plan-runtime →
init-runtime → kickoff plan → kickoff apply → promote plan → promote apply →
submit-plan → approve-plan → set-phase. Each with its own digest rebinding.

This is not filed as a defect in the individual steps. Every one of them exists
for a recorded reason, and the digest rebinding is the property that made every
drift in both transcripts visible immediately rather than three steps later —
the transcript names that explicitly as something that worked.

It is filed because the *total* is a number nobody chose. Thirteen steps is the
sum of thirteen local decisions, each correct, and it is the first thing an
adopter experiences. The question worth answering once, deliberately: which of
these are separable ceremonies a human must witness, and which are internal
transitions that a single sanctioned command could perform as one transaction
with one digest binding at the end?

The answer may well be "all thirteen are load-bearing". That answer is fine, and
it should be written down as an answer rather than remaining an accident of
accumulation. If it is not the answer, this is the largest single token cost in
the adoption path.

## Direction, not a design

1. **A skill whose contract requires arguments refuses an empty argument list**,
   at the invocation point, before model work. Enumerate which shipped skills
   have required arguments; `critic-review` is one, and it is unlikely to be the
   only one.
2. **Audit `argument-hint` against actual requirement.** Where a hint stands in
   for a requirement, either enforce it or state that it is optional.
3. **Count the bootstrap steps deliberately** and record the count with a
   rationale, whether or not any of them merge. A number with a reason can be
   defended to an adopter; a number without one cannot.
4. **Measure before collapsing anything.** If steps do merge, the property that
   must survive is the one both transcripts credited: drift is caught at the step
   that causes it, not later.

## Related

- `2026-08-08-a-session-is-told-it-is-ready-but-never-how-to-repair.md`
- `2026-08-08-a-promotion-freezes-a-prd-the-po-gate-will-reject.md` — the other
  advisory-versus-enforcing instance.
- `guardrails/token-budget.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
