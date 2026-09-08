---
schema: pipeline.backlog-item.v1
id: pipeline.guard-dispatch-budget-does-not-distinguish-invalid-identity-from-unresolved
type: defect
owner: pipeline
status: closed
created: 2026-08-29
closed_at: 2026-08-29
closure_repository: self
closure_commit: 865d8d9d32e732d4576c0177b64aca25c2cf39db
closure_evidence: plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs
sprint: nova
done_when: "contains plugins/pipeline-core/hooks/guard-dispatch-budget.test.mjs assert.equal(record.reason, \"agent-id-present-but-not-a-string\");"
source: "NVA-R6-GUARDSWEEP guard-layer sweep (backlog/items/2026-08-29-sweep-remaining-guards-for-fail-open-identity-and-pipe-unpiped-scope-asymmetry.md), auditing guard-dispatch-budget.mjs for its OWN direct callers/uses of subagentIdentity()'s unresolved result beyond the guard-lifecycle-ready.mjs caller already covered by F02 (pipeline.identity-attestation-fail-closed-fallback, fixed 2026-08-29)."
---

# guard-dispatch-budget.mjs's own budget gate does not special-case `invalid-identity`, falling through to the same silent admit as `unresolved`

## Description

`subagentIdentity()` (`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`,
exported, lines 191-243) is the shared identity resolver both this file and
`guard-lifecycle-ready.mjs`'s `evaluateBootstrapReceiptGate` consume. As of the
2026-08-29 fix (`pipeline.identity-attestation-fail-closed-fallback`), it
returns THREE distinguishable kinds relevant here: `"orchestrator"`
(deliberately never limited), `"unresolved"` (genuinely ambiguous — a real
orchestrator payload observed with no usable `transcript_path`), and
`"invalid-identity"` (a `transcript_path` that IS present but is not a usable
absolute string — never a legitimate orchestrator shape, carrying a fixed
sentinel `agentId`/`agentType` specifically so a receipt-gated caller denies it
by construction).

`guard-dispatch-budget.mjs`'s own `evaluateDispatchBudgetGuard()` (lines
409-464) is a direct, in-file consumer of `subagentIdentity()`'s result, and it
only branches explicitly on two of the three kinds:

```js
if (identity.kind === "orchestrator") { ...; return verdict(0); }
if (identity.kind === "unresolved") { recordUnresolved(...); return verdict(0); }
const maxTurns = (options.resolveMaxTurnsFn ?? resolveMaxTurns)(identity.agentType, rootDir, options);
if (maxTurns === null) { recordUnresolved(...); return verdict(0); }
```

`identity.kind === "invalid-identity"` matches neither `if`, so it falls
through to the `maxTurns` resolution using `identity.agentType ===
"unattested-invalid-transcript-path"` (the sentinel type). No agent
definition file exists for that name, so `resolveMaxTurns()` returns `null`,
which routes into the SAME `recordUnresolved(...); return verdict(0);` branch
as a genuinely ambiguous identity — i.e. the call is silently admitted
(never counted toward, or capped by, the dispatch tool-budget), exactly the
`"unresolved"` fate the 2026-08-29 fix specifically introduced
`invalid-identity` to be distinguishable from for a receipt-gated caller.

This file's own header (`## Fail-open-but-visible`, written 2026-08-27, two
days before `invalid-identity` existed) declares the WHOLE guard fails open on
any unresolvable point in the identity/budget chain, by design, "because a
guard that fails closed on its own confusion would halt every dispatch in the
repository" — so this is not silently unreasoned. But that blanket rationale
was written before the three-way kind split existed, and was never revisited
once it did: the practical effect is that a payload carrying a present-but-
unusable `transcript_path` (the exact shape the sentinel exists to flag) is
never rate-limited by this guard at all, silently defeating the tool-budget
safety net for precisely the identity shape most worth suspecting.

## Triggering situation

NVA-R6-GUARDSWEEP dispatch, 2026-08-29, sweeping the 13-file
`plugins/pipeline-core/hooks/guard-*.mjs` population for the two defect
shapes named in the sweep item, per that item's explicit instruction to audit
`guard-dispatch-budget.mjs`'s own direct callers/uses of
`subagentIdentity()`'s `unresolved` result "not only the guard-lifecycle-
ready.mjs caller already covered by F02."

## Affected artifact

`plugins/pipeline-core/hooks/guard-dispatch-budget.mjs`, function
`evaluateDispatchBudgetGuard` (lines 409-464), specifically the branch at
lines 433-438 (`if (identity.kind === "unresolved")`) and the fallthrough at
lines 440-447 (`maxTurns === null`), which together are the only paths an
`invalid-identity` result can reach.

## Proposal

Add an explicit `identity.kind === "invalid-identity"` branch to
`evaluateDispatchBudgetGuard()`, deciding deliberately (rather than by
fallthrough) whether this gate should treat it the same as `unresolved` (a
reasoned, stated exception — the budget gate's own risk profile may genuinely
differ from the receipt gate's) or should record/handle it distinctly. Not
fixed by this dispatch, which is audit-only per its own briefing; filed for a
follow-up implementation task with its own tests.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

## Historical invariant retirement — 2026-09-08

The closure fields above remain the historical implementation binding. The
budget-specific discriminator subsequently moved from transcript topology to
the measured agent-ID key contract; the shared `subagentIdentity()` resolver
remains a separate lifecycle dependency. Consequently the old budget
`invalid-identity` branch has no producer and its named invariant is retired
explicitly in NVA-B-BUDGET-RESIDUE-1, not preserved as a misleading code marker.

The current observability obligation is to record malformed agent identity
with its actual reason, separately from a resolved identity whose turn cap
cannot be found. The metadata predicate now names the retained direct test
assertion for the non-string agent-ID reason. It is a structural regression
tripwire; its presence alone does not prove a test ran. The package's actual
behavioral results and limitations belong in
`backlog/evidence/2026-09-08-budget-observation-bound.md`.

This maintenance changes neither status nor any historical closure field.
The item's three ledger events are status/closure reconciliation records,
without an item-content hash pin, so no new transition or amendment is asserted.
