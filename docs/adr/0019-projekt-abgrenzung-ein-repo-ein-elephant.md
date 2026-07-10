# ADR-0019: Projekt-Abgrenzung — Ein Repo, ein Elephant zur Zeit

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR establishes a workspace contract for cross-project agent work: one repo, one active "Elephant" (lead agent) session at a time, so parallel sessions cannot overwrite each other's changes. A project Elephant may only write within its own project repo; monitoring/collection sessions across repos must stay strictly read-only. Cross-repo needs are routed through a fixed transfer path — a new, append-only item in the target repo's `backlog/items/`, or a handback to the product owner — rather than ad-hoc edits to foreign repos. The decision is deliberately a process rule only (no enforcing hook or `writeRoots` field), accepted 2026-07-04 with the stricter technical options left open as a documented, unassigned backlog possibility.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 4 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-04, AP-Sprint) · **Grundlage:** Register E19

## Kontext

Cross-Projekt-Arbeit braucht einen klaren Arbeitsraum-Kontrakt, damit parallele Sessions sich nicht überschreiben. the PO entschied am AP-Sprint den Grundsatz „ein Repo, ein Elephant zur Zeit" mit einem festen Transferpfad für Cross-Repo-Bedarf.

## Entscheidung (E19, wortgetreu)

> Projekt-Abgrenzung / Arbeitsraum-Kontrakt (the PO, 2026-07-04, AP-Sprint): „Ein Repo, ein Elephant zur Zeit"; ein Projekt-Elephant schreibt NUR im eigenen Projekt-Repo; Monitoring-/Sammel-Sessions strikt read-only gegenüber Projekt-Repos. Cross-Repo-Bedarf läuft über den festen Transfer-Pfad (<PROJECT_B>-S38-Muster): NEUES Item in `backlog/items/` des Zielrepos (append-only, keine Edits an Fremd-Bestandsdateien) oder Übergabe an the PO — „so, dass es definitiv gefunden wird". Bewusst NUR Prozessregel (Option b) — Pfad-Guard-Hook (a) und `writeRoots`-Feld (c) nicht beauftragt, dokumentierte Möglichkeit. Umsetzung: roles/elephant.md, operating-model §2.2, Kickoff-Templates

## Konsequenzen

**Positiv:** Verhindert Kollisionen zwischen parallelen Sessions über Projektgrenzen hinweg; ein fester, auffindbarer Transferpfad statt Ad-hoc-Edits in Fremd-Repos.

**Negativ:** Reine Prozessregel — kein technischer Schutz (Hook/Feld) erzwingt sie; verlässt sich auf Disziplin.

**Risiko:** Ein Elephant könnte die Regel trotzdem verletzen, weil nichts sie technisch blockiert. Mitigation: bewusst dokumentiert, aber nicht beauftragt — die Optionen a/c bleiben als spätere Verschärfung im Backlog-Item offen.

## Verworfene Alternativen

- **Pfad-Guard-Hook (Option a)** — dokumentierte Möglichkeit, bewusst nicht beauftragt.
- **`writeRoots`-Feld je Projekt (Option c)** — dokumentierte Möglichkeit, bewusst nicht beauftragt.

## Wiedervorlage

Keine terminiert; die zurückgestellten technischen Optionen (a/c) liegen im genannten Backlog-Item.
