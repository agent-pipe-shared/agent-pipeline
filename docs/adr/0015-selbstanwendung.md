# ADR-0015: Self-Application of the Pipeline to the Pipeline Repo

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E13, PO decision

## Context

The Pipeline requires independent review, evidence, and versioned handovers from the projects it governs — that is only credible and tested if the Pipeline repo itself works the same way. Already practiced at Checkpoint 1: three independent Critics (fresh context, Fable 5/max) found 5 major findings and 0 blockers; immediate fixes and conditions A1–A13 were produced BEFORE the PO gate.

## Decision (E13, verbatim)

> Self-application: the Pipeline's own working method applies to this repo; checkpoint deliverables go through Critic review before the PO gate

Clarifications:

- The Critic contract ([ADR-0014](0014-critic-kontrakt.md)) applies to this repo's checkpoint deliverables; as architecture-/guardrail-critical, these reviews run on Fable 5/max ([ADR-0006](0006-modell-effort-policy.md)).
- Session hygiene/lifecycle ([ADR-0009](0009-session-hygiene-lifecycle.md)) and the languages policy ([ADR-0011](0011-sprachen-policy.md)) apply here exactly as in any project.
- Handover canonicity ([ADR-0012](0012-handover-kanonisierung.md)) concretely means: `state.md` is THE handover file of this repo; the drift check also applies to Pipeline artifacts (Critic finding L3-05).

## Consequences

**Positive:** Dogfooding is the only risk-free proving ground before rollout — Checkpoint 1 demonstrates the effect (major findings fixed before they calcify into ADRs); PO gates receive pre-filtered, evidence-based submissions.

**Negative:** Overhead within the Pipeline repo itself (reviews, condition management) — accepted deliberately.

**Risk:** Self-review theater if the Critic sits too close to the Elephant session. Mitigation: fresh context is mandatory, never chat history as input ([ADR-0014](0014-critic-kontrakt.md)); read-only; structured findings list with documented disposition per finding.

## Rejected alternatives

- **Pipeline repo as an exception ("the cobbler's children go barefoot")** — undermines the credibility of every rule and forfeits the only risk-free test run of the Pipeline's own mechanisms before deployment in the projects.

## Status / follow-up

None pending. DoD check of self-application: Phase 5 (Retro).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0015: Selbstanwendung der Pipeline auf das Pipeline-Repo

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E13, PO-Entscheid the PO

## Kontext

Die Pipeline verlangt von den Projekten unabhängige Prüfung, Evidenz und versionierte Übergaben — glaubwürdig und getestet ist das nur, wenn das Pipeline-Repo selbst so arbeitet. An Checkpoint 1 bereits praktiziert: drei unabhängige Critics (frischer Kontext, Fable 5/max) fanden 5 major-Befunde bei 0 Blockern; Sofort-Fixes und die Auflagen A1–A13 entstanden VOR dem the PO-Gate.

## Entscheidung (E13, wortgetreu)

> Selbstanwendung: Pipeline-Arbeitsweise gilt für dieses Repo; Checkpoint-Deliverables durchlaufen Critic-Review vor dem the PO-Gate

Präzisierung:

- Der Critic-Kontrakt ([ADR-0014](0014-critic-kontrakt.md)) gilt für die Checkpoint-Deliverables dieses Repos; als Architektur-/Guardrail-kritisch laufen diese Reviews auf Fable 5/max ([ADR-0006](0006-modell-effort-policy.md)).
- Session-Hygiene/Lifecycle ([ADR-0009](0009-session-hygiene-lifecycle.md)) und Sprachen-Policy ([ADR-0011](0011-sprachen-policy.md)) gelten hier wie in jedem Projekt.
- Handover-Kanonik ([ADR-0012](0012-handover-kanonisierung.md)) hier konkret: `state.md` ist DIE Handover-Datei dieses Repos; der Drift-Check gilt auch für Pipeline-Artefakte (Critic-Befund L3-05).

## Konsequenzen

**Positiv:** Dogfooding ist der einzige gefahrlose Prüfstand vor dem Rollout — Checkpoint 1 belegt die Wirkung (major-Befunde gefixt, bevor sie in ADRs erstarren); the PO-Gates bekommen vorgefilterte, evidenzbasierte Vorlagen.

**Negativ:** Overhead im Pipeline-Repo selbst (Reviews, Auflagen-Verwaltung) — bewusst in Kauf genommen.

**Risiko:** Selbst-Review-Theater, wenn der Critic der Elephant-Session zu nahe kommt. Mitigation: frischer Kontext ist Pflicht, nie Chat-Verlauf als Input ([ADR-0014](0014-critic-kontrakt.md)); read-only; strukturierte Befundliste mit dokumentierter Disposition je Befund.

## Verworfene Alternativen

- **Pipeline-Repo als Ausnahme („der Schuster trägt keine Schuhe")** — untergräbt die Glaubwürdigkeit jeder Regel und verschenkt den einzigen risikofreien Testlauf der eigenen Mechanismen vor dem Einsatz in den Projekten.

## Wiedervorlage

Keine. DoD-Check der Selbstanwendung: Phase 5 (Retro).
