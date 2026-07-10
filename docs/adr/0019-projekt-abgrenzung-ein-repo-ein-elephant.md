# ADR-0019: Project Boundaries — One Repo, One Elephant at a Time

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-04, AP-Sprint) · **Basis:** Register E19

## Context

Cross-project work needs a clear workspace contract so parallel sessions don't overwrite each other. The PO decided at the AP-Sprint on the principle "one repo, one Elephant at a time," with a fixed transfer path for cross-repo needs.

## Decision (E19)

"One repo, one Elephant at a time": a project Elephant writes ONLY within its own project repo; monitoring/collection sessions stay strictly read-only toward project repos. Cross-repo needs go through a fixed transfer path (the &lt;PROJECT_B&gt;-S38 pattern): a NEW item in the target repo's `backlog/items/` (append-only, no edits to foreign existing files), or a handback to the PO — "in a way that it will definitely be found." Deliberately a process rule ONLY (option b) — a path-guard hook (a) and a `writeRoots` field (c) are documented possibilities, not commissioned. Implementation: `roles/elephant.md`, operating-model §2.2, kickoff templates.

## Consequences

**Positive:** Prevents collisions between parallel sessions across project boundaries; a fixed, discoverable transfer path instead of ad-hoc edits in foreign repos.

**Negative:** A pure process rule — no technical safeguard (hook/field) enforces it; relies on discipline.

**Risk:** An Elephant could violate the rule anyway, since nothing technically blocks it. Mitigation: deliberately documented but not commissioned — options a/c remain open as a later hardening in the backlog item.

## Rejected alternatives

- **Path-guard hook (option a)** — documented possibility, deliberately not commissioned.
- **`writeRoots` field per project (option c)** — documented possibility, deliberately not commissioned.

## Follow-up

None scheduled; the deferred technical options (a/c) live in the referenced backlog item.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0019: Projekt-Abgrenzung — Ein Repo, ein Elephant zur Zeit

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
