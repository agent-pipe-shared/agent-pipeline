---
type: workflow-improvement
status: new
created: 2026-07-20
source: Stabilitätsprüfung des öffentlichen V3-Fundaments zu formalen Prüfungs- und Dispatch-Wiederholungen
due: 2026-08-03
---

# Prüfungswiederholungen an gültige Nachweise binden

## Beschreibung

Der Abbruch einer formalen Prüfung oder eines Dispatch kann eine umfassende
Wiederholung erzwingen, obwohl Kandidat und bereits validierte Bereiche
unverändert sind und der Abbruch keinen neuen fachlichen Befund erzeugt hat.
Jede Stufe erneut auszuführen erhöht Latenz und Modellkosten und verschleiert
zugleich, welche Nachweise tatsächlich ungültig geworden sind.

## Auslösende Situation

Bei der Stabilisierung des öffentlichen V3-Fundaments am 2026-07-20 wurde diese
Arbeitsablaufschuld aus `docs/known-issues.md` bewusst für eine eigenständige
Produktgestaltung zurückgestellt, statt eine Ad-hoc-Abkürzung für
Wiederholungen in die Verifikation einzubauen.

## Betroffenes Artefakt

Die öffentliche Richtlinie zur Prüfungsökonomie, Dispatch- und
Prüfungsnachweise, die Planung von Wiederholungen sowie die Regeln zur
Ungültigkeit von Nachweisen für die Zulassung zu Verify und Critic.

## Vorschlag

Einen deterministischen Wiederholungsplaner definieren, der frühere Nachweise
nur dann beibehält, wenn sie für den exakten Kandidaten und Bereich weiterhin
gültig sind. Ein beibehaltener Nachweis muss denselben Commit, Tree,
abgegrenzten Diff beziehungsweise Bereich, dieselbe Richtlinienversion, Route
und Zusicherung binden und innerhalb seines erklärten Gültigkeitsfensters
liegen. Der Abbruchnachweis muss den Fehler als Transport-, Ausführungs- oder
Orchestrierungsfehler statt als fachlichen Befund einordnen.

Die Akzeptanzgrenze lautet:

- Eine Abweichung bei Kandidat, Umfang, Richtlinie, Route, Zusicherung oder
  Gültigkeit macht die abhängigen Nachweise ungültig und löst die erforderliche
  umfassendere Wiederholung aus.
- Ein fachlicher Befund öffnet immer den betroffenen Bereich und dessen
  Abhängigkeiten erneut.
- Bei einem nachgewiesenen reinen Infrastrukturabbruch darf nur die
  fehlgeschlagene Stufe wiederholt werden, während exakt passende und weiterhin
  gültige Nachweise erhalten bleiben.
- Begrenzte Versuchszahlen und die Entscheidung über Wiederverwendung oder
  Wiederholung je Stufe werden als maschinenlesbarer Nachweis festgehalten,
  damit die Wiederholungskosten messbar sind.
- Beibehaltene Nachweise begründen für sich allein niemals einen Critic-PASS
  oder eine Aussage über Bereitschaft, Veröffentlichung oder Konformität.

Dies ist **P2**: Es verbessert die Prüfungsökonomie, nachdem die
P1-Falsch-Erfolgsgrenze der Wiederherstellung geschlossen wurde. Verantwortlich
ist der nächste Pipeline-Elephant mit Zuständigkeit für Prüfungsökonomie und
Nachweisverträge. Zieltermin für die Prüfung: **2026-08-03**.

## Triage (vom Elephant der nächsten Pipeline-Sitzung auszufüllen)

- **Entscheidung:**
- **Begründung:**
- **Zuweisung (falls angenommen):**
- **Datum:**
