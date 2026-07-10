# ADR-0012: Staffelstab — Kanonisierung der Handover-Quelle

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR canonicalizes handover state into a single versioned file per project, replacing a three-way manual duplication (HISTORY log, CLAUDE.md status section, memory) that had provably drifted out of sync across projects. Memory becomes a mirror only — never a source of truth — and any session must be fully workable from a fresh clone without it. Two deterministic gates enforce this at close time: a merge-completion check (handover/doc sync must happen before work counts as done) and a CLAUDE.md length check. Status: accepted (2026-07-03); for this repo, `docs/state.md` is the canonical handover file per ADR-0015.

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
