# ADR-0002: Versioning strategy — SHA phase, then SemVer

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E2

## Context

Without a `version` field, plugin version resolution falls back to the commit SHA — which is exactly the official recommendation for internal plugins under active development (every commit propagates). SemVer arrives later via Git tags (`claude plugin tag`); two marketplace refs on the same repo give prepared stable/latest channels. In Sprint 0/1 the pipeline is the least stable artifact in the portfolio — release ceremony would slow iteration down.

## Decision (E2, verbatim)

> Versioning: SHA-based initially (every commit propagates), SemVer + tags from the stability phase onward.

Clarification: in the SHA phase, the latest commit on `main` is the distributed state — there is no pin illusion. The switch to SemVer (+ tags, optionally stable/latest channels) happens once stability matters more than iteration speed.

## Consequences

**Positive:**

- Maximum iteration speed; fixes reach all projects without a release step.
- The switchover is prepared (channel pattern documented), no rework needed.

**Negative / risks:**

- Faulty commits also propagate immediately to both machines; no rollback pin during the SHA phase. Mitigation: self-application — Critic review before merge into the pipeline repo ([ADR-0015](0015-self-application.md)); the bootstrap displays the consumed SHA ([ADR-0010](0010-session-bootstrap.md)).
- Migration dossiers (Phase 4) reference concrete states — first tags may need to be set there as reference points.

## Rejected alternatives

- **SemVer from day one** — release overhead in the least stable phase; encourages batched commits instead of small atomic ones.
- **Permanently SHA without a SemVer perspective** — without tags, no stable reference points for pinning, rollback, and changelog communication.

## Follow-up

Switch to SemVer once stable. OPEN (Phase 5): the concrete switchover criterion — candidates: with the v0.1.0 release after Checkpoint 3, or once all three projects consume in production (Sprint 1 migration complete).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0002: Versionierungsstrategie — SHA-Phase, dann SemVer

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

- Auch fehlerhafte Commits propagieren sofort auf beide Rechner; kein Rollback-Pin in der SHA-Phase. Mitigation: Selbstanwendung — Critic-Review vor Merge ins Pipeline-Repo ([ADR-0015](0015-self-application.md)); der Bootstrap zeigt den konsumierten SHA an ([ADR-0010](0010-session-bootstrap.md)).
- Migrationsdossiers (Phase 4) referenzieren konkrete Stände — dort ggf. erste Tags als Bezugspunkte setzen.

## Verworfene Alternativen

- **SemVer ab Tag 1** — Release-Overhead in der instabilsten Phase; verleitet zu gebatchten statt kleinen atomaren Commits.
- **Dauerhaft SHA ohne SemVer-Perspektive** — ohne Tags keine stabilen Bezugspunkte für Pinning, Rollback und Changelog-Kommunikation.

## Wiedervorlage

Umstieg auf SemVer bei Stabilität. OFFEN (Phase 5): das konkrete Umstiegskriterium — Kandidaten: mit dem v0.1.0-Release nach Checkpoint 3, oder sobald alle drei Projekte produktiv konsumieren (Sprint-1-Migration abgeschlossen).
