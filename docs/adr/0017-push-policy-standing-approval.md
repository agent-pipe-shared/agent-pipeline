# ADR-0017: Push Policy — Standing Approval for `main` Pushes at Work-Package Boundaries

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-04, PO revision) · **Basis:** Register E15

## Context

The original push approval (Decision 3, 2026-07-02) had pulled forward remote+push for cross-machine handover, but approved it per work state individually. The PO explicitly revised this on 2026-07-04 for automated-mode operation of this repo.

## Decision (E15, verbatim)

> Push policy (PO revision, 2026-07-04): `main` push at work-package boundaries is standing-approved in THIS repo ("especially in automode I just need to be able to push"); destructive forms (force-push, history rewrite, branch/tag deletion, hook skip) remain deterministically blocked by the guard union. Implemented in the CLAUDE.md hard rule, GIT-05, `permissions.allow`. Project repos keep their own calibration (GIT-05).

## Consequences

**Positive:** No approval overhead per push in this repo; faster automode throughput at work-package boundaries.

**Negative:** Higher error potential from the absence of manual intermediate review before each push — mitigated by the guard union ([ADR-0013](0013-git-guard-union.md)).

**Risk:** Standing approval could unintentionally "bleed" into other project repos; explicitly excluded — project repos keep their own calibration (GIT-05).

## Rejected alternatives

- **Keeping per-push individual approval** — incompatible with this repo's desired automode pace (PO rationale quoted verbatim in the register).
- **Standing approval also for destructive git forms** — explicitly rejected; force-push, history rewrite, branch/tag deletion, and hook skip remain deterministically blocked.

## Follow-up

**Share / public edition (2026-07-11, git-public-readiness):** for the public template repo, the committed `.claude/settings.json` no longer ships `permissions.allow` — a public template must not pre-authorize any push (the `git push*` glob also matches force-push; least-privilege default). The standing approval this ADR records still holds for THIS repo's automode maintenance — the committed `.claude/pipeline.yaml` still declares it as the guard-push approval — but the Claude Code permission-prompt bypass for it now lives only in the operator-local, gitignored `.claude/settings.local.json` (per machine; a fresh clone or a second machine re-adds it), no longer in a committed permissions block (so on a fresh clone, pushes still prompt at the permission layer until that file is added). The destructive-form block (guard union) is unchanged and remains the real force-push defense. Correspondingly, the `setup.mjs` generator emits `permissions.allow` only for adopters who choose `standing-approved` autonomy — honoring the no-bleed Risk clause above (a gated adopter gets no prompt-less push).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0017: Push-Policy — Standing-Approval für `main`-Push an Arbeitspaket-Grenzen

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 4 · Stand 2026-07-11

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

**Share-/Public-Edition (2026-07-11, git-public-readiness):** Für das öffentliche Template-Repo shippt die committete `.claude/settings.json` kein `permissions.allow` mehr — ein öffentliches Template darf keinen Push vorautorisieren (der `git push*`-Glob matcht auch Force-Push; Least-Privilege-Default). Die hier festgehaltene Standing-Approval gilt für die Automode-Pflege DIESES Repos weiter — die committete `.claude/pipeline.yaml` deklariert sie weiterhin als guard-push-Approval —, aber der Claude-Code-Permission-Prompt-Bypass dafür lebt nun nur noch im operator-lokalen, gitignorten `.claude/settings.local.json` (pro Maschine; ein frischer Clone oder eine zweite Maschine legt es erneut an), nicht mehr in einem committeten permissions-Block (auf einem frischen Clone fragt der Push also weiterhin auf der Permission-Ebene nach, bis diese Datei angelegt ist). Der Destruktiv-Block (Guard-Union) ist unverändert und bleibt die eigentliche Force-Push-Abwehr. Entsprechend emittiert der `setup.mjs`-Generator das `permissions.allow` nur noch für Adopter, die `standing-approved`-Autonomie wählen — im Einklang mit der No-Bleed-Risikoklausel oben (ein gated-Adopter erhält kein prompt-loses Push).
