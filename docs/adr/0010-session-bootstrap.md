# ADR-0010: Session-Bootstrap-Mechanismus

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR (accepted 2026-07-03) mandates a defined, checkable bootstrap protocol at the start of every Agent-Pipeline session, covering the three pillars of the distribution architecture: the plugin (skills/agents/hooks), committed project settings, and a versioned handover file. It requires the protocol to display the consumed plugin SHA and reconcile it against the remote (a staleness check), define offline behavior and a refresh ritual, and end with a mandatory self-confirmation (ruleset SHA/version, project, calibration, handover state, role) before any work begins. It was driven by Critic finding L3-03: without this, plugin distribution can silently drift stale across two machines, and reliance on unversioned user-scope memory breaks on a fresh clone.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Auflagen A5/A6

## Kontext

Critic-Befund L3-03 (major): Die Zwei-Rechner-Staleness der Plugin-Verteilung war ungelöst — die SHA-Phase propagiert nur bei manuellem Refresh, Cache-Drift droht die alte Copy-Paste-Drift zu ersetzen, die Offline-Erstbindung schlägt fehl. Der Bestand zeigt zudem: Abhängigkeit von unversioniertem User-Scope-Memory bricht auf frischem Klon. Auflage A5 fordert ein Bootstrap-Protokoll mit Plugin-SHA-Anzeige, Remote-Abgleich, Offline-Verhalten und Refresh-Ritual; Auflage A6 macht dieses ADR zur DoD-Pflicht.

## Entscheidung (abgeleitet aus Auflagen A5/A6)

Jede Pipeline-Session beginnt mit einem definierten, prüfbaren Bootstrap über die drei Säulen der Verteilungsarchitektur:

1. **Plugin** — Verhalten: Skills/Agents/Hooks ([ADR-0001](0001-verteilung-plugin-marketplace.md)),
2. **committete Projekt-Settings** — Bindung + Permissions ([ADR-0008](0008-permissions-worktree-policy.md)),
3. **versionierte Handover-Datei** — Zustand ([ADR-0012](0012-handover-kanonisierung.md)).

Das Protokoll (normativ ausformuliert in [session-bootstrap.md](../../harness/session-bootstrap.md)):

- zeigt den konsumierten **Plugin-SHA** an und gleicht ihn gegen den Remote-Stand ab (**Staleness-Check**);
- definiert **Offline-Verhalten** (Arbeit auf Cache-Stand ist zulässig, aber nie still — der konsumierte Stand wird deklariert) und das **Refresh-Ritual**;
- endet mit einer **Selbstbestätigung** der Session im verbindlichen Format aus [session-bootstrap.md](../../harness/session-bootstrap.md) Schritt 6: Regelwerk-SHA/Version, Projekt, Kalibrierung, Handover-Stand, Rolle; Modell/Effort erscheint als **Zusatzzeile der Elephant-Variante** (§6.1, nicht bei Goldfish/Critic) — erst danach Arbeitsaufnahme;
- definiert **Fehlverhalten**: Schlägt ein Pflicht-Check fehl, wird nicht still auf unbekanntem Stand weitergearbeitet (Eskalationspfad im Protokoll).

## Konsequenzen

**Positiv:** Staleness wird sichtbar statt still; der frische Klon auf dem Zweitrechner ist ein definierter Pfad statt Zufall; die Selbstbestätigung macht den Sessionzustand auditierbar (Anschluss an die Kosten-Telemetrie, [ADR-0006](0006-modell-effort-policy.md)).

**Negativ:** Bootstrap-Aufwand an jedem Sessionstart; der Remote-Abgleich braucht Netz (Offline-Pfad definiert, aber degradiert).

**Risiko:** Ein Prosa-Protokoll bleibt advisory. Mitigation: Phase 3 implementiert den Bootstrap-Check als aufrufbaren Baustein (Kickoff-Pflicht).

## Verworfene Alternativen

- **Marketplace-`autoUpdate`** — Wirkung außerhalb managed settings ist ⚠ UNSICHER belegt und per Default aus; bewusst kein tragender Mechanismus.
- **Bootstrap über User-Scope-Memory** — belegtes Anti-Pattern: bricht auf frischem Klon.
- **Kein formalisierter Bootstrap** — Cache-Drift ersetzt Copy-Paste-Drift (L3-03); genau das Problem, das die Pipeline lösen soll.
- **`@`-Imports allein** — verteilen nur Instruktionstext, keine Hooks/Agents; harte Guardrails blieben unerzwungen, denn CLAUDE.md ist offiziell „context, not enforced configuration".
- **SessionStart-Hook allein** — kann Kontext injizieren, aber der Hook selbst muss erst ins Projekt kommen; Hooks verteilen sich nur über User-Settings oder Plugins — Henne-Ei ohne die Plugin-Schicht.
- Die Verteilweg-Alternativen **globales `~/.claude`** und **eingecheckte `.claude/`-Kopien je Projekt** sind in [ADR-0001](0001-verteilung-plugin-marketplace.md) abgewogen.

## Wiedervorlage

Phase 3 (Bootstrap-Check als aufrufbarer Baustein), Phase 4 (Zwei-Rechner-Validierung Laptop/Haupt-PC).
