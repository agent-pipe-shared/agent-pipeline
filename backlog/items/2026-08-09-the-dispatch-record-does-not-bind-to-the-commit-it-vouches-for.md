---
schema: pipeline.backlog-item.v1
id: pipeline.dispatch-record-does-not-bind-to-its-commit
type: defect
owner: pipeline
status: open
created: 2026-08-09
due: 2026-08-23
source: "Found independently by all three Critic rounds against the 0.5.4 candidate (A-F2/A-F5, B-F3, C-F3/C-F4), then reproduced by the Elephant one hour later in 1c3cd86."
---

# The dispatch record is the authorship evidence, and it does not bind to the commit

## What happens

Authorship of a production diff is supposed to be provable from two artifacts:
the `Dispatch: <TASK_ID> (goldfish)` commit trailer, and the dispatch record
under `evidence/`. Three independent Critic rounds reviewing twenty commits found
that neither one holds, in four distinct ways.

**1. The trailer is simply absent.** `1dade30`, `d71aa71`, `25ae385`, `33a9f38`
and `da77e75` carry only `AI-Assisted: true`. Two of them are the largest
production diffs in their review sets — a 253-line generator and a 421-line
operator tool that writes protected test paths. `d71aa71` is the commit that
*introduces* the obligations document stating the trailer rule.

**2. The trailer is present and the record contradicts it.**
`evidence/dispatch-record-SHIP-2.json` records `outcome: "stopped-tool-budget"`
and names the work it did *not* reach; `02a8888` performs exactly that work and
carries `Dispatch: SHIP-2 (goldfish)`. `evidence/dispatch-record-SETUP-34.json`
says SETUP-4 was never started; `537eae2` performs SETUP-4 under that ID. Either
a second dispatch went unrecorded or the trailer is inaccurate, and the evidence
cannot distinguish the two.

**3. The record names a different commit entirely.**
`evidence/dispatch-record-AUTHAPPLY-1.json` was offered as authorship evidence
for a review set and names commit `e5a6a9b`, with changed files belonging to a
different subsystem.

**4. Most records are never finished.** `GRAMMARHINT-1`, `OBLIG-1`, `REPAIRMAP-1`,
`R1`, `R1B`, `R2A`, `R2D`, `R3` all sit at `outcome: "in-progress"` with an empty
or null `report`. The field that exists specifically so a truncated run stays
legible is the field that truncation takes out first.

**5. A trailer can be attached by someone who did not do the work.** `1c3cd86`
carries `Dispatch: GUARDFIX-2 (goldfish)` and was made by the Elephant, running a
generator the goldfish's scope excluded. The correct trailer for Elephant
stage-0 work is `AI-Assisted: true` alone. Nothing caught it, because nothing
checks that a named dispatch ID belongs to a record whose scope covers the
committed paths.

## Why the existing check does not catch any of this

The authorship check runs at close and looks for the presence of a trailer. All
five failures above are about *correspondence*, not presence: a trailer with no
record, a record with no matching commit, a record whose own contents deny the
commit, an unfinished record, and a trailer naming a dispatch that did not do
the work. Presence is the one property that was cheap to check, and it is the
one property that carries no information.

## The asymmetry that makes this worse than it looks

The trailer costs one line and is written by the party being vouched for. The
record is written by the same party. Nothing external observes the dispatch. So
the entire authorship story is self-reported, and the Critic — the one reader
whose whole job is to not take the implementor's word for anything — is handed
self-reported evidence as its authorship input. Round B put it exactly: for the
two largest production diffs "there is no deterministic evidence that the work
came from a dispatched fresh-context session rather than the orchestrator
session."

## Direction

1. **Bind the record to the commit, mechanically.** A record should name the
   commit it produced, and a check should verify that every `Dispatch: <ID>`
   trailer resolves to a record whose `outcome` is terminal and whose named
   paths cover the commit's paths. That check can run at close and in CI, and it
   is what turns the pair into evidence rather than a claim.
2. **Make the record's terminal write the same act as the commit.** The record
   is written last and truncation takes it; the commit is written last and
   survives. Whatever ordering makes the commit reliable should carry the record
   with it.
3. **Give the Elephant its own trailer.** Stage-0 Elephant work is legitimate and
   currently indistinguishable from unattributed work, which is why `1c3cd86`
   reached for a goldfish ID that did not fit. A trailer that says what actually
   happened is cheaper than a rule telling people not to misuse the one that
   exists.
4. **Do not fix this by rewriting history.** Every commit named above stays as
   it is; the record of what went wrong is worth more than a clean log.

## Related

- `2026-08-08-agents-are-judged-by-rules-no-artifact-ever-tells-them.md` — the
  general shape: a rule that is enforced socially rather than mechanically.
- `2026-08-08-the-grammar-refusal-does-not-say-which-part-of-the-command-failed.md`
  — the same block, and the same root cause for its withdrawn claim: something
  was asserted that nothing measured.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** Direction 1 (mechanical binding check) already exists —
  `plugins/pipeline-core/scripts/dispatch-authorship-verify.mjs` implements
  SHA binding, outcome terminality, path coverage, and recorded-model-vs.-
  agent-definition checking against exactly the five failure shapes this
  item describes, with its own header citing this item by name. It is
  deliberately NOT wired into `harness/scripts/verify.mjs` (TP-3) — a
  standalone diagnostic runnable at close, in CI, or by a Critic against a
  review set, so it never silently strengthens the gate. The Critic
  reviewing `NVA-GMWFIX-2` ran it live against `04a663d9` and found two real
  record defects with it (non-terminal outcome, missing `effort` field),
  both fixed the same session — direct evidence the tool works, not just
  that it exists. Directions 2 (write-ordering so the record survives
  truncation the way the commit does) and 3 (an Elephant-specific trailer
  distinct from the sanctioned `stage-0 (elephant)` form already in use) are
  genuinely still open design questions, unimplemented. This item stays
  open for those two; it is not the "not yet dispatched" state a hasty
  re-read of this item briefly (and incorrectly) recorded in `docs/state.md`
  on 2026-08-17 before this correction.
- **Rationale:** avoid dispatching duplicate work for something that already
  exists and is independently proven to catch real defects; keep the item
  open only for its genuinely unimplemented remainder.
- **Assignment (if accepted):** Directions 2/3 unassigned, no urgency signal
  beyond this item's own text — pick up in a dedicated design pass, not
  this AFK block.
- **Date:** 2026-08-17
