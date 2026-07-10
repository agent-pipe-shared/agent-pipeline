# ADR-0005: Quality-Gate-Kette und zweigeteilte DoD

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR establishes a fixed quality-gate chain — Format → Lint → Typecheck → Tests → Build (all blocking) followed by Critic judgment — enforced by a single verify script per project that runs identically in the stop-hook, the agent's completion report, and CI. "Done" may only be claimed with machine-generated evidence (script output, a passing feature list, command plus return code), never a model-asserted claim; the Definition of Done is split into a machine-checkable part and a judgment part (spec fidelity, scope, edge cases) the Critic still has to assess. Status: accepted 2026-07-03 (Checkpoint 1), grounded in decision register entry E5.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E5

## Kontext

Der dokumentierte Haupt-Failure-Mode agentischer Entwicklung ist „fertig gemeldet, aber nicht getestet"; das Gegenmittel ist Evidenz statt Behauptung. Verifikation ist eine Eskalationstreppe: deterministisch vor probabilistisch — Stop-Hooks blocken das Turn-Ende, bis der Check grün ist; LLM-Review kommt danach und flaggt nichts, was CI erzwingt.

## Entscheidung (E5, wortgetreu)

> Gates/DoD: Format→Lint→Typecheck→Tests→Build (blockierend) → Critic (Judgment); EIN verify-Skript je Projekt; Evidenzpflicht (maschinell erzeugte Artefakte)

Präzisierung:

- Das verify-Skript ist Single Source of Truth und läuft identisch an drei Stellen: Stop-Hook (Goldfish-Gate), Goldfish-Abschlussbericht, CI (letzte, unumgehbare Instanz).
- Evidenzpflicht: Abgabe nur mit maschinell erzeugtem Artefakt (Skript-Output/JSON, `passes`-Featureliste, Kommando + Rückgabe) — nie eine vom Modell formulierte Erfolgsbehauptung.
- DoD zweigeteilt: maschinell prüfbarer Teil (Hook/CI) + Judgment-Teil (Critic: Spec-Treue, Scope, Edge Cases). Die Projekt-Kommandos (pnpm / config-check / UE-Build) definiert die Projekt-Kalibrierung (→ [operating-model.md](../operating-model.md)).

## Konsequenzen

**Positiv:** „fertig" wird erzwingbar statt behauptet; identische Checks lokal und in CI = keine Gate-Drift; der Critic wird systematisch entlastet und prüft nur, was Maschinen nicht können.

**Negativ:** jedes Projekt braucht ein gepflegtes verify-Skript; <PROJECT_C> (UE-Build-Latenz) und <PROJECT_B> (config-check statt klassischer Tests) brauchen eigene Kalibrierung.

**Risiko:** AI-generierte Tests können hohl sein — Coverage lügt („perpetually green tests"). Mitigation: Mutation Testing als Nightly-Meta-Gate auf <PROJECT_A>-Kernlogik; E2E-/Config-Äquivalente für <PROJECT_B>/<PROJECT_C>. Zusätzlich Test-Rollen-Trennung: der Implementierungs-Goldfish ändert nie die Tests seiner eigenen Implementierung.

## Verworfene Alternativen

- **LLM-Review als primäres Gate** — probabilistisch, Overreporting ist dokumentiert; Maschinen-Checks sind billiger, schneller, verlässlicher.
- **Coverage-Schwellen als Qualitätsmaß** — hohe Coverage maskiert hohle Assertions.
- **Projektindividuelle Check-Ketten** — exakt die heutige Divergenz; die Ketten-Semantik ist zentral, nur die Kommandos sind projektspezifisch.

## Wiedervorlage

Keine. verify-Skripte je Projekt: Phase 4 (Migrationsdossiers).
