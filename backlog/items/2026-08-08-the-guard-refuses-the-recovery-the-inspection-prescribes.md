---
schema: pipeline.backlog-item.v1
id: pipeline.guard-refuses-the-prescribed-recovery
type: defect
owner: pipeline
status: closed
closed_at: 2026-08-11
closure_repository: self
closure_commit: ce1a7416fe2da9b106a3ffb386788252c6029476
closure_evidence: specs/sprint-nova-epic/evidence/backlog/2026-08-11-pareto-triage-report.md
created: 2026-08-08
due: 2026-08-15
source: "PO, 2026-08-08, findings C1, C2 and C3 from the Claude greenfield transcript against the 0.5.4 local candidate. All three verified in code by the Elephant before filing."
---

# Three places where one component prescribes what another forbids

The Pipeline's recovery model rests on a single promise: a refusal carries a
typed next action, and running that exact action works. These are three verified
cases where it does not, and they are worth one item because they fail the same
promise from three directions.

## C1 — the guard admits a recovery only under a diagnostic code the inspection can decline to emit

`guard-lifecycle-ready.mjs:1095` admits the PO-authority rebind planner only when:

```js
observed.diagnostics[0]?.code === "po_authority_rebind_unavailable"
```

`project-onboarding-v3.mjs` emits two codes on that surface. Line 1966 emits
`po_authority_rebind_unavailable` — the one the guard accepts. Line 1960 emits
`po_authority_rebind_planner_rejected` for the `planner-rejected` case, and that
one the guard does not accept.

So when the planner rejects, the inspection returns a repair action and the guard
refuses to let it run: `GUARD-LIFECYCLE-NOT-READY`. The system prescribes a
command and then blocks it. An operator following the printed instruction is
stopped by a different component with no way to reconcile the two.

An equality check against one enumerated value, on a surface whose producer emits
two, is the mechanism. Whether the second code *should* be admitted is a real
question — a planner that rejected its preimage may well be a different situation
— but the answer must be stated, because today the divergence reads as an
oversight rather than a decision, and the operator gets no signal either way.

## C2 — the preflight requires a path the shell guard will not let a command name

`critic-dispatch-preflight` returns `.claude/pipeline.yaml` among the guardrail
paths the Critic dispatch must supply. Naming that same path in a shell command
is refused with `GUARD-GATE-STRENGTH-SHELL` — including when the command only
reads it.

One component's required input is another's forbidden token. The dispatch is
constructible only by routing around the shell, which is not stated anywhere and
had to be discovered.

## C3 — the read-only exemption is narrower than the text that documents it

`guard-lifecycle-ready.mjs:374` states:

> Reading is unaffected: cat, rg, head, sha256sum and git diff/log/show on these
> paths …

The plural "paths" does not hold. `:611–619` admits `sha256sum` with **exactly
one** path — `args.length === 1`, or `--` followed by one path — and nothing else.
`sha256sum a b c d` is refused, although every one of the four is a read.
`shasum` at `:621–626` has the same single-path shape.

The over-refusal is small; the misleading text is not. An operator reading
`:374` concludes the command is admitted, gets a lifecycle refusal, and now has
to decide whether the guard is broken or the documentation is. Both readings are
reasonable and only one is correct.

## What connects them

All three are contracts between two components that were each written correctly
against their own half. None is a logic error inside one file. That suggests the
missing thing is a test level rather than three fixes: **nothing asserts that a
returned `nextAction`, a required input path, or a documented admission is
actually accepted by the component that gates it.**

The suites are strong where they cover one component. Every one of these three
survives a full green Verify.

## Direction, not a design

1. **C1: decide whether `po_authority_rebind_planner_rejected` is admissible**,
   and encode the decision either way. If it is, admit it. If it is not, the
   inspection must not return the planner as a `nextAction` in that state — it
   should say no route exists, which is the honest answer and the one the
   operator can act on.
2. **C2: reconcile the required-path list with the shell classifier.** Either the
   path is nameable in a read-only command, or the preflight must state how it is
   to be supplied without naming it.
3. **C3: make the text and the implementation agree.** Widening the exemption to
   several read-only path arguments and correcting the sentence are both
   defensible; shipping them in disagreement is not.
4. **Add the missing test level.** For each typed `nextAction` a component
   returns, assert that the guard admits it; for each required input path,
   assert it is obtainable under the guard. This is what would have caught all
   three, and it is the part that stops the class from regenerating.

## Related

- `2026-08-08-a-session-is-told-it-is-ready-but-never-how-to-repair.md` — the
  same promise seen from the operator's side.
- `2026-08-08-the-guard-refuses-the-bounded-diagnostic-its-own-skill-permits.md`
  — a previously filed member of exactly this class, which is the argument for
  fixing the level rather than the instances.
- `2026-08-07-guard-lifecycle-ready-rejects-plan-runtime-intent-argv.md`

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Closed (2026-08-11) — fixed.
- **Rationale:** all three prescribe/forbid contradictions (C1's diagnostic-code mismatch, C2's shell-guard-vs-preflight required path, C3's narrower-than-documented read-only exemption) were reconciled per the item's Direction 1-3 (`closure_commit` `ce1a7416fe2da9b106a3ffb386788252c6029476`).
- **Assignment:** N/A — already closed.
- **Date:** 2026-08-11.
