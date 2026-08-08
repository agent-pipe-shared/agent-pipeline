---
schema: pipeline.backlog-item.v1
id: pipeline.approved-not-implementing-is-a-silent-trap
type: defect
owner: pipeline
status: open
created: 2026-08-08
due: 2026-08-22
source: "Reported by the Phoenix session of 2026-08-08, which lost a dispatch round to it and diagnosed it correctly."
---

# `approved` but not `implementing` refuses every write, and nothing asks for the transition

## What happens

Once a plan is approved, the lifecycle is `approved`. `guard-devplan.mjs` then
refuses every Edit/Write outside `docs/`, `specs/`, `.claude/` and `backlog/`
until the phase is moved to `implementation`. The transition itself is ordinary
agent work — `set-phase --phase implementation`.

Between those two points the project reads as fully approved and behaves as
fully frozen. A dispatch sent into that window is refused on every file in its
scope, including `.git/`, so it cannot even write its own evidence artifact.

The reporting session lost a dispatch round to it and diagnosed it exactly: the
dispatch stopped rather than working around the refusal, which is the correct
behaviour and the reason the cost was one round rather than a corrupted state.

## Why it is a defect rather than a step someone forgot

The denial message names the transition. That is necessary and not sufficient:
nothing *asks* for it, and the state it interrupts is the one a human has just
finished approving. "Approved" is the word the operator has in mind; "approved but
not yet implementing" is a distinction the surface does not draw anywhere before
the first refusal.

The cost is per-occurrence and does not decay: it will cost a round every time,
for every session, until either the approval implies the transition or something
asks for it.

## Direction, not a design

1. **Decide whether approval should imply the transition.** If the answer is that
   a human might approve a plan without wanting implementation to start, then the
   intermediate state is meaningful and must be *visible* — and the answer belongs
   in the ruleset, not in each session's judgement.
2. **If it stays a separate step, have something ask for it.** The natural place
   is the point where approval is recorded: the same command that leaves the
   lifecycle `approved` knows that nothing can be written until it moves.
3. **Do not solve it by widening the guard.** The refusal is correct; only the
   silence around it is not.

## The second, more general lesson from the same report

The reporting session had briefed its dispatch that the target area was "refused
by nothing". The inventory it relied on had checked `GS-*` and `TP-*` only — the
gate-strength family. `guard-devplan.mjs` is a different family and neither party
had looked at it. The inventory statement was true within its own bounds; the
summary dropped the bounds.

That is worth carrying beyond this item: **an approval budget counts approvals,
not guard families.** A plan that says "four commands" is counting the gates
someone thought to ask about. The generalisable practice is to enumerate the
hooks rather than the questions.

## Triggering situation

Any project whose plan has just been approved, before `set-phase --phase
implementation`. Runner- and platform-independent.

## Related

- `2026-08-08-the-authority-gate-reads-the-worktree-so-its-verdict-need-not-survive-a-checkout.md`
  — same session, a different surface with the same shape: correct behaviour whose
  consequence is undocumented.
- [ADR-0061](../../docs/adr/0061-uniform-human-approval-ceremony.md) — the test to
  apply to direction 1: name what the extra step prevents.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
