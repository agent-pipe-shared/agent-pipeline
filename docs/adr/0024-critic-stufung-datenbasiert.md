# ADR-0024: Critic Staffing — Data-Based Revision of the E12/E6 Staffing Rules

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (Wave 2, M11) · **Basis:** Register E24

## Context

Three consecutive canonical Critic runs (readiness + first-pass) all closed at zero findings; real blockers so far only occurred on risky live-code changes (S39 2× blocker, S40 fail-open-major). On this data basis, Wave 2 revises the Critic staffing rules from [ADR-0014](0014-critic-kontrakt.md) (E12) and [ADR-0006](0006-modell-effort-policy.md) (E6).

## Decision (E24, verbatim)

> Critic staffing (Wave 2 M11, revises E12/E6 staffing; data-based + meta-RADAR evidence): NEW mechanical auto-pass (deterministic diffs: lockfiles/generated files/pure formatting → no Critic, evidence = generating command + verify) · class medium = Sonnet CASCADE (escalation to Fable ONLY on a finding ≥major / approvals-governance-security touch / contested) · class low = non-blocking parallel permitted (disposition required before wave close) · ONE bundled Critic per wave = default · class high/A-G-S unchanged, Fable + blocking (T1 untouched). Data basis: last 3 canonical Critics after readiness+first-pass = PASS, 0 findings; real blockers only on risky live code (S39 2×BLOCKER, S40 fail-open-MAJOR). ADR formalization Phase 2

## Consequences

**Positive:** Saves Fable cost on mechanical/medium diffs without an observed loss of defect-finding on canonical material; the T1 obligation (class high/A-G-S) remains fully untouched.

**Negative:** The new staffing logic (mechanical auto-pass, Sonnet cascade, non-blocking-parallel for class low) increases case-distinction complexity in the Critic contract.

**Risk:** The Sonnet cascade could miss a major finding that would have triggered a Fable escalation. Mitigation: the escalation criterion is explicitly defined (finding ≥major / A-G-S touch / contested), not left to discretion.

## Rejected alternatives

- **Keep Fable-Critic across the board for class medium** — rejected as uneconomical given the 0-finding data from the last three canonical Critics.
- **No Critic at all for class low** — rejected in favor of non-blocking parallel; disposition remains mandatory before wave close.

## Status

Accepted (Wave 2, M11). No fixed re-review date; the data basis keeps expanding through further Critic runs (implicit observation duty).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

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
