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

- **Decision:** accepted — part 1 only (measure and record per-suite duration in the evidence artifact). Parts 2-4 stay open; part 3 in particular (selective-vs-full tiering) trades away a real guarantee and is exactly the kind of scope-widening decision that belongs with the PO, not assumed here.
- **Rationale:** part 1 is explicitly the precondition for everything else and carries no weakening of its own — pure additive instrumentation.
- **Assignment (if accepted):** Nova A AFK-session closeout, folded into the next local 0.5.5 candidate.
- **Date:** 2026-08-16

### Update, 2026-08-17 — part 1 half-landed; the remaining half is a small, PO-gated refresh, not more design

`plugins/pipeline-core/scripts/verify-journal.mjs`'s `runVerifyJournal` now
computes and returns `durationMs` per step (commit `ce9bf7e1`, 9/9 tests,
independently re-verified). `harness/scripts/verify.mjs` itself still
discards it (TP-3 protected; the one-line propagation fix is written down in
that commit's own message, ready to dispatch). The block was a real,
correctly-signed PO Guard Maintenance Window covering TP-3 that a separate
bug (fixed same session, `e31f0233`) had made unreadable — but fixing that
bug in this checkout doesn't reach the physically separate marketplace copy
this session's Claude guards actually enforce from
(`docs/claude-local-plugin-development.md`, "copy not a link," refreshed only
by an operator running `cp -a` + `claude plugin update` outside any agent
session — full diagnosis in `docs/state.md`'s 2026-08-17 entry). Next PO
action, whenever they're back: run that two-command refresh; the remaining
`verify.mjs` line is then a same-day dispatch.

### Update, 2026-08-17 (continued) — part 2 has its own accepted ADR now, candidate (a) implemented and Critic-passed

`docs/adr/0065-a-voided-gate-is-re-earned-from-declared-inputs.md` is
`accepted` and is, in its own words, "literally part 2 of" this item
("declare per-suite inputs"). Candidate (a) of its Follow-up (finish the
existing declared-input mechanism rather than building a second one) landed
(`3580b41f`), independently re-verified with a real double full `verify.mjs`
run, Critic-passed. Candidate (b) (runtime-enforced Tier-B narrowing,
piloted on one small non-spawning suite) is in flight as `NVA-ADR65B-1`;
candidate (c) (narrow further suites, ordered by the `durationMs` part 1
above now records) is not started. Part 3 (selective-vs-full tiering) stays
explicitly out of scope of ADR-0065 and still needs its own PO-visible
decision, per this item's own original Triage above. Part 4 not assessed.
