---
schema: pipeline.backlog-item.v1
id: pipeline.a-follow-up-epic-cannot-extend-the-closed-architecture-design
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-11
source: Consumer session finding K-13 for a second epic; confirmed against the source and not executed
sprint: alfred
done_when: manual
---

# A follow-up epic cannot add modules to the architecture design a closed epic materialized

## Description

A consumer project closed its first epic with a materialized architecture design (`architecture/design-materialization.json`). Its second epic brings new code modules, so its PRD architecture block names the old modules plus new ones. Reading the source, that block is refused after the plan signature with `ARCHITECTURE-DESIGN-RECEIPT-STALE`, and a PRD without the block is refused too. No documented route extends a closed design.

What the source does (`plugins/pipeline-core/lib/architecture-design.mjs`):

- `refreshReceiptAfterReapproval` refreshes a receipt only for the same feature and the same plan path (a reopened design).
- The next branch accepts the receipt of a closed predecessor only when the design digest and every target digest equal the new design's. An added module changes both digests, so the check ends in `ARCHITECTURE-DESIGN-RECEIPT-STALE`.
- The tests of C19-F1 and of the reopen route pin exactly this strictness ("nothing else refreshes").

## Decision

PO tile 2026-11-11: build the additive extension route. Built in candidate 28c in `architecture-design.mjs` with three tests (an addition is accepted and published over the recorded bytes; a removed or changed predecessor module, an open predecessor, an edited predecessor plan and a drifted target keep the refusal; a predecessor module may grow in three lists only). Still open: the documented way for a follow-up epic in the architecture guide, and a run on a real consumer repository. The route as built is an additive extension route: the predecessor is closed, every predecessor module is present, each target the receipt recorded still holds its recorded bytes (the existing preimage binding), and only added modules and targets are new. A predecessor module may grow in exactly three lists: its allowed dependencies, its public contracts and its verification entry points (PO tile 2026-11-11, after the first consumer found that a module owning the pages must reach every new module); every earlier entry stays, no other field changes, and growth must not close a dependency loop. The new plan signature stays the authority; the receipt records what is materialized. Anything that removes or otherwise changes a predecessor module keeps the refusal.

## Done when

The documented way for a follow-up epic is written into the architecture guide, and a follow-up epic with an added module has been materialized once in a real consumer repository.
