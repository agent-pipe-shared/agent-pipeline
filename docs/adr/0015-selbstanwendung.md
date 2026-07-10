# ADR-0015: Selbstanwendung der Pipeline auf das Pipeline-Repo

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR decides that the Pipeline's own operating model applies to the Pipeline repository itself — there is no separate, lighter ruleset for building the Pipeline versus the projects it governs. Checkpoint deliverables in this repo must pass independent Critic review (fresh context, structured findings) before the PO gate, exactly as required of hosted projects. Rationale: self-application ("dogfooding") is the only risk-free proving ground for the Pipeline's mechanisms before rollout — Checkpoint 1 already found 5 major issues via three independent Critic reviews, fixed before the PO gate. Status: accepted (2026-07-03).

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
