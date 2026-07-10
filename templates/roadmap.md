<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project roadmap — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: templates/CLAUDE.project.md block 6/7 (roadmap prose is FORBIDDEN
in CLAUDE.md — this file is its dedicated home), operating-model §6 (handover owns
state).
Language note (ADR-0011): template structure/instructions English; filled content
in the project's human-facing language, default English (primary reader: the PO —
planning/priorities are PO judgment).

USAGE
1. Copy to `{{ROADMAP_FILE default: docs/roadmap.md}}` in the project repo.
2. Fill in. Delete this comment block.

HARD RULES (checkable)
- This file holds INTENT (what/why next), never status or history.
  Why: three hand-maintained state copies demonstrably drifted (AP3); state has
  exactly one home (handover file), the past exactly one home (HISTORY.md).
  Check: close-ritual drift check — no "done" prose here; finished items
  are DELETED (their record is the HISTORY entry), not marked done.
- Item granularity: one line per item + optional 1–2 detail lines. Operational
  detail prose (configs, test plans) belongs in specs/backlog items — the
  <PROJECT_A> roadmap-bloat lesson (inventory: line density defeated the line limit).
  Check: length review at block close; items > 3 lines get moved to a spec/issue.
- Ordering is priority: top = next. Re-ordering IS the planning act and is
  the PO's call (P7 — judgment stays with the PO).
═══════════════════════════════════════════════════════════════════════════
-->

# Roadmap — {{PROJECT_NAME}}

> Purpose: intent and order ("what's next and why"). NO status
> (→ `{{HANDOVER_FILE}}`), NO history (→ `HISTORY.md`).
> Last prioritized: {{YYYY-MM-DD}} by the PO.

## Now (next block / next blocks)

| # | Item | Why now | Pre-triage (rigor/risk) |
|---|---|---|---|
| 1 | {{ITEM_1}} | {{BENEFIT_OR_PRESSURE}} | {{e.g. "tier 1 / medium"}} |
| 2 | {{ITEM_2}} | {{...}} | {{...}} |

## Up next (visible, not yet cut)

- {{ITEM_3 — 1 line}}
- {{ITEM_4 — 1 line}}

## Later / ideas (non-binding)

- {{IDEA_1 — 1 line; detail belongs in a backlog item, not here}}

## Deliberately NOT planned

{{Discarded or deferred items with a 1-sentence rationale — prevents
repeat debates (alternatives principle).}}

- {{NOT_PLANNED_1}} — {{rationale}}
