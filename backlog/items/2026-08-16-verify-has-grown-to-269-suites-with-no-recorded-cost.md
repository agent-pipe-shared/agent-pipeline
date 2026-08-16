---
schema: pipeline.backlog-item.v1
id: pipeline.verify-has-grown-to-269-suites-with-no-recorded-cost
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-16
source: "PO, 2026-08-16: 'Was man hier an dem repo gut sehen kann ist, dass verify inzwischen unglaublich krass angeschwollen ist und sehr lange dauert.' Counts and the absent-duration finding were measured in the same session."
---

# Verify has grown to 269 suites and records no per-suite cost

## Measured

269 registered suites. The verify evidence artifact records `name` and
`exitCode` per suite and **no duration**. Growth is therefore not merely
unbounded but invisible: nobody can name the ten suites that account for half
the runtime, because the number was never written down.

## Why it grows structurally

Every Critic finding tends to demand a regression test. Every guardrail rule
demands evidence. Every dispatch definition-of-done demands a check. Each is
correct discipline on its own, and there is no counterforce anywhere in the
process: no tiers, no selection, no consolidation, no cost accounting.

## The cost compounds with the candidate binding

Verify is slow *and* bound to one exact commit, so any following commit voids
the run. That product — not either factor alone — is what forces
one-committer-at-a-time serialization across a session. Filed alongside this as
`pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it`; the
two share a lever and should be picked up together or in that order.

## Four parts, when this is picked up

1. **Measure per-suite duration** and record it in the evidence artifact.
   Small, and it is the precondition for everything else — without it, any
   claim about which suites are expensive is guesswork.
2. **Declare per-suite inputs.** The same declaration the binding-envelope item
   needs. One mechanism serves both.
3. **Tier selective versus full.** Honest caveat: selective execution weakens
   the guarantee, so it only belongs with a tier split — selective during work,
   full before a candidate and before a push. That matches the gate structure
   the Pipeline already has rather than inventing a new one.
4. **A consolidation rule.** A new check must name the invariant it pins that
   no existing check already pins. Without it, part 3 only slows the growth
   rate instead of bounding it.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**
