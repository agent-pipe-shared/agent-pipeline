# Draft: Criterion-bound regression tests ("pins")

## Status and date

Proposed, 2026-10-16. The PO decided to make the sprint practice of
criterion-bound regression tests canon for 0.7.0, limited to documentation
that needs no Alfred design reopen. This draft records that decision; it is a
paraphrase of the PO's chat decision, not a quoted transcript or an approval
receipt. Numbering follows ADR-0069 at acceptance. It refines
[the item-owned EGM draft](draft-item-owned-egm-retained-quality-gates.md) and
does not replace it.

## Context

The item-owned EGM draft lets one Goldfish own analysis, test cases, code and
targeted checks for one outcome, and relaxes separate test authorship. During
the Alfred sprint, original acceptance criteria were qualified on the current
source by one durable test file per backlog item ("pin"), with a RED proof per
case and typed skips for cases a native Windows host cannot execute. That
practice lived only in session-local briefing generators. On 2026-10-16 the PO
also noticed that the operating model still read as if independence came from
separate test authorship; it never said where independence now comes from.

## Decision proposed for the common design package

1. An outcome that qualifies an acceptance criterion binds it to a durable,
   named test at the project's documented pin location. In this repository
   that is `plugins/pipeline-core/lib/pins/<item-slug>.test.mjs`.
2. Every acceptance point maps to at least one case that drives the real module
   or CLI, without mocking the behavior under test.
3. Where cheap, each case is shown able to fail (RED) against a scratch mirror
   of the production function. Production is never edited for the proof.
4. An unsatisfied point stays as RED evidence. The outcome is reported blocked
   with the exact source file and function the fix needs.
5. A case the host cannot execute is skipped only with a typed host-limitation
   reason naming the owner, the due date and the host that will run it. Such a
   skip is an open verify item, never a pass.
6. Independence comes from execution, not authorship. The owner writes the pin;
   it is executed again outside the owner's context (host item checks, Full
   Verify) and reviewed by a fresh Critic.

The rule lives in QG-04 (`guardrails/quality-gates.md`), the briefing shape in
the QUALIFY module of `templates/prompts/goldfish-task.md`, and a pointer in
`docs/operating-model.md` §5 Dispatch. All three are runner-neutral.

## Consequences

- A criterion's qualification is reproducible by anyone with the repository,
  not only by the session that produced it.
- A typed host skip makes host gaps visible instead of hiding them as passes;
  it also leaves real open verify work that must be scheduled.
- RED proofs by scratch mirror cost tool calls; owners may omit them where not
  cheap but must say so.

## Out of scope for 0.7.0

Both items below are new product surface and need design scope. The PO
deferred them; they are tracked in
`backlog/items/2026-10-16-pin-location-and-generator-for-user-repositories.md`.

- A calibration field for the pin location and test command, so user
  repositories with their own test framework can configure where pins live and
  how they run.
- A versioned pin-briefing generator in the plugin, replacing the
  session-local generators used during the sprint.
