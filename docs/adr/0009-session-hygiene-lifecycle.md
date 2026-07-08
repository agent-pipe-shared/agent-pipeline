# ADR-0009: Session-Hygiene und Session-Lifecycle

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E9 + Session-Lifecycle-Direktive

## Kontext

Cache-Ökonomie ist messbar: Modell-/Effort-Wechsel und `/compact` invalidieren den kompletten Cache; offizielle Faustregel „Pick your model and effort level at the top of a session". Abbruchkriterien sind Pflicht — nach mehr als zwei Fehlversuchen am selben Problem ist frischer Kontext billiger als weiteres Iterieren. Marathon-Sessions mit gemischten Themen sind ein belegtes Anti-Pattern des Bestands. Die Rückfrage des PO (2026-07-03) macht die Session-Lifecycle-Politik zum Pflichtteil des Operating Model: Jede Elephant-Session muss auskunftsfähig beherrschen, wie sie mit vollem Kontext umgeht.

## Entscheidung (E9, wortgetreu)

> Session-Hygiene: /clear+/rename bei Themenwechsel; /compact nur an Aufgabengrenzen; Zwei-Fehlversuche-Regel; Modell+Effort am Sessionanfang fixieren

**Ergänzend kanonisiert — Session-Lifecycle-Politik (Rückfrage des PO):**

- **Geplanter Schnitt statt Not-Kompaktierung:** Elephant-Sessions enden an Aufgabengrenzen durch bewussten Schnitt (Handover aktualisieren → beenden), nicht durch erzwungenes `/compact` bei vollem Kontext.
- **Handover-basiertes Re-Bootstrapping:** Die Nachfolge-Session bootstrappt aus der versionierten Handover-Datei ([ADR-0012](0012-handover-kanonisierung.md)) über das Bootstrap-Protokoll ([ADR-0010](0010-session-bootstrap.md)) — nie aus dem Chat-Verlauf.
- **Goldfish-Kadenz:** Token-intensive Ausführungsarbeit läuft in frischen Goldfischen pro Task; der Elephant-Kontext bleibt für Orchestrierung und Entscheidungen reserviert.

Ausformulierung der Lifecycle-Politik: [operating-model.md §5](../operating-model.md).

## Konsequenzen

**Positiv:** planbare, billige Kontextschnitte statt teurer Not-Kompaktierung; der Elephant bleibt langlebig und cache-stabil; Wissen ist dateibasiert gesichert und überlebt jeden Schnitt.

**Negativ:** Disziplinkosten — Handover-Pflege vor jedem Schnitt, Voraussicht beim Timing von `/compact`.

**Risiko:** Diese Regeln sind teils nur advisory (Prosa). Mitigation: SessionStart-Hook (Matcher `compact`) re-injiziert den Pipeline-Zustand; deterministische Anteile wandern in Phase 3 in Hooks/Bausteine; die Auskunftsfähigkeit über diese Politik ist Teil der Bootstrap-Selbstbestätigung ([ADR-0010](0010-session-bootstrap.md)).

## Verworfene Alternativen

- **Freie Praxis ohne kodifizierte Regeln** — belegtes Anti-Pattern (Marathon-Sessions, Kontext-Drift, dreifach gepflegter Stand).
- **Not-Kompaktierung als Standardmechanismus** — `/compact` invalidiert den Cache per Design und verliert unkontrolliert Kontext; als Notfall akzeptabel, nicht als Politik.

## Wiedervorlage

Keine.

## Nachtrag 2026-07-06 (PO-Direktive — E9-Nachtrag)

`/compact` wird um eine **Checkpoint-Fenster-Regel** ergänzt (append-only, der oben entschiedene Wortlaut bleibt unverändert): An jeder Aufgabengrenze — Paket-/Wellen-Grenze mit Critic PASS + Commit/Push, PRD-Gate bestanden, oder vor dem ersten Dispatch eines neuen Pakets — prüft der Elephant den Kontext-Füllstand. Bei ≥ ~100k Tokens ist die Präsentation eines Compact-Blocks (wörtliches `/compact` + eine Fokus-Zeile) PFLICHT, nicht mehr nur ein Notfall-Ventil. Zielfenster: 100–150k; > 150k gilt als überfälliger Schnitt, ehrlich zu benennen. Anlass: <PROJECT_A>-B-Beleg „/compact hat viel gebracht" bei bewusster Anwendung an einer Grenze; <PROJECT_C>-Gegenbeleg 69 % Nutzung > 150k. Der bestehende Grundsatz „`/compact` nur an Aufgabengrenzen" (E9, oben) bleibt unverändert — die Ergänzung macht daraus an der Fenster-Grenze eine aktive Pflicht statt einer bloßen Erlaubnis. Ausformulierung: `docs/operating-model.md` §5.2 (Zeilen 383/385/388/403), `roles/elephant.md` EL-25, `policies/model-policy.md` MP-19, `guardrails/token-budget.md` TB-02/TB-07.
