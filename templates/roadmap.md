<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project roadmap — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: templates/CLAUDE.project.md block 6/7 (roadmap prose is FORBIDDEN
in CLAUDE.md — this file is its dedicated home), operating-model §6 (handover owns
state).
Language note (ADR-0011): template structure/instructions English; FILLED content
GERMAN (primary reader: the PO — planning/priorities are PO judgment).

USAGE
1. Copy to `{{ROADMAP_FILE default: docs/roadmap.md}}` in the project repo.
2. Fill in German. Delete this comment block.

HARD RULES (checkable)
- This file holds INTENT (was/warum als Nächstes), never status or history.
  Why: three hand-maintained state copies demonstrably drifted (AP3); state has
  exactly one home (handover file), the past exactly one home (HISTORY.md).
  Check: close-ritual drift check — no „done/erledigt" prose here; finished items
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

> Zweck: Absicht und Reihenfolge („was als Nächstes und warum"). KEIN Status
> (→ `{{HANDOVER_FILE}}`), KEINE Historie (→ `HISTORY.md`).
> Zuletzt priorisiert: {{YYYY-MM-DD}} durch the PO.

## Jetzt (nächster Block / nächste Blöcke)

| # | Vorhaben | Warum jetzt | Vor-Triage (Rigor/Risiko) |
|---|---|---|---|
| 1 | {{VORHABEN_1}} | {{NUTZEN_ODER_DRUCK}} | {{z. B. "Stufe 1 / mittel"}} |
| 2 | {{VORHABEN_2}} | {{...}} | {{...}} |

## Als Nächstes (sichtbar, noch nicht geschnitten)

- {{VORHABEN_3 — 1 Zeile}}
- {{VORHABEN_4 — 1 Zeile}}

## Später / Ideen (unverbindlich)

- {{IDEE_1 — 1 Zeile; Detail gehört in ein Backlog-Item, nicht hierher}}

## Bewusst NICHT geplant

{{Verworfene oder zurückgestellte Vorhaben mit 1-Satz-Begründung — verhindert
Wiederholungsdebatten (Alternatives-Prinzip).}}

- {{NICHT_VORHABEN_1}} — {{Begründung}}
