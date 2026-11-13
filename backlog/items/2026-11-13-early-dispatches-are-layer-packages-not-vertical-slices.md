---
schema: pipeline.backlog-item.v1
id: pipeline.early-dispatches-are-layer-packages-not-vertical-slices
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-13
source: "Codex greenfield run 3 report, point C10 (P1); PO tile 2026-11-13 places it after candidate 29"
sprint: alfred
done_when: manual
---

# Early dispatches are layer packages, not the planned vertical slices

## Description

The Spec planned five vertical slices. The early dispatches were module or layer packages instead (one package per technical layer). So no thin end-to-end slice existed early that the PO could look at and accept. Nothing in the dispatch route compares the dispatched package with the slice plan of the Spec.

## Decision

PO tile 2026-11-13: a backlog item after candidate 29. This is process design, not a fix.

## Done when

The PO decides whether the dispatch route checks a package against the Spec's slice plan, or only reports the gap, and that decision is carried out.
