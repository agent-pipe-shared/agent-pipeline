# ADR-0026: Role split Elephant/Goldfish/Critic — formalization + plan-verifier

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-07, PO plan approval "AP1 TUNING") · **Basis:** `docs/operating-model.md` §2 (previously prose only), `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` package P6/P7

## Context

The Elephant/Goldfish/Critic role split has been described at length as prose in `docs/operating-model.md` §2 since Sprint 0 (Elephant orchestrates and never writes production code, EL-01/EL-16/E20 "delegate-first"; Goldfish is the executor in a fresh context for EXACTLY ONE briefed task; Critic is an independent, read-only reviewer, ADR-0014) — but it had no ADR of its own formalizing it as a foundational decision. The AP1 tuning plan (package P6) additionally introduces a new verification subagent: `plan-verifier` (`plugins/pipeline-core/agents/plan-verifier.md`), which checks an implementation diff against the approved plan — read-only, fresh context, BEFORE a task counts as DONE.

## Decision

The three-way role split described in `docs/operating-model.md` §2 is formalized as its own foundational decision:

- **Elephant** — long-lived orchestrator session. Writes no production code (EL-01); execution work ALWAYS goes to a briefed Goldfish dispatch (EL-16/E20 enforcement, [ADR-0020](0020-el01-enforcement-goldfish-duty.md)). Owns triage, spec/plan, decomposition, gate decisions, handover maintenance.
- **Goldfish** — fresh context, EXACTLY ONE 6-field briefing (goal · context files · DoD checks · prohibitions · stop conditions · dispatch metadata, `docs/operating-model.md` §2.3). No `memory` (E3); handoff only with a machine-checkable evidence artifact.
- **Critic** — independent, read-only reviewer (spec + diff + guardrails + evidence as the sole input, never chat history, [ADR-0014](0014-critic-contract.md)); trigger matrix by risk class (`docs/operating-model.md` §4.2).
- **NEW (AP1, package P6): `plan-verifier` agent** as an additional verification subagent — read-only, fresh context, Sonnet 5/`high` default (`plugins/pipeline-core/agents/plan-verifier.md`). It does NOT check spec fidelity/guardrails/edge cases (that stays a Critic task, [ADR-0014](0014-critic-contract.md)); it exclusively checks the plan↔diff mapping: every plan item gets a verdict `VERIFIED | GAP | UNPLANNED` with evidence (file:line/commit SHA/plan section). It is an additional, narrower check BEFORE the Critic resp. before "DONE" — not a replacement for the Critic contract, and not a fourth pipeline role in the sense of §2 (the implementing agent never verifies its own work, mirroring the E12 principle).

## Consequences

**Positive:** The role split, previously only living prose in §2, is now traceable via the decision register (anti-pattern "silently made foundational decision", `docs/operating-model.md` §2.2, prohibition line); `plan-verifier` closes a previously open gap — until now there was no mechanical evidence that a diff really covers EVERY plan item, only the Critic's general view on spec fidelity.

**Negative:** One more subagent dispatch per feature close-out (cost, turnaround) — accepted deliberately as a narrow, cheap Sonnet/`high` check ahead of the more expensive Critic.

**Risk:** Role sprawl if future sessions confuse `plan-verifier` with the Critic, or treat its findings as a substitute for a Critic review. Mitigation: clear boundary in the agent contract itself (`plan-verifier.md`: "mirrors E12/critic.md", but exclusively plan↔diff mapping, no spec/guardrail verdict) and in this ADR.

## Rejected alternatives

- **No dedicated ADR, role split stays pure OM prose** — rejected because foundational decisions without a register/ADR are not reconstructable (`docs/operating-model.md` §2.2 prohibition line, Critic finding L1-04 from Checkpoint 1).
- **`plan-verifier` as an extension of the Critic contract instead of its own agent** — rejected: the Critic deliberately checks more broadly (spec fidelity, edge cases, trajectory) and is more expensive (Sonnet/`max`, possibly Fable/`max`); a narrow, cheap plan↔diff comparison BEFORE the Critic dispatch filters out gross gaps more cheaply upstream.

## Follow-up

None. First real `plan-verifier` dispatch: package P8 (E2E demo) of the AP1 plan.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0026: Rollenschnitt Elephant/Goldfish/Critic — Formalisierung + plan-verifier

> Agent-Pipeline v0.1.0-draft · AP1-Tuning-Session · Stand 2026-07-07

