# ADR-0023: Elephant-Kontext-Diät & Latenz-Maßnahmenbündel

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR adopts a bundle of ten concrete measures to cut the "Elephant" (main agent) context share and session latency, after sessions repeatedly showed 78–89% Elephant context usage — deemed unsustainable. Measures include capped subagent reports, single-turn/parallel-first task scheduling, phase-cut cost triggers, selective (non-full-text) reading by default, commit-first-then-report ordering, a dispatch ledger, leaner chat communication, and scoped readiness checks. It was reviewed bundled rather than piecemeal (an independent critic review failed on first pass with 6 findings, then passed after fixes) and carries an explicit, dated measurement target for the next feature session (Elephant share ≤50%, cost <$30, wall-clock time −30%, unchanged first-pass quality), with a rollback trigger if that target is missed.

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-05 abends, Welle 2, the PO-PRD-Freigaben) · **Grundlage:** Register E23

## Kontext

Mehrere Sessions zeigten einen hohen Elephant-Kontextanteil (78–89 %). Welle 2 bündelte ein umfassendes Maßnahmenpaket zur Kontext- und Latenzreduktion; ein Fable-Critic prüfte es (Erstlauf FAIL mit 6 Befunden → disponiert, Zweitlauf PASS).

## Entscheidung (E23, wortgetreu)

> Elephant-Kontext-Diät & Latenz (Welle 2, the PO-PRD-Freigaben 2026-07-05 abends; Commits `886db4f`/`166e60a`/`fc725c6`/`c2e45b3`/`9d4734d`): Report-Cap ≤1.000 Tok/40 Zeilen (GF-09) · Ein-Turn-Recon + Parallel-first-Scheduling (EL-05/EL-22: Unabhängiges im SELBEN Turn, sequenziell nur mit benannter Abhängigkeit) · Phasen-Schnitt-Kostentrigger ~10 Dispatches/~2 h/≥50 % zusätzlich zum Füllstand (OM §5.2) · Selektiv-Lesen EL-20 (Volltext nur bei Anomalie) · commit-first-then-report Standard · Dispatch-Ledger EL-21 · Kommunikations-Ökonomie EL-23 (Chat nur: Befund/Gate/Inzident/Ergebnis) · Readiness-Scoping (Pflicht nur Kanon/Guardrail/Kernvertrag/Klasse hoch/Rigor 2) · goldfish-implementor `effort: xhigh` · SessionStart-Staleness-Hook (detect+prompt, fail-open; `autoUpdate`-Key nach Critic-F1 wieder entfernt → Verifikations-Item) · PRD-Vorlage-Enforcement (E21-Nachtrag). Messziel nächste Feature-Session: Elephant-Anteil ≤50 % (S39/S40/Tuning/S42: 78–89 %), Feature-Session <$30, Wall −30 %, First-Pass unverändert; Verschlechterung → datierte Rück-Revision. Critic: Erstlauf FAIL (6 Befunde) → disponiert, Zweitlauf PASS. ADR-Formalisierung Phase 2

## Konsequenzen

**Positiv:** Bündelt zehn konkrete Hebel gegen den dokumentiert dominierenden Kostenfaktor (Elephant-Kontextanteil); das Messziel ist explizit und terminiert (nächste Feature-Session).

**Negativ:** Hohe Regel-Dichte in einer einzigen Entscheidung (zehn Einzelmaßnahmen) — Pflegeaufwand verteilt sich über viele Kanon-Stellen.

**Risiko:** Verschlechterung des First-Pass durch zu aggressive Kürzung (Report-Cap, Selektiv-Lesen) bliebe zunächst unbemerkt. Mitigation: expliziter Messauftrag mit Rück-Revisions-Trigger bei zurechenbarer Verschlechterung.

## Verworfene Alternativen

- **Status quo (hoher Elephant-Kontextanteil unverändert)** — durch die S39/S40/Tuning/S42-Datenlage (78–89 %) als nicht tragbar verworfen.
- **Einzelmaßnahmen isoliert statt gebündelt einführen** — der Critic-Review lief gebündelt (Erstlauf FAIL → disponiert, Zweitlauf PASS); das Bündel wurde beibehalten statt aufgeteilt.

## Wiedervorlage

Messziel-Prüfung an der nächsten Feature-Session (Elephant-Anteil ≤50 %, Feature-Session <$30, Wall −30 %, First-Pass unverändert); zurechenbare Verschlechterung → datierte Rück-Revision.
