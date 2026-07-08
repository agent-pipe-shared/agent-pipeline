# ADR-0024: Critic-Stufung — datenbasierte Revision des E12/E6-Staffings

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** akzeptiert (Welle 2, M11) · **Grundlage:** Register E24

## Kontext

Drei aufeinanderfolgende Kanon-Critics mit Readiness+First-Pass endeten bei 0 Befunden; echte Blocker traten bislang nur auf riskantem Live-Code auf (S39 2× Blocker, S40 fail-open-Major). Welle 2 revidiert auf dieser Datenbasis die Critic-Staffing-Regeln aus [ADR-0014](0014-critic-kontrakt.md) (E12) und [ADR-0006](0006-modell-effort-policy.md) (E6).

## Entscheidung (E24, wortgetreu)

> Critic-Stufung (Welle 2 M11, revidiert E12/E6-Staffing; datenbasiert + Meta-RADAR-Beleg): NEU Mechanik-Auto-Pass (deterministische Diffs: Lockfiles/Generiertes/reine Formatierung → kein Critic, Evidenz = erzeugendes Kommando + verify) · Klasse mittel = Sonnet-KASKADE (Eskalation zu Fable NUR bei Befund ≥major / A-G-S-Berührung / Contested) · Klasse niedrig = non-blocking parallel zulässig (Disposition vor Wave-Close) · EIN gebündelter Critic je Welle = Standard · Klasse hoch/A-G-S unverändert Fable + blockierend (T1 unangetastet). Datenbasis: letzte 3 Kanon-Critics nach Readiness+First-Pass = PASS 0 Befunde; echte Blocker nur auf riskantem Live-Code (S39 2×BLOCKER, S40 fail-open-MAJOR). ADR-Formalisierung Phase 2

## Konsequenzen

**Positiv:** Spart Fable-Kosten bei mechanischen/mittleren Diffs, ohne beobachteten Verlust an Fehlerfindung auf Kanon-Material; die T1-Pflicht (Klasse hoch/A-G-S) bleibt vollständig unangetastet.

**Negativ:** Die neue Staffing-Logik (Mechanik-Auto-Pass, Sonnet-Kaskade, non-blocking-parallel bei Klasse niedrig) erhöht die Fallunterscheidungs-Komplexität im Critic-Kontrakt.

**Risiko:** Die Sonnet-Kaskade könnte einen major-Befund unentdeckt lassen, der eine Fable-Eskalation ausgelöst hätte. Mitigation: Das Eskalationskriterium ist explizit definiert (Befund ≥major / A-G-S-Berührung / Contested), nicht dem Ermessen überlassen.

## Verworfene Alternativen

- **Fable-Critic pauschal für Klasse mittel beibehalten** — durch die 0-Befund-Datenlage der letzten drei Kanon-Critics als unwirtschaftlich verworfen.
- **Kein Critic bei Klasse niedrig** — verworfen zugunsten non-blocking parallel; die Disposition bleibt vor Wave-Close Pflicht.

## Wiedervorlage

Keine fest terminiert; die Datenbasis wird durch weitere Critic-Läufe laufend erweitert (implizite Beobachtungspflicht).
