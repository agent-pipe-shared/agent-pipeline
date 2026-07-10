# ADR-0026: Rollenschnitt Elephant/Goldfish/Critic — Formalisierung + plan-verifier

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR formalizes the three-role split (Elephant orchestrates and never writes production code; Goldfish executes exactly one briefed task in a fresh context; Critic is an independent, read-only reviewer) that had previously existed only as prose in the operating model, giving it its own decision record. It also introduces a new `plan-verifier` subagent — read-only, fresh context — that checks a diff against the approved plan item-by-item (verdicts `VERIFIED | GAP | UNPLANNED`), as a narrower, cheaper pre-check before the more expensive Critic review, without replacing the Critic contract or adding a fourth pipeline role. Status: accepted 2026-07-07.

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `docs/operating-model.md` §2 (bislang nur Prosa), `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Paket P6/P7

## Kontext

Der Rollenschnitt Elephant/Goldfish/Critic ist seit Sprint 0 in `docs/operating-model.md` §2 ausführlich als Prosa beschrieben (Elephant orchestriert und schreibt keinen Produktions-Code, EL-01/EL-16/E20 „delegate-first"; Goldfish ist der Ausführer im frischen Kontext für GENAU EINE gebriefte Aufgabe; Critic ist unabhängiger, read-only Prüfer, ADR-0014) — er hatte bislang jedoch kein eigenes ADR, das ihn als Grundsatzentscheidung formalisiert. Der AP1-Tuning-Plan (Paket P6) führt zusätzlich einen neuen Verifikations-Subagenten ein: `plan-verifier` (`plugins/pipeline-core/agents/plan-verifier.md`), der einen Implementierungs-Diff gegen den freigegebenen Plan abgleicht — read-only, frischer Kontext, BEVOR eine Aufgabe als DONE gilt.

## Entscheidung

Der in `docs/operating-model.md` §2 beschriebene Dreier-Rollenschnitt wird als eigenständige Grundsatzentscheidung formalisiert:

- **Elephant** — langlebige Orchestrator-Session. Schreibt keinen Produktions-Code (EL-01); Ausführungsarbeit geht IMMER an einen gebrieften Goldfish-Dispatch (EL-16/E20-Enforcement, [ADR-0020](0020-el01-enforcement-goldfish-pflicht.md)). Verantwortet Triage, Spec/Plan, Dekomposition, Gate-Entscheid, Handover-Pflege.
- **Goldfish** — frischer Kontext, GENAU EIN 6-Feld-Briefing (Ziel · Kontext-Dateien · DoD-Checks · Verbote · Stop-Bedingungen · Dispatch-Metadaten, `docs/operating-model.md` §2.3). Kein `memory` (E3); Abgabe nur mit maschinellem Evidenz-Artefakt.
- **Critic** — unabhängiger, read-only Prüfer (Spec + Diff + Guardrails + Evidenz als einziger Input, nie Chat-Verlauf, [ADR-0014](0014-critic-kontrakt.md)); Trigger-Matrix nach Risikoklasse (`docs/operating-model.md` §4.2).
- **NEU (AP1, Paket P6): `plan-verifier`-Agent** als zusätzlicher Verifikations-Subagent — read-only, frischer Kontext, Sonnet 5/`high` Standard (`plugins/pipeline-core/agents/plan-verifier.md`). Er prüft NICHT Spec-Treue/Guardrails/Edge-Cases (das bleibt Critic-Aufgabe, [ADR-0014](0014-critic-kontrakt.md)), sondern ausschließlich die Plan↔Diff-Abbildung: jedes Plan-Item bekommt ein Verdikt `VERIFIED | GAP | UNPLANNED` mit Beleg (file:line/Commit-SHA/Plan-Abschnitt). Er ist ein zusätzlicher, schmalerer Prüfschritt VOR dem Critic bzw. vor „DONE" — kein Ersatz für den Critic-Kontrakt und keine neue vierte Pipeline-Rolle im Sinne von §2 (der implementierende Agent verifiziert nie die eigene Arbeit, spiegelt den E12-Grundsatz).

## Konsequenzen

**Positiv:** Der Rollenschnitt, der bisher nur als lebende Prosa in §2 existierte, ist jetzt registerfest nachvollziehbar (Anti-Pattern „still getroffene Grundsatzentscheidung", `docs/operating-model.md` §2.2, Verbot-Zeile); der `plan-verifier` schließt eine bisher offene Lücke — bislang gab es keinen mechanischen Beleg, dass ein Diff wirklich JEDES Plan-Item abdeckt, nur den Critic-Blick auf Spec-Treue im Allgemeinen.

**Negativ:** Ein weiterer Subagent-Dispatch pro Feature-Abschluss (Kosten, Turnaround) — bewusst in Kauf genommen als schmaler, günstiger Sonnet/`high`-Check vor dem teureren Critic.

**Risiko:** Rollen-Wildwuchs, falls künftige Sessions den `plan-verifier` mit dem Critic verwechseln oder seine Befunde als Ersatz für eine Critic-Prüfung werten. Mitigation: klare Abgrenzung im Agent-Kontrakt selbst (`plan-verifier.md`: „mirrors E12/critic.md", aber ausschließlich Plan↔Diff-Mapping, kein Spec-/Guardrail-Urteil) und in diesem ADR.

## Verworfene Alternativen

- **Kein eigenes ADR, Rollenschnitt bleibt reine OM-Prosa** — verworfen, weil Grundsatzentscheidungen ohne Register/ADR nicht rekonstruierbar sind (`docs/operating-model.md` §2.2 Verbot-Zeile, Critic-Befund L1-04 aus Checkpoint 1).
- **`plan-verifier` als Erweiterung des Critic-Kontrakts statt eigener Agent** — verworfen: der Critic prüft bewusst breiter (Spec-Treue, Edge-Cases, Trajektorie) und ist teurer (Sonnet/`max`, ggf. Fable/`max`); ein schmaler, günstiger Plan↔Diff-Abgleich VOR dem Critic-Dispatch filtert grobe Lücken billiger vor.

## Wiedervorlage

Keine. Erster realer `plan-verifier`-Dispatch: Paket P8 (E2E-Demo) des AP1-Plans.
