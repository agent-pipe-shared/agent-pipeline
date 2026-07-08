# ADR-0006: Modell- und Effort-Policy je Rolle

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **revidiert im Effort-Teil (E16, der PO, 2026-07-04 — s. Abschnitt „Revision E16")** · **Grundlage:** Register E6 + E16, PO-Entscheid

## Kontext

Die Recherche empfahl: Elephant = Opus 4.8/high, Goldfish = Sonnet 5/medium, Critic gestaffelt Haiku→Sonnet→Opus. Der PO hat an Checkpoint 1 revidiert — PO-Entscheid aus Praxiserfahrung: Opus verbraucht real mehr Tokens, weil es bei der Lösungsfindung weniger effektiv ist; Fable ist schneller und effektiver. Das cp1-Critic-Review bestätigt den Entscheid als legitim und sauber protokolliert; er kollidiert nicht mit der Cache-Ökonomie, weil token-intensive Arbeit an Goldfische delegiert wird, statt das Elephant-Modell zu wechseln.

## Entscheidung (E6, wortgetreu)

> **Modell-Policy (PO revidiert):** Elephant = Fable 5 / max (GESETZT); Goldfish = Sonnet 5 Minimum (KEIN Haiku), Effort high–max, Umfangreiches optional Opus 4.8; Critic = Sonnet 5/max, Fable 5/max bei Architektur/Guardrails/Security; Kosten-Telemetrie ab Tag 1; Preis-Review 31.08.2026

## Abweichung von der Recherche-Empfehlung (transparent)

| Punkt | Recherche | Entscheid | Begründung PO / Einordnung |
|---|---|---|---|
| Elephant | Opus 4.8 / high | **Fable 5 / max (GESETZT)** | Effektive Kosten pro Aufgabe zählen, nicht $/MTok — deckt sich mit der Messregel der Preisanalyse |
| Goldfish-Effort | Sonnet 5 / medium | **Sonnet 5 Minimum / high–max** | max lohnt sich bei Sonnets niedrigen Tokenkosten ($2/$10 bis 31.08.2026); sehr Umfangreiches optional Opus 4.8 |
| Critic-Sockel | Haiku 4.5 für formale Checks | **Sonnet 5 (KEIN Haiku in der Pipeline)** | Haiku: kein Effort-Parameter, 200k Kontext — für die Pipeline ausgeschlossen |

## Konsequenzen

**Positiv:** stärkstes Urteilsvermögen an den teuersten Fehlerquellen (Orchestrierung, kritische Reviews); der Elephant-Cache bleibt intakt (kein Modellwechsel in-session, Delegation per Subagent); Umsetzungsarbeit läuft auf dem günstigsten tauglichen Modell.

**Negativ:** Fable 5 ($10/$50) ist pro MTok die teuerste Dauerwahl; Thinking dort nicht abschaltbar.

**Risiko:** unbemerkte Kostenexplosion. Mitigation ist Teil der Entscheidung: Kosten-Telemetrie ab Tag 1 — Instrument und Ablage definiert [model-policy.md](../../policies/model-policy.md) (Auflage A8). Anpassung ausdrücklich vorbehalten, falls zu teuer.

## Verworfene Alternativen

- **Recherche-Matrix (Opus-Elephant / medium-Goldfish / Haiku-Sockel)** — durch PO-Entscheid revidiert; bleibt als datierter Recherche-Stand mit Supersession-Vermerk dokumentiert.
- **`opusplan`-Alias (Opus plant, Sonnet exekutiert)** — jeder Plan↔Exec-Toggle ist ein Modellwechsel und invalidiert den kompletten Prompt-Cache.

## Revision E16 (der PO, 2026-07-04): Elephant-Effort xhigh statt max

Der Elephant-Effort-Standard wird von `max` auf **`xhigh`** revidiert; das Modell (Fable 5) bleibt unverändert GESETZT. `max` bleibt als **benannte Session-Ausnahme** mit aktiver Hinweispflicht: Bei Arbeit an Guardrails, umfassender Architektur oder größerem Refactoring empfiehlt die Pipeline dem PO AKTIV den Wechsel auf `max` — bei E7-indizierten Aufgaben (Migrationen, Audits, Massenänderungen) alternativ den Ultracode-Task-Opt-in (MP-08); der PO entscheidet, nie stiller Weiterlauf. **Begründung:** offizielle Guidance (xhigh = Sweet Spot für agentische Arbeit und Claude-Code-Default; max = diminishing returns/Overthinking, „sparingly"; niedrigere Fable-Stufen erreichen oft die max-Qualität früherer Topmodelle — verifiziert gegen die API-Referenz 2026-07-04) plus Budget-Realität (Fable-Wochenlimit 94 %). **Messauftrag:** Sprint-1-Telemetrie beobachtet First-Pass/Nacharbeit unter xhigh; zurechenbare Verschlechterung → datierte Rück-Revision (PO-Gate). Umsetzung: `policies/model-policy.md` MP-01, `roles/elephant.md` §9, Bootstrap 1b (Spec + Skill), Kickoff-Templates.

**Querverweis (E25, Welle 2):** Das generelle Haiku-Verbot (MP-03) wurde für read-only Research-Fetcher rescoped (Verbot nur noch Implementierung/Judgment/Review) — eigenes ADR, keine Wiederholung hier: [ADR-0025](0025-haiku-research-fetcher.md), Register E25.

## Wiedervorlage

**31.08.2026** — Sonnet-5-Einführungspreis endet; Preis-Review auf Basis der Telemetrie-Daten. Der Preis-Review sichtet zugleich die E16-Messdaten (First-Pass unter xhigh).