**Status:** akzeptiert (2026-07-07, the PO-Plan-Freigabe „AP1 TUNING") · **Grundlage:** `docs/operating-model.md` §2 (bislang nur Prosa), `.claude/plans/2026-07-07-ap1-pipeline-tuning.md` Paket P6/P7

## Kontext

Der Rollenschnitt Elephant/Goldfish/Critic ist seit Sprint 0 in `docs/operating-model.md` §2 ausführlich als Prosa beschrieben (Elephant orchestriert und schreibt keinen Produktions-Code, EL-01/EL-16/E20 „delegate-first"; Goldfish ist der Ausführer im frischen Kontext für GENAU EINE gebriefte Aufgabe; Critic ist unabhängiger, read-only Prüfer, ADR-0014) — er hatte bislang jedoch kein eigenes ADR, das ihn als Grundsatzentscheidung formalisiert. Der AP1-Tuning-Plan (Paket P6) führt zusätzlich einen neuen Verifikations-Subagenten ein: `plan-verifier` (`plugins/pipeline-core/agents/plan-verifier.md`), der einen Implementierungs-Diff gegen den freigegebenen Plan abgleicht — read-only, frischer Kontext, BEVOR eine Aufgabe als DONE gilt.

## Entscheidung

Der in `docs/operating-model.md` §2 beschriebene Dreier-Rollenschnitt wird als eigenständige Grundsatzentscheidung formalisiert:

- **Elephant** — langlebige Orchestrator-Session. Schreibt keinen Produktions-Code (EL-01); Ausführungsarbeit geht IMMER an einen gebrieften Goldfish-Dispatch (EL-16/E20-Enforcement, [ADR-0020](0020-el01-enforcement-goldfish-duty.md)). Verantwortet Triage, Spec/Plan, Dekomposition, Gate-Entscheid, Handover-Pflege.
- **Goldfish** — frischer Kontext, GENAU EIN 6-Feld-Briefing (Ziel · Kontext-Dateien · DoD-Checks · Verbote · Stop-Bedingungen · Dispatch-Metadaten, `docs/operating-model.md` §2.3). Kein `memory` (E3); Abgabe nur mit maschinellem Evidenz-Artefakt.
- **Critic** — unabhängiger, read-only Prüfer (Spec + Diff + Guardrails + Evidenz als einziger Input, nie Chat-Verlauf, [ADR-0014](0014-critic-contract.md)); Trigger-Matrix nach Risikoklasse (`docs/operating-model.md` §4.2).
- **NEU (AP1, Paket P6): `plan-verifier`-Agent** als zusätzlicher Verifikations-Subagent — read-only, frischer Kontext, Sonnet 5/`high` Standard (`plugins/pipeline-core/agents/plan-verifier.md`). Er prüft NICHT Spec-Treue/Guardrails/Edge-Cases (das bleibt Critic-Aufgabe, [ADR-0014](0014-critic-contract.md)), sondern ausschließlich die Plan↔Diff-Abbildung: jedes Plan-Item bekommt ein Verdikt `VERIFIED | GAP | UNPLANNED` mit Beleg (file:line/Commit-SHA/Plan-Abschnitt). Er ist ein zusätzlicher, schmalerer Prüfschritt VOR dem Critic bzw. vor „DONE" — kein Ersatz für den Critic-Kontrakt und keine neue vierte Pipeline-Rolle im Sinne von §2 (der implementierende Agent verifiziert nie die eigene Arbeit, spiegelt den E12-Grundsatz).

## Konsequenzen

**Positiv:** Der Rollenschnitt, der bisher nur als lebende Prosa in §2 existierte, ist jetzt registerfest nachvollziehbar (Anti-Pattern „still getroffene Grundsatzentscheidung", `docs/operating-model.md` §2.2, Verbot-Zeile); der `plan-verifier` schließt eine bisher offene Lücke — bislang gab es keinen mechanischen Beleg, dass ein Diff wirklich JEDES Plan-Item abdeckt, nur den Critic-Blick auf Spec-Treue im Allgemeinen.

**Negativ:** Ein weiterer Subagent-Dispatch pro Feature-Abschluss (Kosten, Turnaround) — bewusst in Kauf genommen als schmaler, günstiger Sonnet/`high`-Check vor dem teureren Critic.

**Risiko:** Rollen-Wildwuchs, falls künftige Sessions den `plan-verifier` mit dem Critic verwechseln oder seine Befunde als Ersatz für eine Critic-Prüfung werten. Mitigation: klare Abgrenzung im Agent-Kontrakt selbst (`plan-verifier.md`: „mirrors E12/critic.md", aber ausschließlich Plan↔Diff-Mapping, kein Spec-/Guardrail-Urteil) und in diesem ADR.

## Verworfene Alternativen

- **Kein eigenes ADR, Rollenschnitt bleibt reine OM-Prosa** — verworfen, weil Grundsatzentscheidungen ohne Register/ADR nicht rekonstruierbar sind (`docs/operating-model.md` §2.2 Verbot-Zeile, Critic-Befund L1-04 aus Checkpoint 1).
- **`plan-verifier` als Erweiterung des Critic-Kontrakts statt eigener Agent** — verworfen: der Critic prüft bewusst breiter (Spec-Treue, Edge-Cases, Trajektorie) und ist teurer (Sonnet/`max`, ggf. Fable/`max`); ein schmaler, günstiger Plan↔Diff-Abgleich VOR dem Critic-Dispatch filtert grobe Lücken billiger vor.

## Wiedervorlage

Keine. Erster realer `plan-verifier`-Dispatch: Paket P8 (E2E-Demo) des AP1-Plans.
