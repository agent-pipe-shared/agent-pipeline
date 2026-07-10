# ADR-0023: Elephant Context Diet & Latency Measure Bundle

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 1 · as of 2026-07-06

**Status:** accepted (2026-07-05 evening, Wave 2, PO-PRD approvals) · **Basis:** Register E23

## Context

Multiple sessions showed a high Elephant (main agent) context share (78–89%). Wave 2 bundled a comprehensive set of context- and latency-reduction measures; a Fable critic reviewed it (first pass FAIL with 6 findings → dispositioned, second pass PASS).

## Decision (E23)

Elephant Context Diet & Latency (Wave 2, PO-PRD approvals 2026-07-05 evening; commits `886db4f`/`166e60a`/`fc725c6`/`c2e45b3`/`9d4734d`) adopts ten concrete measures:

- Report cap ≤1,000 tokens / 40 lines (GF-09)
- Single-turn recon + parallel-first scheduling (EL-05/EL-22: independent work in the SAME turn, sequential only with a named dependency)
- Phase-cut cost trigger ~10 dispatches / ~2h / ≥50% in addition to fill-level (operating-model §5.2)
- Selective reading EL-20 (full text only on anomaly)
- commit-first-then-report as default ordering
- Dispatch ledger EL-21
- Communication economy EL-23 (chat only: finding/gate/incident/result)
- Readiness scoping (mandatory only for canon/guardrail/core-contract/class-high/rigor-2)
- goldfish-implementor `effort: xhigh`
- SessionStart staleness hook (detect+prompt, fail-open; `autoUpdate` key removed again after Critic finding F1 → verification item)
- PRD template enforcement (E21 addendum)

Measurement target for the next feature session: Elephant share ≤50% (baseline S39/S40/tuning/S42: 78–89%), feature session <$30, wall-clock time −30%, unchanged first-pass quality; a regression triggers a dated rollback revision. Critic: first pass FAIL (6 findings) → dispositioned, second pass PASS. ADR formalization: Phase 2.

## Consequences

**Positive:** Bundles ten concrete levers against the documented dominant cost factor (Elephant context share); the measurement target is explicit and time-boxed (next feature session).

**Negative:** High rule density in a single decision (ten individual measures) — maintenance effort is spread across many canon locations.

**Risk:** A first-pass quality regression from overly aggressive cuts (report cap, selective reading) could initially go unnoticed. Mitigation: explicit measurement mandate with a rollback trigger on attributable regression.

## Rejected alternatives

- **Status quo (high Elephant context share unchanged)** — rejected as untenable given the S39/S40/tuning/S42 data (78–89%).
- **Introducing individual measures in isolation rather than bundled** — the critic review ran bundled (first pass FAIL → dispositioned, second pass PASS); the bundle was kept rather than split.

## Follow-up

Measurement-target check at the next feature session (Elephant share ≤50%, feature session <$30, wall-clock time −30%, unchanged first-pass quality); attributable regression → dated rollback revision.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0023: Elephant-Kontext-Diät & Latenz-Maßnahmenbündel

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
