# ADR-0022: Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-05, Tuning-Session) · **Grundlage:** Register E22

## Kontext

Speed-Tuning identifizierte mehrere Hebel; zwei davon betreffen den Goldfish direkt — ein leichtgewichtiges Dispatch-Profil für Stufe-0-/Mechanik-Aufgaben und ein genereller Effort-Default in Parität zur Elephant-Kalibrierung (Register E16, [ADR-0006](0006-modell-effort-policy.md)).

## Entscheidung (E22, wortgetreu)

> Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default (the PO 2026-07-05, Tuning-Session): (a) Opt-in `Profil: light` für Stufe-0-/Mechanik-Dispatches — kompakter 3-Feld-Report, Referenz-Inlining, kein Pre-Edit-Baseline-verify, Effort `xhigh`; **GF-08-Evidenz + GF-07-Stops unangetastet; NIE für Klasse hoch/Guardrails**. (b) **`xhigh` wird der generelle Goldfish-Standard-Default** (Parität zur E16-Elephant-Kalibrierung): `max` nur groß/komplex/Guardrail, `high` nur trivial/gleichförmig. Umgesetzt: operating-model §3.3, roles/goldfish.md §6, roles/elephant.md EL-05, goldfish-task.md, MP-02/MP-06/Rollen-Matrix (Commit `6b8b1c3`). Speed-Hebel #1/#2/#5 aus `2026-07-04-pipeline-durchsatz-speed.md`; #3/#4 vertagt. **Offen:** Goldfish-Implementor-Frontmatter (`effort: max`) auf `xhigh` nachziehen (Retro P1) — **erledigt 2026-07-05 (Welle 2, M6, Commit `886db4f`)**. ADR-Formalisierung Phase 2.

## Konsequenzen

**Positiv:** Schnellere, günstigere Durchläufe für mechanische/Stufe-0-Aufgaben; Effort-Parität zwischen Elephant und Goldfish reduziert Overthinking-Overhead bei Standard-Dispatches.

**Negativ:** Zwei Effort-Regimes (Light-Profil vs. Standard) erhöhen die Kalibrierungs-Oberfläche im Briefing.

**Risiko:** Das Light-Profil könnte fälschlich für Klasse-hoch-/Guardrail-Arbeit gewählt werden — ausdrücklich ausgeschlossen („NIE für Klasse hoch/Guardrails"); GF-08/GF-07 bleiben als Sicherung unangetastet.

## Verworfene Alternativen

- **`max` als genereller Goldfish-Default beibehalten** — verworfen zugunsten von `xhigh` (Parität zu E16, Speed-Hebel).
- **Light-Profil auch für Klasse hoch/Guardrails öffnen** — ausdrücklich ausgeschlossen.

## Wiedervorlage

Keine terminiert; Speed-Hebel #3/#4 bleiben vertagt (nicht Bestandteil dieser Entscheidung).
