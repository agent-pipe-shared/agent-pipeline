---
schema: pipeline.backlog-item.v1
id: pipeline.two-handover-rotation-mechanisms-use-different-archive-conventions
type: workflow-improvement
owner: pipeline
status: open
created: 2026-08-17
source: "Discovered by dispatch NVA-HANDOVER-ROT-1 while wiring its own new close-block step alongside the pre-existing one; disclosed rather than reconciled unilaterally, per the dispatch's own explicit scope boundary."
---

# Two handover-rotation mechanisms both write to `docs/state-archive/`, with different naming/index conventions

## Description

This repository now has two independent, both-live rotation mechanisms for
`docs/state.md`, discovered to coexist while building
[ADR-0066](../../docs/adr/0066-handover-rotation-extraction-archive-hard-size-gate.md):

1. **`plugins/pipeline-core/scripts/rotate-handover-sections.mjs`**
   (landed 2026-08-12, commit `93f638e5`, ADR-0060 Decision 5 candidate 2,
   wired into `close-block/SKILL.md` step 6c). Auto-selects "closed"
   session-dated sections via retain-count/open-marker/cross-reference
   heuristics; archives to monthly buckets `docs/state-archive/<YYYY-MM>.md`,
   appending multiple sections per file; leaves an in-place pointer line
   where each section used to be.
2. **`plugins/pipeline-core/scripts/handover-rotate.mjs`** (landed
   2026-08-17, `NVA-HANDOVER-ROT-1`, ADR-0066, wired into `close-block/SKILL.md`
   step 6d). Requires an explicit `--section-heading` selection (no
   auto-detection); archives one rotation event to its own file
   `docs/state-archive/<ISO-date>--<slug>.md`; keeps a table-based
   "Archived history" index in the live file instead of pointer lines;
   requires a one-time `--acknowledge-extraction-done` marker before any
   rotation runs at all.

## Why this is not simply a duplicate (the "keep both" case)

`rotate-handover-sections.mjs`'s own fail-safe design retains any section
carrying an open marker unconditionally — by construction it can never
rotate a single still-OPEN block. `handover-rotate.mjs` exists specifically
to be invocable against a still-open block's own content (e.g. as the
remediation action when `guard-handover-size.mjs`'s hard cap refuses a
growing write mid-sprint). The two mechanisms answer genuinely different
questions — "what closed content can I safely auto-archive" vs. "rotate
exactly this, right now, on purpose" — not the same question twice.

## What is genuinely inconsistent

A human or agent browsing `docs/state-archive/` after both mechanisms have
run for real will see two different file-naming shapes and would need to
know both conventions to find anything. The live file correspondingly ends
up with two different "here's what got archived" idioms (scattered pointer
lines from 6c vs. one consolidated table from 6d) rather than one coherent
index.

## Proposal

Not designed here. Candidates, explicitly not a commitment:

1. **Converge on one archive-naming convention.** Either teach
   `rotate-handover-sections.mjs` to write per-event files matching
   `handover-rotate.mjs`'s convention (and update its own index/pointer
   style to match the table), or teach `handover-rotate.mjs` to append into
   the monthly-bucket convention instead of minting a new file per event.
2. **Keep both conventions, but document the split explicitly** as a
   permanent, intentional design (heuristic/close-time archiving stays
   monthly-bucketed; explicit/forced archiving stays per-event) — cheaper,
   but leaves the two-idiom browsing cost unresolved.
3. **Merge into one script with two modes** (`--auto` for candidate-2-style
   heuristic selection, `--section-heading` for explicit selection),
   sharing one archive convention and one "Archived history" index
   regardless of which mode wrote a given entry.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** accepted, resolved via Proposal option 2 ("keep both
  conventions, document the split explicitly as a permanent, intentional
  design"), not options 1 or 3 — cheapest, matches this item's own
  observation that there is no correctness bug and no live archive
  content yet to migrate, and preserves each mechanism's own justified
  reason to exist (heuristic close-time archiving vs. explicit
  forced-rotation-of-an-open-block).
- **Rationale:** both scripts' own header comments already explained
  *why* two mechanisms exist but called the naming-convention split an
  "open follow-up" rather than a decided design — that framing is what
  this item flagged as inconsistent-to-browse. Making the split an
  explicit, cited, permanent decision (rather than leaving both headers
  implying eventual convergence) closes the item without new rotation
  machinery or a risky mid-flight convention migration.
- **Assignment (if accepted):** done — both `rotate-handover-sections.mjs`
  and `handover-rotate.mjs` header comments now state the split is by
  decision and cite this item; no code behavior changed.
- **Date:** 2026-08-18
