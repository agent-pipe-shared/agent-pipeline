# ADR-0013: git-guard als zentrale Union + Projekt-Deny-Config

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E11

## Kontext

Alle drei Projekte fahren einen PreToolUse-git-guard — als divergierte Kopien: **Keine Inkarnation ist Superset der anderen**; jede Kopie hat Schutzregeln, die den Geschwistern fehlen. Das ist der klarste messbare Copy-Paste-Schaden des Bestands. Gemeinsamer Kern: Deny-Guard gegen Force-Push, `reset --hard`, `clean -f`, main-Löschung, Secret-Staging; „breite Allows + gezielter Deny-Guard"; exit 2 mit Klartext-Begründung; fail-open; Not-Ausgang Mensch. Hook-Denies wirken auch in `acceptEdits`/`bypassPermissions`.

## Entscheidung (E11, wortgetreu)

> git-guard: zentrale Union aller drei Projekt-Inkarnationen + Projekt-Deny-Config

Präzisierung:

- Die zentrale Version (im Plugin, PreToolUse-Hook) bildet die **Union aller Deny-Regeln** aus <PROJECT_A>/<PROJECT_B>/<PROJECT_C>; projektspezifische Denies (Content-Packs, `secrets.yaml`, `.storage`, Prod-Branch u. ä.) kommen als **Deny-Config im Projekt-Repo** dazu — Konfiguration statt Fork.
- Design-Invarianten bleiben erhalten: breite Allows + gezielter Deny-Guard, exit 2 mit Klartext-Begründung an den Agenten, **fail-open** („Guard ist Sicherheitsnetz, kein Gefängnis"), dokumentierter Not-Ausgang (the PO führt manuell aus), Warum-Header je Guard.

## Konsequenzen

**Positiv:** jedes Projekt erhält sofort die Schutzregeln der Geschwister; künftige Regeln propagieren zentral ([ADR-0001](0001-verteilung-plugin-marketplace.md)); die Hook-Ebene trägt die Workflow-Vorbedingungen ([ADR-0007](0007-workflows-ultracode-opt-in.md)).

**Negativ:** die Union kann in Einzelprojekten False-Positives erzeugen (projektfremde Muster) — der fail-open-Charakter und der Not-Ausgang begrenzen den Schaden.

**Risiko:** lokale Patches ließen die Divergenz zurückkehren. Prüfweise: Der Guard lebt ausschließlich im Plugin; Projekt-Repos enthalten nur Deny-Config, nie Guard-Kopien.

## Verworfene Alternativen

- **Eine Inkarnation zum Master erklären** — keine ist Superset; jede Wahl verlöre belegte Schutzregeln der anderen beiden.
- **Neuschreiben ohne Bestand** — verwirft dreifach gereifte, real erprobte Regeln samt Betriebs-Semantik (Quote-Stripping, fail-open-Verhalten).
- **Permission-Rules statt Hook** — Bash-Argument-Patterns sind offiziell fragil; der Guard braucht echtes Parsing, und nur Hook-Denies gelten auch in `acceptEdits`.

## Wiedervorlage

Keine. Bau der Union + Abgleich gegen alle drei Inkarnationen: Phase 3; Verifikation je Projekt: Phase 4.
