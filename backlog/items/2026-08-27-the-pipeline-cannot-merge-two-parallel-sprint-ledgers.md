---
schema: pipeline.backlog-item.v1
id: pipeline.the-pipeline-cannot-merge-two-parallel-sprint-ledgers
type: requirement
owner: pipeline
status: open
created: 2026-08-27
source: "PO decision during the sprint_phoenix merge close-out, 2026-08-27: parallel sprints that later merge are a normal mode of work and the Pipeline must support it"
---

# The Pipeline has no way to merge two parallel sprints' backlog ledgers

## The requirement

**Two sprints running in parallel and merging later is a normal mode of work,
not an exception.** The PO stated this directly while closing the
`sprint_phoenix` merge. The Pipeline must support it. Today it does not: the
backlog ledger has no merge story at all, and the one real attempt exposed
that as a hard wall rather than a rough edge.

## What actually happened, as evidence

`origin/sprint_phoenix` and the Nova line each ran a full sprint against the
same backlog and the same hash-chained ledger (`backlog/transitions.ndjson`).
At merge time:

- The two chains share a prefix through sequence 144 and diverge after it.
  Each side's continuation is internally valid; they cannot both be "the"
  chain.
- Appending one side's entries to the other **re-sequences them**, which is
  mechanically fine — but it also makes them the FINAL transition for every
  item they touch, so the appended side silently becomes authoritative for
  those items' status. That is a state change disguised as a data merge.
- Keeping the two chains separate (what this merge did: Nova active, Phoenix
  preserved verbatim in `backlog/transitions-phoenix-history.ndjson`) keeps
  the data but leaves the second chain unverified by any tooling and
  unreachable by the checks that reason about item history.
- Ledger **amendments** — events that repair an earlier event, e.g.
  `pre-public-core-reachability-amendment` — carry a hardcoded `from`/`to`.
  Migrating them into the other chain asserts transitions that contradict the
  target item's current state whenever the other line has moved that item on.
  Measured here: appending all 38 of Phoenix's reachability amendments took
  `check-backlog-state.mjs` from 13 findings to 73 — sixty new, none resolved.
  18 of the 38 were safe; 20 contradicted current state.

None of these is a defect in a specific script. They are the same missing
capability seen from four sides.

## What a solution has to handle

Named from what this merge actually hit, not speculated:

1. **Two valid continuations of one chain.** Which is authoritative, and what
   happens to the other — discarded, archived, or genuinely interleaved.
2. **Status convergence.** When both lines moved the same item, the merge must
   decide the resulting status by a rule, not by whichever chain got appended
   last.
3. **Amendments whose target has moved on.** An amendment's `from`/`to` is a
   claim about a moment. Merging needs a defined answer: re-target, drop as
   superseded, or carry as historical-only.
4. **Verification of the archived side.** A preserved chain that no tooling
   validates is data nobody can trust later. It needs at least an integrity
   check, ideally the same one the active chain gets.
5. **Assertions that index by sequence number.** `backlog-state.test.mjs` BS26
   loads the real ledger and indexes by position. Any merge that re-sequences
   breaks such assertions by construction; the test contract needs a
   position-independent way to name an event (the `entryHash` already exists
   for exactly this).

## What was deliberately NOT done, and why

A partial migration was on the table and rejected by the PO: append the 18
amendments whose target item still sits at the status they assert, leave the
other 20 in the history file, and accept BS26 as not-applicable.

The classification was run — 18 safe, 20 contradicting — so the option was
real. It was rejected because it leaves a state nobody can explain later: some
of one set of amendments in the active chain, the rest not, split by a rule
that lives in a commit message. The PO's call was to **build the general
capability first and then migrate all 38 under one defined semantics.**

That is the better order. A partial merge is a second thing to undo once the
real mechanism exists, and it would make this very ledger the awkward case the
new mechanism has to special-case.

## Consequence for the current merge

`backlog-state-tests` (BS26) and `backlog-state-check` stay red on the
`sprint_phoenix` merge candidate. That is a known, recorded state, not an
oversight:

- The 38 amendments remain intact in
  `backlog/transitions-phoenix-history.ndjson`. Nothing is lost.
- The active chain is untouched and verifies.
- `check-backlog-state.mjs` reports the three findings that predate this merge
  entirely.

BS26 resolves when this item does, and no earlier.

## Triage

- **Decision:** open, unassigned. Needs its own PRD/Spec cycle — feature work
  on the backlog ledger's merge semantics, not a fix. Filed at PO instruction
  during the sprint_phoenix merge close-out, with the PO's explicit framing:
  parallel sprints that later merge are normal, and the Pipeline must be able
  to do it.
- **Blocks:** the migration of Phoenix's 38 reachability amendments, and with
  it BS26 and `backlog-state-check` on this merge candidate.
