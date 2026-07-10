# ADR-0013: git-guard as central union + project deny-config

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E11

## Context

All three source projects ran a PreToolUse git-guard as diverged copies: no single incarnation was a superset of the others — each copy carried protection rules the siblings lacked. This was the clearest measurable copy-paste damage in the existing estate. Shared core: a deny-guard against force-push, `reset --hard`, `clean -f`, main-branch deletion, secret staging; the pattern of "broad allows + targeted deny-guard"; exit code 2 with a plain-text reason; fail-open behavior; a human manual escape hatch. Hook denies also apply under `acceptEdits`/`bypassPermissions`.

## Decision (E11, verbatim)

> git-guard: central union of all three project incarnations + project deny-config

Refinement:

- The central version (in the plugin, PreToolUse hook) forms the **union of all deny rules** from the three source projects; project-specific denies (content packs, `secrets.yaml`, `.storage`, prod branch, etc.) are added as **deny-config in the project repo** — configuration, not a fork.
- Design invariants are preserved: broad allows + targeted deny-guard, exit 2 with a plain-text reason to the agent, **fail-open** ("the guard is a safety net, not a prison"), a documented manual escape hatch (the PO executes manually), a why-header per guard.

## Consequences

**Positive:** every project immediately gets the sibling projects' protection rules; future rules propagate centrally ([ADR-0001](0001-verteilung-plugin-marketplace.md)); the hook layer carries workflow preconditions ([ADR-0007](0007-workflows-ultracode-opt-in.md)).

**Negative:** the union can produce false positives in individual projects (patterns foreign to that project) — the fail-open nature and the escape hatch bound the damage.

**Risk:** local patches could let the divergence return. Check: the guard lives exclusively in the plugin; project repos contain only deny-config, never guard copies.

## Rejected alternatives

- **Declare one incarnation the master** — none is a superset; any choice would lose proven protection rules from the other two.
- **Rewrite from scratch** — discards three-times-matured, field-tested rules and their operational semantics (quote-stripping, fail-open behavior).
- **Permission-rules instead of a hook** — Bash argument patterns are officially fragile; the guard needs real parsing, and only hook-denies also apply under `acceptEdits`.

## Follow-up

None. Building the union + reconciling against all three incarnations: Phase 3; verification per project: Phase 4.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

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
