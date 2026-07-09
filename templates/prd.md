<!--
PROMPT/DOC TEMPLATE: PRD — Produkt-Review-Dokument (PO-Gate) — Agent-Pipeline
Language: GERMAN (the PO is the primary reader, ADR-0011 primary-reader rule).
Source of truth: docs/operating-model.md §3.2 (Schritt 3b) / §3.3 / roles/elephant.md EL-19.
Purpose: the PO release gate. Written by the Elephant AFTER the solution is designed
and the spec passed readiness, BEFORE the first implementation dispatch. Mandatory at
rigor >=1 OR risk class high; a true stage-0 fast-path (§3.3) is exempt.
Keep it to ~1 page. It carries product RATIONALE, not acceptance criteria — those live
agent-facing/English in spec.md, which this PRD references (no duplication).
Location: specs/<task>/prd_<topic>.md
Release mechanic: EL-17a — numbered inline chat summary + this file reference + readable
delivery to the PO's device/render (a repo path alone is NOT delivery) + explicit wait for
the literal word "freigegeben" (no UI dialog; EL-19).

PO-Sprachvorgabe (verbindlich für jedes künftige PRD):
- Zielleser ist der PO, nicht der Agent — Deutsch, Klartext, kurze Sätze.
- Jeder Block beantwortet drei Fragen: Welches Problem? Was ändern wir? Was hast du davon?
- Regel-IDs, Dateipfade, Fachjargon RAUS aus dem Haupttext — nur in kompakten, kursiven
  Technik-Zeilen am Blockende oder in einem Anhang; die Goldfisch-Briefings tragen die
  Technik später sowieso.
- Bei feedback-/review-getriebenen PRDs: Abschnitt „Abdeckungs-Matrix" nicht weglassen.
- Entscheidungspunkte stehen nummeriert am Ende, getrennt von reiner Kenntnisnahme.
-->

# PRD — <Feature/Thema>

> Produkt-Review-Dokument (PO-Gate, deutsch). Entsteht nach dem Lösungs-Design, vor der
> Implementierung. the PO verifiziert und gibt „freigegeben". Akzeptanzkriterien: siehe
> `spec.md` (agent-facing). Task: `<task-id>` · Rigor <0/1/2> / Klasse <niedrig/mittel/hoch>.

## Was
<Ein Absatz: was wird gebaut/geändert — in Produktbegriffen, nicht in Code. Je Punkt gilt
Problem → Änderung → Nutzen; Regel-IDs/Pfade/Jargon bleiben draußen — falls unverzichtbar,
als knappe kursive Technik-Zeile am Ende des Absatzes statt im Fließtext.>

## Warum
<Problem/Nutzen/Auslöser; woran misst sich der Erfolg.>

## Scope
<Was ist drin — die konkrete Änderung, gern als kurze Liste betroffener Artefakte
(Dateipfade sind hier als Listenpunkte in Ordnung, nicht im Fließtext davor/danach).>

## Nicht-Ziele
<Was bewusst NICHT gemacht wird (Abgrenzung gegen Scope-Creep).>

## Risiken & Mitigation
<Die 2–4 wichtigsten Risiken, je mit Gegenmaßnahme.>

## Betrachtete Alternativen
<Erwogen & verworfen, je mit Ein-Satz-Begründung (Solo-Gedächtnis-Element).>

## Abdeckungs-Matrix (nur bei feedback-/review-getriebenen PRDs)
<Nur einfügen, wenn das PRD auf Feedback/Review aufbaut — sonst diesen Abschnitt ersatzlos
streichen. Tabelle „dein Input → wo im PRD" macht Vollständigkeit für den PO prüfbar statt
vertrauensbasiert.>

| Input | Wo im PRD |
|---|---|
| <Stichwort/Zitat> | <Block/Abschnitt> |

## DoD (Freigabe-Kriterien)
<Woran the PO „fertig" erkennt; Verweis auf spec.md-Akzeptanzkriterien.>

## Entscheidungspunkte
<Nummeriert und explizit „was du entscheiden musst" — getrennt von reiner Kenntnisnahme.
Je Punkt: Frage + Empfehlung (+ Alternative, falls vorhanden).>

1. <Entscheidungspunkt 1 — Frage, Empfehlung.>

<!-- Optional, OHNE Gate: sdp_<topic>.md (Software Development Plan) — nur dokumentiert,
     kein Pflicht-Bestätigungspunkt (Enterprise-Vorbehalt). -->
