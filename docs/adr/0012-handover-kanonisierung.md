# ADR-0012: Baton Handoff — Canonicalizing the Handover Source

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E10 + condition A9

## Context

The codebase maintained the handover baton three times by hand (HISTORY log, CLAUDE.md status section, memory) — and it provably lied: one project's CLAUDE.md contradicted HEAD, another project's status existed threefold, a third referenced memory files that didn't exist; the chain broke on a fresh clone. Critic finding L2-03: the relationship between the handover file and the HISTORY "open items" block was undefined — the baton risked existing twice again → condition A9.

## Decision (E10, verbatim)

> Baton: ONE versioned handover file per project; memory is mirror-only; merge completion + CLAUDE.md length as deterministic gates

Refinement (condition A9):

- The **handover file is canonical**. The HISTORY "open items" block is **generated from, or references,** the handover file — it is never hand-maintained.
- **Memory is a mirror only** of what's versioned; every session must be fully workable on a fresh clone without memory.
- Two **deterministic gates** in the close ritual: merge completion (handover/doc sync happens before work counts as done) and a CLAUDE.md length check (context economy; one project's hard limit as the model).

## Consequences

**Positive:** one canonical source ends the documented triple drift; a fresh clone works on both machines; gates are deterministic instead of relying on discipline.

**Negative:** generating/referencing the HISTORY block needs tooling (Phase 3); per-project migration of existing state (Phase 4).

**Risk:** secondary sources creep back in. Mitigation: the drift check in the close ritual checks handover ↔ HISTORY ↔ CLAUDE.md status; any deviation is a finding ("docs are a snapshot, code is truth").

## Rejected alternatives

- **Status quo (three hand-maintained places)** — a provably lying baton; the most expensive anti-pattern in the codebase.
- **Memory as canon** — unversioned and machine-local; provably breaks on a fresh clone.
- **HISTORY as canon** — an append-only log doesn't work as current state; its own "open items" block was exactly what risked diverging (L2-03).

## Follow-up

None. Handover template + generation/reference mechanics: Phase 3; project migration: Phase 4. For this repo, `state.md` is the handover file ([ADR-0015](0015-selbstanwendung.md)).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0012: Staffelstab — Kanonisierung der Handover-Quelle

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E10 + Auflage A9

## Kontext

Der Bestand pflegt den Staffelstab dreifach von Hand (HISTORY, CLAUDE.md-Stand, Memory) — und er lügt nachweislich: <PROJECT_C>s CLAUDE.md widerspricht HEAD, der <PROJECT_B>-Stand existiert dreifach, <PROJECT_A> referenziert nicht existierende Memory-Dateien; auf frischem Klon bricht die Kette. Critic-Befund L2-03: Das Verhältnis Handover ↔ HISTORY-„Offen"-Block war ungeklärt — der Staffelstab drohte wieder doppelt zu existieren → Auflage A9.

## Entscheidung (E10, wortgetreu)

> Staffelstab: EINE versionierte Handover-Datei je Projekt; Memory nur Spiegel; Merge-Abschluss + CLAUDE.md-Länge als deterministische Gates

Präzisierung (Auflage A9):

- Die **Handover-Datei ist kanonisch**. Der HISTORY-„Offen"-Block wird **generiert oder referenziert** die Handover-Datei — er wird nie handgepflegt.
- **Memory ist nur Spiegel** dessen, was versioniert ist; jede Session muss auf frischem Klon ohne Memory voll arbeitsfähig sein.
- Zwei **deterministische Gates** im Close-Ritual: Merge-Abschluss (Handover/Doku-Sync erfolgt, bevor der Vorgang als abgeschlossen gilt) und CLAUDE.md-Längen-Check (Kontext-Ökonomie; <PROJECT_A>-Hard-Limit als Vorbild).

## Konsequenzen

**Positiv:** eine kanonische Quelle beendet die belegte Dreifach-Drift; frischer Klon funktioniert auf beiden Rechnern; Gates deterministisch statt Disziplin-Hoffnung.

**Negativ:** Generierung/Referenzierung des HISTORY-Blocks braucht Tooling (Phase 3); Bestandsmigration je Projekt (Phase 4).

**Risiko:** Zweitquellen entstehen schleichend neu. Prüfweise: Der Drift-Check im Close-Ritual prüft Handover ↔ HISTORY ↔ CLAUDE.md-Stand; jede Abweichung ist ein Befund („Doku ist Snapshot, Code ist Wahrheit").

## Verworfene Alternativen

- **Status quo (drei handgepflegte Orte)** — nachweislich lügender Staffelstab; das teuerste Anti-Pattern des Bestands.
- **Memory als Kanon** — unversioniert und maschinenlokal; bricht belegt auf frischem Klon.
- **HISTORY als Kanon** — ein Append-only-Log taugt nicht als aktueller Zustand; genau sein „Offen"-Block drohte zu divergieren (L2-03).

## Wiedervorlage

Keine. Handover-Template + Generierungs-/Referenzmechanik: Phase 3; Projekt-Migration: Phase 4. Für dieses Repo ist `state.md` die Handover-Datei ([ADR-0015](0015-selbstanwendung.md)).
