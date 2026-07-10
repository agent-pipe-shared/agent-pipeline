# ADR-0002: Versionierungsstrategie — SHA-Phase, dann SemVer

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR decides that the plugin starts in a SHA-based versioning phase — no `version` field, every commit on `main` propagates immediately to consuming projects — instead of adopting SemVer and Git tags from day one. Rationale: in Sprint 0/1 the pipeline is the least stable artifact in the portfolio, and release ceremony would slow iteration; the SemVer/tag channel pattern (stable/latest) is documented and ready to adopt once stability matters more than iteration speed. Status: accepted (2026-07-03); the switchover trigger is still open (candidates: the v0.1.0 release, or once all consuming projects are on the pipeline in production).

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E2

## Kontext

Die Plugin-Versionsauflösung fällt ohne `version`-Feld auf den Commit-SHA zurück; genau das ist die offizielle Empfehlung für interne Plugins in aktiver Entwicklung (jeder Commit propagiert). SemVer kommt später über Git-Tags (`claude plugin tag`); zwei Marketplace-Refs auf dasselbe Repo ergeben vorbereitete stable/latest-Kanäle. Die Pipeline ist in Sprint 0/1 das instabilste Artefakt im Bestand — Release-Zeremonie würde die Iteration bremsen.

## Entscheidung (E2, wortgetreu)

> Versionierung: zunächst SHA-basiert (jeder Commit propagiert), SemVer + Tags ab Stabilitätsphase

Präzisierung: In der SHA-Phase ist der jüngste Commit auf `main` der verteilte Stand — es gibt keine Pin-Illusion. Der Umstieg auf SemVer (+ Tags, optional stable/latest-Kanäle) erfolgt, sobald Stabilität wichtiger ist als Iterationstempo.

## Konsequenzen

**Positiv:**

- Maximales Iterationstempo; Fixes erreichen alle Projekte ohne Release-Schritt.
- Der Umstieg ist vorbereitet (Kanal-Muster dokumentiert), kein Umbau nötig.

**Negativ / Risiken:**

- Auch fehlerhafte Commits propagieren sofort auf beide Rechner; kein Rollback-Pin in der SHA-Phase. Mitigation: Selbstanwendung — Critic-Review vor Merge ins Pipeline-Repo ([ADR-0015](0015-selbstanwendung.md)); der Bootstrap zeigt den konsumierten SHA an ([ADR-0010](0010-session-bootstrap.md)).
- Migrationsdossiers (Phase 4) referenzieren konkrete Stände — dort ggf. erste Tags als Bezugspunkte setzen.

## Verworfene Alternativen

- **SemVer ab Tag 1** — Release-Overhead in der instabilsten Phase; verleitet zu gebatchten statt kleinen atomaren Commits.
- **Dauerhaft SHA ohne SemVer-Perspektive** — ohne Tags keine stabilen Bezugspunkte für Pinning, Rollback und Changelog-Kommunikation.

## Wiedervorlage

Umstieg auf SemVer bei Stabilität. OFFEN (Phase 5): das konkrete Umstiegskriterium — Kandidaten: mit dem v0.1.0-Release nach Checkpoint 3, oder sobald alle drei Projekte produktiv konsumieren (Sprint-1-Migration abgeschlossen).
