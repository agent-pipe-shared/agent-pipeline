---
type: workflow-improvement
status: new
created: 2026-07-16
source: explizite PO-Ausnahmeregel für längere AFK-Phasen am 2026-07-16 während Phase 3A
---

# Optionalen AFK-Annahmemodus mit nachgelagertem PO-Review einführen

## Beschreibung

Bei längerer Abwesenheit des PO soll die Pipeline reversible lokale Arbeit
innerhalb eines bereits freigegebenen PRD-/Spec-Scopes weiterführen können,
statt an jedem neuen Finding oder Course-Gate ungenutzte Zeit zu verlieren.
Der Coordinator darf dabei nur provisorisch die dokumentierte Empfehlung
anwenden. Alle angenommenen PO-Entscheidungen werden am finalen Gate gemeinsam
reviewt und erst dann bestätigt, geändert oder verworfen.

## Auslösende Situation

Der PO erteilte am 2026-07-16 für den weiteren Phase-3A-Lauf eine ausdrückliche
AFK-Ausnahme: Bei Stoppern und Findings soll anhand begründeter Annahmen und
Empfehlungen bis zum finalen Gate weitergearbeitet werden. Die Entscheidungen
müssen vollständig für den Abschluss dokumentiert werden. Diese einmalige
Anweisung soll als optionales dauerhaftes Feature sicher modelliert werden.

## Betroffenes Artefakt

- Projektkalibrierung und Autonomieprofil
- Continuity-State und Course-Decision-Receipt
- Result-/Entscheidungsledger
- `pipeline-start` und `close-block`
- Stop-/Course-Gates und externe Aktionsgrenzen
- Human-Gate- und Review-Vertrag

## Mini-Design

Der Modus ist standardmäßig aus und wird nur durch eine explizite, zeitlich und
inhaltlich begrenzte PO-Anweisung aktiviert. Die Aktivierung bindet mindestens:

- Feature/PRD/Spec und erlaubte Paketspanne;
- Startzeit, Ablaufbedingung und finales Review-Gate;
- ausschließlich reversible lokale Aktionen;
- eine unveränderliche Verbotsliste für Remote-Write, Merge, Tag, Release,
  Secrets, irreversible und extern wirksame Aktionen;
- ein append-only Annahmeregister mit Decision-ID, Trigger, verfügbaren
  Optionen, Empfehlung, provisorischer Auswahl, Begründung, Wirkung,
  Rückrollpunkt und späterer PO-Disposition.

Ein Finding darf nur provisorisch disponiert werden, wenn eine empfohlene
Option innerhalb des freigegebenen Scopes liegt, lokal reversibel ist und keine
Authority- oder Sicherheitsgrenze lockert. Fehlt eine solche Option, bleibt der
Lauf blockiert. Der Modus erweitert niemals das bestehende Produkt-/Retry- oder
Failover-Budget und macht aus einer Annahme keine endgültige PO-Freigabe.

## Akzeptanzkriterien

- Ohne explizite Aktivierung ist das Verhalten byte- und semantikgleich zum
  heutigen fail-closed Ablauf.
- Aktivierung, Scope und Ablaufbedingung sind maschinenlesbar und an den
  aktuellen PRD-/Spec-Digest sowie State-Revision gebunden.
- Jede provisorische Entscheidung ist vor der nächsten Mutation durable und
  vollständig im Abschlussregister enthalten.
- Externe und irreversible Aktionen bleiben auch im AFK-Modus technisch
  blockiert.
- Das finale Human-Gate listet alle provisorischen Entscheidungen einzeln;
  fehlende PO-Disposition verhindert Close/Release.
- Ablehnung einer Annahme führt deterministisch zum aufgezeichneten
  Rückrollpunkt oder in ein neues, ausdrücklich freizugebendes Paket.

## Triage (wird vom Elephant der nächsten Pipeline-Session ausgefüllt)

- **Entscheidung:** ausstehend; PO wünscht ein optionales dauerhaftes Feature
- **Begründung:** Die aktuelle Session besitzt eine einmalige explizite
  Ausnahme, aber keine generische Produktregel darf daraus still entstehen.
- **Zuordnung (falls accepted):** nächste geeignete Phase nach Phase 3A
- **Datum:**
