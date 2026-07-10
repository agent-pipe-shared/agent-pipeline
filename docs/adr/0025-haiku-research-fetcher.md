# ADR-0025: Haiku-Research-Fetcher — Rescope von MP-03 für read-only Recherche

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR narrows the pipeline's general Haiku ban (ADR-0006/MP-03) to still prohibit Haiku for implementation, judgment, and review work, but now explicitly permits it (new rule MP-25) for read-only web search/fetch/extraction tasks that produce no artifacts and require no judgment — provided the dispatch metadata explicitly declares `role=research-fetcher, model=haiku`. The decision is grounded in a measured efficiency gap: a research-fetch run completed in 77s/38k usable tokens on Haiku versus roughly 12min/200k tokens for Sonnet-class models on the same class of task. Synthesis and evaluation work must still use Sonnet or better. Status: accepted (Wave 2, milestone M12).

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
