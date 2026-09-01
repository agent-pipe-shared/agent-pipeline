# Hook-bypass is never agent-overridable

> Agent-Pipeline · Sprint Nova B · as of 2026-09-01

> **Accepted as ADR-0079 on 2026-09-01.** Numbered in the act of acceptance per
> [ADR-0069](0069-adr-numbers-are-allocated-at-acceptance.md) Decision 2 — this file and its index
> row in `docs/adr/README.md` are one commit.

**Status:** accepted (2026-09-01, PO decision in session).

**Governs:** guardrails/git.md, plugins/pipeline-core/hooks/guard-git.mjs

Specifically: `guardrails/git.md` GIT-07 (the sentence stating that GIT-04's double-confirmation
override applies to `GG-17`…`GG-20` "exactly like every other rule id"), and
`guard-git.mjs`'s treatment of `GG-17`/`GG-18`/`GG-19`/`GG-20` inside `UNION_BLOCKERS`.

## Context

### What was measured, not assumed

`CLAUDE.md`'s push-policy bullet already states that what stays forbidden is enforced by the guard
union "not by asking", and lists "never skip hooks" among the things that stay forbidden regardless
of `gates.push_approval` mode. That sentence already states this decision's substance.

`guardrails/git.md` GIT-07, at the line documenting the hook-bypass rules `GG-17`…`GG-20`, states
the opposite: "The GIT-04 double-confirmation override mechanism applies to `GG-17`…`GG-20` exactly
like every other rule id — no separate procedure." Read against `plugins/pipeline-core/hooks/guard-git.mjs`,
that sentence is mechanically accurate as the code stands: `GG-17`, `GG-18` and `GG-20` are ordinary
members of the `UNION_BLOCKERS` array (`id: "GG-17"` sits beside every other deny rule in the same
list); `GG-19` sits in a separate `PRENORM_BLOCKERS` array for matching reasons unrelated to
override eligibility (it must match before global-option normalization to see a `-c
core.hooksPath=...` rebind at all). All four feed the SAME `matched` array the
`PIPELINE_GUARD_OVERRIDE` arming mechanism evaluates (`PRENORM_BLOCKERS` results are pushed into
`matched` alongside `UNION_BLOCKERS` results before the override-coverage check runs), so a
correctly-armed `OVERRIDE GG-17` (or `GG-18`/`GG-19`/`GG-20`) would in fact lift the corresponding
block today.

**This ADR therefore resolves a live inconsistency between two governing documents, rather than
inventing a new rule.** `CLAUDE.md` already said hook-skip stays forbidden; `guardrails/git.md`
already said the opposite, in the exact rule it was describing. Both cannot be true of the same
code path. The inconsistency itself was already recorded, unresolved, in `docs/state.md`'s
"Durable rules carried forward" section (item 2, extracted 2026-08-31): "`git push --no-verify`
deliberately remains available as git's own escape route (PO instruction) ... This sits in
unresolved tension with `guardrails/git.md` GG-17, which states the opposite as a guard-enforced
MUST NOT with no carve-out. The tension itself is unrecorded and needs a PO decision." This ADR is
that decision.

### The precedent this decision follows

`GIT-03` (correlation data must not enter commit metadata) is already evaluated BEFORE the
deny-rule union and is already, deliberately, not overridable — see
`plugins/pipeline-core/hooks/guard-git.mjs` at the `GIT-03` block, whose comment states the
rationale directly: "The override mechanism exists for rules whose violation is recoverable; this
one's is not. A commit that reaches a public remote carrying a session URL cannot be un-published,
and this repository has the receipts: 53 of 74 such commits were already public and unrewritable by
the time a human noticed by reading them." Hook-bypass follows the identical shape: once a commit
or push has skipped its hooks and reached a shared or public state, the skip cannot be undone by
reverting the commit — whatever the hooks would have caught (a guard-checked invariant, a
protected-path refusal, a review gate) has already been bypassed for that act, permanently. The
new decision below follows `GIT-03`'s shape, not `GIT-04`'s.

## Decision

**Pushing through the Pipeline with `--no-verify` is a matter of principle: it is never permitted,
and the guard must catch it.** For the agent, hook-bypass has no override route. The existing
`OVERRIDE <rule-id>` double-confirmation escape (GIT-04) MUST NOT apply to `GG-17`, `GG-18`,
`GG-19`, or `GG-20` — not by a second confirmation, not by any arming mechanism, not by any
in-session PO instruction. This is a stronger position than an ordinary deny rule: it is not that
the override is hard to obtain, it is that no route to lift these four rules exists for an agent
at all, matching the `GIT-03` precedent above rather than the general GIT-04 procedure.

