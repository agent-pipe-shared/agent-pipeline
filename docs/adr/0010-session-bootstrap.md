# ADR-0010: Session Bootstrap Mechanism

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** conditions A5/A6

## Context

Critic finding L3-03 (major): the two-machine staleness of plugin distribution was unresolved — the SHA phase only propagates on manual refresh, cache drift risks replacing the old copy-paste drift, and offline first-binding fails. The stock-take also showed: dependence on unversioned user-scope memory breaks on a fresh clone. Condition A5 requires a bootstrap protocol with plugin-SHA display, remote reconciliation, offline behavior, and a refresh ritual; condition A6 makes this ADR a DoD requirement.

## Decision (derived from conditions A5/A6)

Every Pipeline session begins with a defined, checkable bootstrap covering the three pillars of the distribution architecture:

1. **Plugin** — behavior: skills/agents/hooks ([ADR-0001](0001-verteilung-plugin-marketplace.md)),
2. **committed project settings** — binding + permissions ([ADR-0008](0008-permissions-worktree-policy.md)),
3. **versioned handover file** — state ([ADR-0012](0012-handover-kanonisierung.md)).

The protocol (normatively spelled out in [session-bootstrap.md](../../harness/session-bootstrap.md)):

- displays the consumed **plugin SHA** and reconciles it against the remote state (**staleness check**);
- defines **offline behavior** (working on a cached state is allowed, but never silently — the consumed state is declared) and the **refresh ritual**;
- ends with a **self-confirmation** of the session in the binding format from [session-bootstrap.md](../../harness/session-bootstrap.md) step 6: ruleset SHA/version, project, calibration, handover state, role; model/effort appears as an **additional line in the Elephant variant** (§6.1, not for Goldfish/Critic) — only then does work begin;
- defines **failure behavior**: if a mandatory check fails, work does not silently continue on an unknown state (escalation path defined in the protocol).

## Consequences

**Positive:** staleness becomes visible instead of silent; the fresh clone on the second machine is a defined path instead of chance; the self-confirmation makes session state auditable (ties into cost telemetry, [ADR-0006](0006-modell-effort-policy.md)).

**Negative:** bootstrap overhead at every session start; remote reconciliation needs network (offline path defined, but degraded).

**Risk:** a prose protocol remains advisory. Mitigation: Phase 3 implements the bootstrap check as an invocable building block (kickoff requirement).

## Rejected alternatives

- **Marketplace `autoUpdate`** — effect outside managed settings is ⚠ UNVERIFIED and off by default; deliberately not a load-bearing mechanism.
- **Bootstrap via user-scope memory** — documented anti-pattern: breaks on a fresh clone.
- **No formalized bootstrap** — cache drift replaces copy-paste drift (L3-03); exactly the problem the Pipeline is meant to solve.
- **`@` imports alone** — distribute only instruction text, no hooks/agents; hard guardrails would remain unenforced, since CLAUDE.md is officially "context, not enforced configuration."
- **SessionStart hook alone** — can inject context, but the hook itself must first reach the project; hooks only distribute via user settings or plugins — a chicken-and-egg problem without the plugin layer.
- The distribution-path alternatives **global `~/.claude`** and **checked-in `.claude/` copies per project** are weighed in [ADR-0001](0001-verteilung-plugin-marketplace.md).

## Follow-up

Phase 3 (bootstrap check as an invocable building block), Phase 4 (two-machine validation laptop/main PC).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0010: Session-Bootstrap-Mechanismus

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
