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
-->

# PRD — <Feature/Thema>

> Produkt-Review-Dokument (PO-Gate, deutsch). Entsteht nach dem Lösungs-Design, vor der
> Implementierung. the PO verifiziert und gibt „freigegeben". Akzeptanzkriterien: siehe
> `spec.md` (agent-facing). Task: `<task-id>` · Rigor <0/1/2> / Klasse <niedrig/mittel/hoch>.

## Was
<Ein Absatz: was wird gebaut/geändert — in Produktbegriffen, nicht in Code.>

## Warum
<Problem/Nutzen/Auslöser; woran misst sich der Erfolg.>

## Scope
<Was ist drin — die konkrete Änderung, gern als kurze Liste betroffener Artefakte.>

## Nicht-Ziele
<Was bewusst NICHT gemacht wird (Abgrenzung gegen Scope-Creep).>

## Risiken & Mitigation
<Die 2–4 wichtigsten Risiken, je mit Gegenmaßnahme.>

## Betrachtete Alternativen
<Erwogen & verworfen, je mit Ein-Satz-Begründung (Solo-Gedächtnis-Element).>

## DoD (Freigabe-Kriterien)
<Woran the PO „fertig" erkennt; Verweis auf spec.md-Akzeptanzkriterien.>

<!-- Optional, OHNE Gate: sdp_<topic>.md (Software Development Plan) — nur dokumentiert,
     kein Pflicht-Bestätigungspunkt (Enterprise-Vorbehalt). -->
