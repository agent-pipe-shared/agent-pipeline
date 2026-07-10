# ADR-0004: Three-Tier Spec Rigor + EARS Acceptance Criteria

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E4

## Context

All SDD frameworks converge on the same Markdown artifacts (Constitution/Spec/Plan/Tasks); Agent OS v3 dropped its own orchestration phases; in the one head-to-head comparison found, the lightest tool won and Spec Kit scored worst. The SDD critique is well documented: overhead ∝ 1/task-size, spec drift, the waterfall trap. EARS ("WHEN … THE SYSTEM SHALL …") turns every acceptance criterion 1:1 into a test case — the spec → tests → Critic bridge.

## Decision (E4, verbatim)

> Spec-Rigor: 3 tiers (0 issue-only / 1 delta-spec / 2 spec-anchored for core contracts); EARS from Tier 1 up; home-grown templates, no external CLI

Detail:

- **Tier 0 (issue-only):** bugfix with repro, config, docs — the fast path in the SDLC; verify + evidence stay mandatory.
- **Tier 1 (spec-first, delta):** medium features — delta spec following the OpenSpec pattern, archived after merge.
- **Tier 2 (spec-anchored):** a small number of long-lived core contracts (`<PROJECT_A>` API, `<PROJECT_B>` schema/invariants, `<PROJECT_C>` core systems) — the spec lives in the repo and evolves with it.
- The Elephant decides the tier triage per the Constitution rule. Templates are modeled in content on Spec Kit (Constitution), OpenSpec (delta spec), Kiro (EARS) — versioned in this repo.

## Consequences

**Positive:** Critic-checkability is bought exactly where it pays off; process cost scales with task size (Auflage/mandate A3 → [operating-model.md](../operating-model.md)); no tool lock-in, no external-CLI upgrade risk.

**Negative:** Tier-0 changes deliberately run without a spec contract — an accepted residual risk; Tier 2 carries an ongoing "maintenance tax."

**Risk:** mis-triage. Mitigation: a spec-readiness check before implementation (mandate A1; mandatory for Tier 2 + architecture/guardrails, recommended for Tier 1 — → [operating-model.md](../operating-model.md)).

## Rejected alternatives

- **External CLI (Spec Kit / Kiro / OpenSpec) as a dependency** — lock-in and documented upgrade risk; the framework convergence is in the artifacts, not the tooling.
- **One workflow for all task sizes** — fails on differing problem sizes (Böckeler's core critique) and was the most likely discipline tipping point (Critic finding L3-01).
- **spec-as-source** — experimental, not production-ready.

## Follow-up

None. Templates + triage rule: Phase 3; project mapping of the Tier-2 contracts: Phase 4.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0004: Spec-Rigor in drei Stufen + EARS-Akzeptanzkriterien

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