### The human-exception boundary

**If the PO deliberately pushes manually in their own terminal using `--no-verify`, that is a
conscious human exception — it should be documented when it becomes known, but it is outside the
Pipeline's authority.** The Pipeline's guard union runs inside an agent's tool-call path; it has no
claim over a human operator's own terminal, and this decision does not attempt to create one. Three
things follow from this boundary, and none of them may be blurred:

1. A human-run `--no-verify` push is never retroactively legitimised by the agent — no
   after-the-fact `approve-push` record, no backfilled evidence entry, no ADR amendment recasting
   it as sanctioned. It stays exactly what it was: a human acting outside the system the Pipeline
   governs.
2. It is documented when it becomes known — in the handover or an incident record — as a fact about
   what happened, not folded silently into "normal" push history.
3. The agent never arranges, suggests, or scaffolds this path for the PO. Recommending "you could
   just push with `--no-verify` yourself" defeats the boundary by turning a rare deliberate human
   act into a routine agent-offered escape hatch.

This boundary is the necessary complement to the decision above, not a weakening of it: the guard
closes the route for the agent completely; it does not and cannot reach outside the tool-call
surface it governs.

## Open scope question (not decided here)

The PO's words in session named **pushing** with `--no-verify`. The guard rules in scope are wider:
`GG-17` matches `--no-verify` on any `git` subcommand (commit or push alike); `GG-18` (`git commit
-n`), `GG-19` (`-c`/`--config-env core.hooksPath` transient rebind), and `GG-20` (`git config
core.hooksPath` persistent rebind) cover the other hook-bypass forms for both commit and push.
`CLAUDE.md`'s existing wording ("never skip hooks") already reads as covering both without
qualification.

**The recommended reading, not yet confirmed by the PO, is the whole hook-bypass family — commit
and push alike.** Splitting `GG-17`'s push-only application from `GG-18`/`GG-19`/`GG-20`, or from
`GG-17`'s own commit-side matches, would create a fresh inconsistency of exactly the kind this ADR
exists to remove: a guard document that says hook-bypass is categorically forbidden in one place
and only-for-push-and-overridable-for-commit in another. If only the push case was meant, the PO
should correct this reading; until then, this ADR treats all four rules, for both `git commit` and
`git push`, as non-overridable.

## Consequences

**Positive.** `CLAUDE.md` and `guardrails/git.md` stop contradicting each other on a guard-code
question. The `GG-17`…`GG-20` family gets the same non-overridable treatment as `GIT-03`, on the
same recoverability rationale, rather than living inside the general GIT-04 escape whose whole
premise (a human-confirmed, logged, one-time exception) is wrong for an irreversible bypass.

**Negative.** None expected: this closes a route that was never meant to be open (per `CLAUDE.md`'s
existing wording) rather than removing a route that was in legitimate use.

## What this decision does NOT do

- It does not change `plugins/pipeline-core/hooks/guard-git.mjs` or `guardrails/git.md`. This ADR
  records the decision; the code and guardrail-text change is a separate, Critic-mandatory
  implementation step (tracked in
  `backlog/items/2026-09-01-hook-bypass-rules-are-overridable-against-the-stated-policy.md`).
- It does not touch the `GIT-03` mechanism itself, only cites its precedent.
- It does not grant the agent any new authority over a human's own terminal, nor does it change
  `GIT-04`'s double-confirmation procedure for any other rule id.

## Alternatives considered

### Rejected: leave `GG-17`…`GG-20` inside the general GIT-04 override

This is the status quo `guardrails/git.md` GIT-07 currently describes. Rejected because the PO's
stated principle is categorical ("never permitted"), and the GIT-04 override's own premise —
logged, human-confirmed, but still granting the agent a route — does not fit an action the PO
wants to have no agent-side route at all.

### Rejected: scope the decision to push only, silently

Rejected because `GG-17` alone spans both commit and push, and CLAUDE.md's existing wording already
reads as covering both; silently narrowing the ADR's scope to only what the PO's spoken words named
would re-introduce the same category of inconsistency this ADR exists to close. Recorded instead as
an open question above, for the PO to confirm or correct.

## Follow-up

- Implementation: `backlog/items/2026-09-01-hook-bypass-rules-are-overridable-against-the-stated-policy.md`
  — corrects the `guardrails/git.md` GIT-07 sentence and moves `GG-17`…`GG-20` out of the
  overridable union, following the `GIT-03` precedent (evaluated non-overridably, with a stated
  recoverability rationale). Scheduled for the maintenance window, not immediate implementation.
- The PO should confirm or correct the open scope question above (commit-and-push vs. push-only).
