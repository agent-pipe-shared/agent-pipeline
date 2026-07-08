<!--
PROMPT/DOC TEMPLATE: Dev-Plan — Implementierungs-Vertrag für the PO's Plan-Mode-Freigabe
(Dev-Plan-Gate) — Agent-Pipeline, AP1-P3 "DURIN".
Language: GERMAN (the PO ist primärer Leser, ADR-0011 Primärleser-Regel).
Source of truth: docs/operating-model.md §3.2 Schritt 3b (Verbuchungssatz).
Zweck: Plan-Mode-Ersatz für Spec/PRD-Zeremonie in Sessions, die the PO's Session-Regel 1
("Plan Mode + explizite Plan-Freigabe") statt vollem Spec-Prozess nutzen — DIESES
Artefakt ist dann der Implementierungs-Vertrag, gegen den das Dev-Plan-Gate
(plugins/pipeline-core/hooks/guard-devplan.mjs) prüft, ob the PO's Freigabe schon
deterministisch verbucht ist.
Ablage: `.claude/plans/<datum>-<feature>.md` (der Pfad wird als `planPath` beim Setzen
des Features verbucht: `node harness/scripts/pipeline-state.mjs set-feature --id <id>
--plan-path .claude/plans/<datum>-<feature>.md`).
-->

# <Feature/Thema> — Umsetzungsplan (VERTRAG)

> **Status: ENTWURF** (Platzhalter — nach the PO's „freigegeben" hier auf **FREIGEGEBEN**
> ändern, mit Datum/Zeit) — dieses Artefakt ist der Implementierungs-Vertrag der Session.
>
> **Freigabe-Verbuchung:** Nach the PO's wörtlichem „freigegeben" wird die Freigabe
> zusätzlich deterministisch verbucht (docs/operating-model.md §3.2 Schritt 3b):
> ```
> node harness/scripts/pipeline-state.mjs set-feature --id <feature-id> --plan-path .claude/plans/<datum>-<feature>.md
> node harness/scripts/pipeline-state.mjs approve-plan --by po-test
> ```
> Erst danach lässt das Dev-Plan-Gate (guard-devplan.mjs) Implementierungs-Edits
> außerhalb der Standard-Ausnahmen (`docs/`, `specs/`, `.claude/`, `backlog/`, dieser
> Plan-Pfad selbst) zu. Ein Widerruf läuft über `revoke-plan --by <name>`.

## Kontext
<Arbeitsauftrag, Anlass, Abgrenzung zu Parallel-Sessions/-Themen; ein Absatz.>

## Leitentscheidungen (mit Begründung)
<Nummerierte Liste: jede wesentliche Design-/Scope-Entscheidung mit Ein-Satz-Warum —
mirrors PRD "Betrachtete Alternativen" (Solo-Gedächtnis-Element).>

1. …
2. …

## Pakete (Implementierung = implement-tier Goldfish, disjunkte Dateien je Paket)
<Je Paket: Kurzname, betroffene Dateien (disjunkt zu anderen Paketen), 1-Satz-Scope.>

- **P0 — …:** …
- **P1 — …:** …

## Verifikation (DoD-Mapping)
<Woran die Erledigung je Paket/insgesamt erkennbar ist; Verweis auf `verify`-Kommando
und ggf. zusätzliche Suiten/Evidenz-Artefakte.>

## Risiken / bewusst offen
<Bekannte Risiken, akzeptierte Lücken, explizit NICHT in dieser Session behandelte
Themen (Scope-Abgrenzung, verhindert stillen Scope-Creep).>

## Amendments (nach Freigabe, PO-sanktioniert)
<Nur befüllen, wenn nach der Freigabe ein PO-sanktionierter Nachtrag nötig wird — jeder
Amendment-Eintrag nummeriert, mit Datum und Kurzbegründung.>
