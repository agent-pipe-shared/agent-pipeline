---
schema: pipeline.backlog-item.v1
id: pipeline.materialize-architecture-leaves-inventory-json-as-the-empty-scaffold
type: defect
owner: pipeline
status: open
created: 2026-10-18
source: "real greenfield project report 2026-10-18 (unnumbered finding from the same run)"
sprint: none
done_when: manual
---

# `materialize-architecture` leaves `inventory.json` as the empty scaffold

## Description

After a successful `materialize-architecture`, `architecture/map/inventory.json` is still the
greenfield scaffold (`modules: []`, `status: design-pending`), and the materialization
receipt's targets omit it, while the module concept files `architecture/map/<id>.md` are
written. The map then states no modules in one place and several in another.

## Triggering situation

Materialization after plan approval in a real greenfield project. Whether any consumer reads
`inventory.json` still has to be checked; the fitness evaluator loads modules from the concept
files (`scripts/module-inventory.mjs`, `loadMapBundle`).

## Proposal

First establish whether anything reads `inventory.json`. If so, have materialization update it
and list it in the receipt targets; if not, remove it from the scaffold or mark it as derived.

## Acceptance

- The consumer check is recorded in this item.
- After materialization, `inventory.json` either matches the concept files and is in the
  receipt, or no longer exists as a contradicting artifact.
