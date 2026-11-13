---
schema: pipeline.backlog-item.v1
id: pipeline.scaffold-map-inventory-stays-design-pending-after-materialization
type: defect
owner: pipeline
status: open
created: 2026-11-13
source: "Codex greenfield run 3 report, point C13 (P2); PO tile 2026-11-13 places it after candidate 29"
sprint: alfred
done_when: manual
---

# The scaffold map inventory stays design-pending after materialization

## Description

A greenfield bootstrap writes `architecture/map/index.md` and `architecture/map/inventory.json` (schema `pipeline.architecture-map-scaffold.v1`, status `design-pending`, no modules). Materialization replaces the index with the designed module map, but it leaves `inventory.json` unchanged. So after materialization, one file still says `design-pending` with an empty module list. That misleads a reader. No gate reads it once the index has changed.

## Why it was not fixed in candidate 29

The materialization targets are bound in the receipt `architecture/design-materialization.json` (one digest per target). If a target is added or changed, a project that is already materialized gets a different expected receipt and is refused `ARCHITECTURE-DESIGN-RECEIPT-STALE`. That includes consumers in the middle of a feature course. A fix needs a receipt migration: a receipt written before the change must still be accepted, and that must be proven by a test against such a receipt.

## Decision

PO tile 2026-11-13: a backlog item after candidate 29.

## Done when

Materialization updates or retires the scaffold inventory, and a test proves that an earlier receipt is still accepted.
