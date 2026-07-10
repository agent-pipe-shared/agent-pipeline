# ADR-0025: Haiku Research Fetcher — Rescoping MP-03 for Read-Only Research

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 1 · as of 2026-07-06

**Status:** accepted (Wave 2, M12) · **Basis:** Register E25

## Context

The pipeline's general Haiku ban ([ADR-0006](0006-modell-effort-policy.md), E6/MP-03: "NO Haiku in the pipeline") arose from concern over judgment quality. Wave 2 measured a clear efficiency gap for pure read-only web search/extraction with no artifacts/judgment: a research-fetch run (R1) completed in 77s/38k usable tokens on Haiku, versus roughly 12min/~200k tokens for Sonnet-class models on the same task class.

## Decision (E25, verbatim)

> Haiku Research Fetcher (Wave 2 M12, revises E6 "NO Haiku"/MP-03): MP-03 rescoped (ban now covers only implementation/judgment/review) + NEW MP-25: read-only web search/fetch/extraction with no artifacts/judgment MAY use Haiku (requires explicit dispatch metadata `role=research-fetcher, model=haiku`); synthesis/evaluation must stay ≥ Sonnet; harness summarizer (WebFetch/WebSearch=Haiku) sanctioned-but-noted (S40 finding). Measurement basis: R1 77s/38k tokens usable vs. ~12min/~200k Sonnet-class; 3/3 fetcher runs in the session succeeded. ADR formalization Phase 2.

## Consequences

**Positive:** Significant time/token savings on pure fetch/extraction work with no evaluative component; the original ban remains fully in force for implementation/judgment/review.

**Negative:** An additional model exception in the canon increases rule surface (when exactly does a task count as "read-only, no judgment"?).

**Risk:** Edge cases could be misdeclared as pure fetch tasks despite containing an evaluative component. Mitigation: explicit dispatch metadata (`role=research-fetcher, model=haiku`) makes the classification visible and auditable; synthesis/evaluation stays mandatory ≥ Sonnet.

## Rejected alternatives

- **Keep the general Haiku ban unchanged** — rejected as uneconomical for pure fetch tasks given the measurement basis (R1: 77s/38k vs. ~12min/~200k).

## Status

Accepted (Wave 2, milestone M12). No fixed follow-up date; the measurement basis (3/3 successful fetcher runs) will be extended by further sessions.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0025: Haiku-Research-Fetcher — Rescope von MP-03 für read-only Recherche

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** akzeptiert (Welle 2, M12) · **Grundlage:** Register E25

## Kontext

Das generelle Haiku-Verbot ([ADR-0006](0006-modell-effort-policy.md), E6/MP-03: „KEIN Haiku in der Pipeline") entstand aus der Sorge um Urteilsqualität. Welle 2 belegt an einem Recherche-Fetch-Lauf (R1: 77 s/38k Token verwertbar) eine deutliche Effizienzlücke gegenüber Sonnet-Klasse (~12 min/~200k Token) für rein lesende Websuche/Extraktion ohne Artefakte/Judgment.

## Entscheidung (E25, wortgetreu)

> Haiku-Research-Fetcher (Welle 2 M12, revidiert E6 „KEIN Haiku"/MP-03): MP-03 rescoped (Verbot nur noch Implementierung/Judgment/Review) + NEU MP-25: read-only Websuche/Fetch/Extraktion ohne Artefakte/Judgment DARF Haiku (explizite Dispatch-Metadaten `role=research-fetcher, model=haiku`); Synthese/Bewertung ≥ Sonnet; Harness-Summarizer (WebFetch/WebSearch=Haiku) sanktioniert-aber-notiert (S40-Befund). Messbasis: R1 77 s/38k Tok verwertbar vs. ~12 min/~200k Sonnet-Klasse; 3/3 Fetcher-Läufe der Session erfolgreich. ADR-Formalisierung Phase 2

## Konsequenzen

**Positiv:** Deutlicher Zeit-/Tokengewinn bei reiner Fetch-/Extraktionsarbeit ohne Bewertungsanteil; das ursprüngliche Verbot bleibt für Implementierung/Judgment/Review vollständig in Kraft.

**Negativ:** Eine zusätzliche Modell-Ausnahme im Kanon erhöht die Regel-Oberfläche (wann genau ist eine Aufgabe „read-only ohne Judgment"?).

**Risiko:** Grenzfälle könnten fälschlich als reine Fetch-Aufgabe deklariert werden, obwohl ein Bewertungsanteil enthalten ist. Mitigation: explizite Dispatch-Metadaten (`role=research-fetcher, model=haiku`) machen die Einstufung sichtbar und prüfbar; Synthese/Bewertung bleibt Pflicht ≥ Sonnet.

## Verworfene Alternativen

- **Generelles Haiku-Verbot unverändert beibehalten** — durch die Messbasis (R1: 77 s/38k vs. ~12 min/~200k) als unwirtschaftlich für reine Fetch-Aufgaben verworfen.

## Wiedervorlage

Keine fest terminiert; die Messbasis (3/3 erfolgreiche Fetcher-Läufe) wird durch weitere Sessions erweitert.
