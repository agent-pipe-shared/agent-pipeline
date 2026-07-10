# ADR-0017: Push-Policy — Standing-Approval für `main`-Push an Arbeitspaket-Grenzen

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR records a standing (pre-approved) authorization for the agent to push `main` to origin at work-package boundaries in this repository, replacing the earlier per-push approval requirement, so automated-mode work is not slowed by manual sign-off on every push. The change was made explicitly by the product owner on 2026-07-04 for this repo only; destructive git operations (force-push, history rewrite, branch/tag deletion, hook skipping) remain deterministically blocked by the guard-union regardless of this approval, and other project repos keep their own separate calibration.

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 4 · Stand 2026-07-06

**Status:** akzeptiert (2026-07-04, the PO-Revision) · **Grundlage:** Register E15

## Kontext

Die ursprüngliche Push-Freigabe (Entscheidung 3, 2026-07-02) hatte Remote+Push für den Cross-Machine-Handover vorgezogen, aber je Arbeitsstand einzeln freigegeben. the PO revidierte das am 2026-07-04 ausdrücklich für den Automode-Betrieb dieses Repos.

## Entscheidung (E15, wortgetreu)

> Push-Policy (Revision the PO, 2026-07-04): `main`-Push an Arbeitspaket-Grenzen ist in DIESEM Repo standing-approved („gerade im Automode musst du einfach pushen dürfen"); destruktive Formen (Force-Push, History-Rewrite, Branch-/Tag-Löschung, Hook-Skip) blockt weiterhin deterministisch die Guard-Union. Umgesetzt in CLAUDE.md-Hard-Rule, GIT-05, `permissions.allow`. Projekt-Repos behalten eigene Kalibrierung (GIT-05)

## Konsequenzen

**Positiv:** Kein Freigabe-Overhead je Push in diesem Repo; schnellerer Automode-Durchlauf an Arbeitspaket-Grenzen.

**Negativ:** Höheres Fehlerpotenzial durch fehlende manuelle Zwischenkontrolle vor jedem Push — abgefedert durch die Guard-Union ([ADR-0013](0013-git-guard-union.md)).

**Risiko:** Standing-Approval könnte unbeabsichtigt auf andere Projekt-Repos „abfärben"; explizit ausgeschlossen — Projekt-Repos behalten ihre eigene Kalibrierung (GIT-05).

## Verworfene Alternativen

- **Beibehaltung der Einzelfreigabe je Push** — verträgt sich nicht mit dem gewünschten Automode-Tempo dieses Repos (the PO-Begründung wortgetreu im Register zitiert).
- **Standing-Approval auch für destruktive Git-Formen** — ausdrücklich verworfen; Force-Push, History-Rewrite, Branch-/Tag-Löschung und Hook-Skip bleiben deterministisch blockiert.

## Wiedervorlage

Keine im Register genannt.
