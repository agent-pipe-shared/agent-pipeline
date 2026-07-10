# ADR-0005: Quality-Gate Chain and Two-Part Definition of Done

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

## Context

The documented main failure mode of agentic development is "reported done but not tested"; the countermeasure is evidence instead of claim. Verification is an escalation staircase: deterministic before probabilistic — stop-hooks block the end of the turn until the check is green; LLM review comes after and flags nothing that CI already enforces.

## Decision (E5, verbatim)

> Gates/DoD: Format→Lint→Typecheck→Tests→Build (blocking) → Critic (judgment); ONE verify script per project; evidence obligation (machine-generated artifacts)

Clarification:

- The verify script is the single source of truth and runs identically in three places: stop-hook (Goldfish gate), Goldfish completion report, CI (the last, unbypassable instance).
- Evidence obligation: work may only be submitted with a machine-generated artifact (script output/JSON, a passing feature list, command plus return code) — never a model-formulated success claim.
- DoD is two-part: a machine-checkable part (hook/CI) plus a judgment part (Critic: spec fidelity, scope, edge cases). Project commands (pnpm / config-check / UE build) are defined by project calibration (→ [operating-model.md](../operating-model.md)).

## Consequences

**Positive:** "done" becomes enforceable instead of asserted; identical checks locally and in CI mean no gate drift; the Critic is systematically relieved and only checks what machines cannot.

**Negative:** every project needs a maintained verify script; `<PROJECT_C>` (UE build latency) and `<PROJECT_B>` (config-check instead of classic tests) need their own calibration.

**Risk:** AI-generated tests can be hollow — coverage lies ("perpetually green tests"). Mitigation: mutation testing as a nightly meta-gate on `<PROJECT_A>` core logic; E2E/config equivalents for `<PROJECT_B>`/`<PROJECT_C>`. Additionally, test-role separation: the implementation Goldfish never modifies the tests of its own implementation.

## Rejected alternatives

- **LLM review as the primary gate** — probabilistic, overreporting is documented; machine checks are cheaper, faster, more reliable.
- **Coverage thresholds as a quality measure** — high coverage masks hollow assertions.
- **Project-individual check chains** — exactly today's divergence; chain semantics are central, only the commands are project-specific.

## Status

Accepted 2026-07-03 (Checkpoint 1), grounded in decision register entry E5. Follow-up: none. Per-project verify scripts: Phase 4 (migration dossiers).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0005: Quality-Gate-Kette und zweigeteilte DoD

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
