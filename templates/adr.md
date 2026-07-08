<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: ADR — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: docs/adr/README.md (conventions), existing ADRs 0001–0015 (format),
operating-model §2.2 ("no silently made fundamental decisions").
Language note (ADR-0011 primary-reader rule): this template's INSTRUCTIONS are
English (agent-facing); the FILLED ADR content is GERMAN — ADRs are explicitly
human-facing documents ("alles, was the PO liest, prüft und abnimmt"). The German
section headings below are kept verbatim for consistency with docs/adr/ 0001–0015.

USAGE
1. Next free number: NNNN = highest existing number in the target adr/ directory + 1.
   Filename: `NNNN-<kebab-slug>.md`.
2. Fill all sections IN GERMAN. Delete this comment block.
3. MUST: add a row to the ADR index (`docs/adr/README.md` table; projects keep an
   equivalent index). Why: unindexed ADRs are invisible to future sessions.
   Check: index row exists in the same commit.
4. MUST: an ADR is never rewritten — it is superseded by a new ADR
   (old status becomes „ersetzt durch NNNN"). Why: decision history must stay
   reconstructable. Check: git log shows no content
   rewrites of accepted ADRs beyond status/typo fixes.
5. MUST: quote the underlying register/decision wording verbatim where one exists
   („Entscheidung (Ex, wortgetreu)"). Why: the register is canonical on conflict.
6. If a follow-up date/trigger exists, also add it to the index's
   „Wiedervorlagen" table.

Status vocabulary: „vorgeschlagen" | „akzeptiert (YYYY-MM-DD, <Gate>)" |
„abgelehnt" | „ersetzt durch NNNN".
═══════════════════════════════════════════════════════════════════════════
-->

# ADR-{{NNNN}}: {{TITEL — Entscheidung als Aussage, nicht als Frage}}

> {{PROJEKT_ODER_PIPELINE_KENNUNG e.g. "Agent-Pipeline v0.1.0-draft"}} · {{PHASE_ODER_SPRINT}} · Stand {{YYYY-MM-DD}}

**Status:** {{STATUS}} · **Grundlage:** {{REGISTER_EINTRAG / AUFLAGE / ANLASS mit Verweis, e.g. "Entscheidungsregister-Eintrag ([state.md](../state.md))"}}

## Kontext

{{2–6 Sätze: Welche Kräfte/Fakten erzwingen eine Entscheidung? Belege als
repo-relative Verweise (Findings, Inventar, Reviews). Keine Lösungsprosa.}}

## Entscheidung

{{Bei Register-/PO-Entscheid: wörtliches Zitat in Blockquote, dann Präzisierung
als Liste. Sonst: die Entscheidung in 1–3 Sätzen, dann Präzisierung.}}

> {{WOERTLICHES_ZITAT_FALLS_VORHANDEN}}

Präzisierung:

- {{PRAEZISIERUNG_1}}
- {{PRAEZISIERUNG_2}}

## Konsequenzen

**Positiv:** {{was wird besser}}

**Negativ:** {{welcher Preis wird bewusst bezahlt}}

**Risiko:** {{Restrisiko + Mitigation, falls vorhanden}}

## Verworfene Alternativen

- **{{ALTERNATIVE_1}}** — {{Grund der Verwerfung, 1 Satz}}
- **{{ALTERNATIVE_2}}** — {{Grund der Verwerfung, 1 Satz}}

## Wiedervorlage

{{„Keine." ODER Termin/Trigger + was dann zu prüfen ist. Trigger auch in die
Wiedervorlagen-Tabelle des ADR-Index eintragen.}}
