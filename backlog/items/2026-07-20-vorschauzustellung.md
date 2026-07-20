---
type: defect
status: new
created: 2026-07-20
source: Stabilitätsprüfung des öffentlichen V3-Fundaments zur Wiederherstellungsgrenze der Migration
due: 2026-07-27
---

# Zustellung der Wiederherstellungsvorschau nachweisen

## Beschreibung

Der Wiederherstellungspfad der Migration kann derzeit einen Callback
akzeptieren, der zurückkehrt, ohne nachzuweisen, dass die
Wiederherstellungsvorschau zugestellt wurde. Ein wirkungsloser Callback ist
dadurch nicht von einer abgeschlossenen Übergabe der Vorschau zu unterscheiden.
Das lässt ein erfolgreiches Wiederherstellungsergebnis stärker erscheinen, als
es die verfügbaren Nachweise erlauben.

## Auslösende Situation

Die Stabilisierung des öffentlichen V3-Fundaments am 2026-07-20 bestätigte die
bereits in `docs/known-issues.md` aufgeführte offene Grenze: Das bloße
Vorhandensein eines Callbacks weist die Zustellung der Vorschau nicht nach.

## Betroffenes Artefakt

Die öffentliche V3-Bibliothek zur Migrationswiederherstellung, ihr Vertrag für
Wiederherstellungsergebnisse sowie die gezielten positiven und
fehlschlagsicheren Tests für die Vorschauzustellung.

## Vorschlag

Eine strukturierte Callback-Bestätigung verlangen, die an den exakten Digest
und den Aufruf der Wiederherstellungsvorschau gebunden ist. Die
Wiederherstellung darf die Vorschauzustellung erst melden, nachdem diese
Bestätigung validiert wurde. Ein fehlender Callback, eine leere oder
wirkungslose Rückgabe, eine Ausnahme, eine Zeitüberschreitung, eine
wiederverwendete Bestätigung oder ein abweichender Digest muss ein typisiertes
Nichterfolgsergebnis liefern und darf den Wiederherstellungszustand nicht
fortschreiben.

Die Akzeptanzgrenze lautet:

- Ein Vorschauaufruf erzeugt genau eine Bestätigung, die an diese Vorschau
  gebunden ist.
- Erfolg erfordert ein passendes Schema, den Digest der Vorschau und die
  Identität des Aufrufs.
- Jede fehlende, fehlerhafte, wiederverwendete oder abweichende Bestätigung ist
  durch deterministische Negativtests abgedeckt und begründet weder eine
  Zustellungs- noch eine Wiederherstellungs-Erfolgsaussage.
- Der Entwurf führt keine externe Identität, kein Geheimnis, keinen
  Netzwerkdienst und keine private Nachweisinstanz ein.

Dies ist **P1**, weil es eine Falsch-Erfolgsgrenze in der Wiederherstellung
schließt. Verantwortlich ist der nächste Pipeline-Elephant, der ein unabhängig
prüfbares öffentliches Umsetzungspaket abgrenzen soll. Zieltermin für die
Prüfung: **2026-07-27**.

## Triage (vom Elephant der nächsten Pipeline-Sitzung auszufüllen)

- **Entscheidung:**
- **Begründung:**
- **Zuweisung (falls angenommen):**
- **Datum:**
