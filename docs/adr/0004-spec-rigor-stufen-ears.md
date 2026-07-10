# ADR-0004: Spec-Rigor in drei Stufen + EARS-Akzeptanzkriterien

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR establishes a three-tier spec-rigor model — Tier 0 (issue-only, for bugfixes with repro/config/docs), Tier 1 (spec-first delta specs for medium features, archived after merge, following an OpenSpec-style pattern), and Tier 2 (spec-anchored, for a small number of long-lived core contracts such as `<PROJECT_A>` API or `<PROJECT_B>` schema/invariants, where the spec lives in the repo and evolves with it) — with EARS-style acceptance criteria ("WHEN … THE SYSTEM SHALL …") required from Tier 1 upward to give a direct spec-to-test bridge. The decision favors home-grown templates over adopting an external spec-driven-development CLI (e.g. Spec Kit, Kiro, OpenSpec), to avoid tool lock-in and match process overhead to task size. Status: accepted (2026-07-03, Checkpoint 1).

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E4

## Kontext

Alle SDD-Frameworks konvergieren auf dieselben Markdown-Artefakte (Constitution/Spec/Plan/Tasks); Agent OS v3 hat seine Orchestrierungs-Phasen gestrichen; im einzigen Vergleichstest gewann das leichteste Tool, Spec Kit schnitt am schlechtesten ab. Die SDD-Kritik ist belegt: Overhead ∝ 1/Taskgröße, Spec-Drift, Waterfall-Falle. EARS („WHEN … THE SYSTEM SHALL …") macht jedes Akzeptanzkriterium 1:1 zu einem Testfall — die Brücke Spec → Tests → Critic.

## Entscheidung (E4, wortgetreu)

> Spec-Rigor: 3 Stufen (0 Issue-only / 1 Delta-Spec / 2 spec-anchored für Kernverträge); EARS ab Stufe 1; eigene Templates, kein Fremd-CLI

Präzisierung:

- **Stufe 0 (Issue-only):** Bugfix mit Repro, Konfig, Doku — Fast-Path im SDLC; verify + Evidenz bleiben Pflicht.
- **Stufe 1 (spec-first, Delta):** mittlere Features — Delta-Spec nach OpenSpec-Muster, nach Merge archiviert.
- **Stufe 2 (spec-anchored):** wenige langlebige Kernverträge (<PROJECT_A>-API, <PROJECT_B>-Schema/Invarianten, <PROJECT_C>-Kernsysteme) — die Spec lebt im Repo und evolviert mit.
- Die Stufen-Triage entscheidet der Elephant nach Constitution-Regel. Templates inhaltlich angelehnt an Spec Kit (Constitution), OpenSpec (Delta-Spec), Kiro (EARS) — versioniert in diesem Repo.

## Konsequenzen

**Positiv:** Critic-Prüfbarkeit genau dort eingekauft, wo sie sich lohnt; Prozess-Toll proportional zur Taskgröße (Auflage A3 → [operating-model.md](../operating-model.md)); kein Tool-Lock-in, keine Fremd-CLI-Upgrade-Risiken.

**Negativ:** Stufe-0-Änderungen laufen bewusst ohne Spec-Vertrag — akzeptiertes Restrisiko; Stufe 2 kostet laufende „maintenance tax".

**Risiko:** Fehltriagen. Mitigation: Spec-Readiness-Check vor Implementierung (Auflage A1; Pflicht bei Stufe 2 + Architektur/Guardrails, empfohlen bei Stufe 1 — → [operating-model.md](../operating-model.md)).

## Verworfene Alternativen

- **Fremd-CLI (Spec Kit / Kiro / OpenSpec) als Abhängigkeit** — Lock-in und belegte Upgrade-Risiken; die Framework-Konvergenz liegt in den Artefakten, nicht im Tooling.
- **Einheits-Workflow für alle Taskgrößen** — scheitert an unterschiedlichen Problemgrößen (Böckelers Kern-Kritik) und war der wahrscheinlichste Disziplin-Kipppunkt (Critic-Befund L3-01).
- **spec-as-source** — experimentell, nicht produktionsreif.

## Wiedervorlage

Keine. Templates + Triage-Regel: Phase 3; Projekt-Zuordnung der Stufe-2-Verträge: Phase 4.
