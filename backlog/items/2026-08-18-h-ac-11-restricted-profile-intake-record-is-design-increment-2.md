---
schema: pipeline.backlog-item.v1
id: pipeline.h-ac-11-restricted-profile-intake-record-is-design-increment-2
type: requirement
owner: pipeline
status: open
created: 2026-08-18
source: "Formalizing EPIC-AC-05's disposed bar for H-AC-11's O-4 scoping decision (PO, 2026-08-17, specs/sprint-phoenix-epic/acceptance.md), which named the fix but was never filed as a backlog item with an owner and trigger. See acceptance.md H-AC-11's 2026-08-18 disposition note."
---

# Build the restricted machine-local attribution record (GMW/HGO design D-1)

## Description

H-AC-11's no-join-handle clause was proved unsatisfiable for the GMW half
(`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
§5.2, O-4). The PO's 2026-08-17 amendment scoped the clause correctly (it
binds only the restricted machine-local decision record of that design's
§3.4, not a producer's own enforcement material) — but no intake path yet
produces that restricted record at all. The design itself
(§93 "D-1 — the restricted machine-local attribution record (increment 2)")
already places this build outside Phoenix's own increment 1 scope.

This item exists only to give that already-decided disposition the backlog
entry EPIC-AC-05 requires (an owner and a named trigger) — it does not
change or add scope beyond what the design document already specifies.

## Triggering situation

`specs/sprint-phoenix-epic/acceptance.md` H-AC-11's 2026-08-18 disposition
note, filed during the Sprint Phoenix closure sweep after finding the O-4
scoping decision had no corresponding backlog item.

## Affected artifact

`specs/sprint-phoenix-epic/design/gmw-hgo-evidence-intake-into-the-human-ledger.md`
(D-1, increment 2); the restricted machine-local decision record it
specifies has no producer anywhere in this codebase yet.

## Proposal

Build D-1 as scoped in the design document's own increment 2, once that
increment is undertaken. No target sprint named yet by the PO — the next
Pipeline session's Elephant should propose one at triage, or ask the PO to
name one, before this item is assigned.

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:**
- **Rationale:**
- **Assignment (if accepted):**
- **Date:**

### PO Decision — 2026-08-18

- **Decision:** Option C — since D-1's design is already complete and narrow, check whether it fits as a small, bounded dispatch at the tail end of the CURRENT sprint rather than waiting for or naming a whole new future sprint.
- **Rationale:** PO's direct choice.
- **Assignment:** Candidate for a bounded dispatch before this sprint closes — not deferred to a named future sprint.
- **Date:** 2026-08-18
