---
schema: pipeline.backlog-item.v1
id: pipeline.measure-elephant-admin-load-next-round
type: workflow-improvement
owner: pipeline
status: open
created: 2026-11-10
source: "Claude greenfield report (592 Elephant messages, 69 percent cache reads); PO tile 2026-11-10"
sprint: alfred
done_when: manual
---

# Measure the Elephant's administrative load in the next greenfield round

## Description

The Claude report names 592 Elephant messages and a 69 percent share of cache reads. No later run has measured whether the one-command routes of candidates 24 to 27 reduced that load.

## Decision

PO tile 2026-11-10: measure it in the next greenfield round. The measurement decides whether anything is built.

## Done when

The next round reports messages and cache share per phase, and the PO decides from that number.
