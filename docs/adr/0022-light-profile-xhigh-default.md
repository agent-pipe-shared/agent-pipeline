# ADR-0022: Light Dispatch Profile + Goldfish `xhigh` Default Effort

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted historically (2026-07-05); effort rule superseded by MP-27 on 2026-07-13 · **Basis:** Register E22

## Context

The speed-tuning pass identified several levers; two of them concern the Goldfish (implementor) role directly — a lightweight dispatch profile for tier-0/mechanical tasks, and a general effort default brought to parity with the Elephant's own calibration (Register E16, [ADR-0006](0006-model-effort-policy.md)).

## Decision (E22)

Two changes, decided by the PO 2026-07-05 (tuning session):

- **(a) Opt-in `Profile: light`** for tier-0/mechanical dispatches — a compact 3-field report, inlined references, no pre-edit baseline verification, run at effort `xhigh`. GF-08 evidence requirements and GF-07 stop conditions stay untouched; this profile is **never** used for high-risk/guardrail work.
- **(b) `xhigh` becomes the general Goldfish default effort** (parity with the E16 Elephant calibration): `max` is reserved for large/complex/guardrail work, `high` for trivial/uniform work only.

Implemented in: `operating-model.md` §3.3, `roles/goldfish.md` §6, `roles/elephant.md` EL-05, `goldfish-task.md`, MP-02/MP-06/role matrix (commit `6b8b1c3`). Covers speed levers #1/#2/#5 from `2026-07-04-pipeline-durchsatz-speed.md`; levers #3/#4 deferred. A follow-up item — bringing the Goldfish-implementor frontmatter (`effort: max`) in line with `xhigh` — was completed 2026-07-05 (wave 2, M6, commit `886db4f`). ADR formalization is phase 2.

## Phase 2 Supersession (2026-07-13)

The light profile remains an opt-in **ceremony-only** reduction: its compact report, inlined references, omitted pre-edit baseline, evidence duty, stop conditions, and high-risk/architecture/guardrail/security exclusion remain in force.

The blanket `xhigh` rule is no longer current. MP-27 assigns effort by the selected execution tier: `goldfish-mechanic=low`, `goldfish-implementor=medium`, and `goldfish-deep=xhigh`. Light dispatches may use only the mechanic or implementor route; deep work is outside the light-profile boundary. The provider-neutral authority and runner projection gate enforce the current matrix. Historical text below remains decision provenance, not executable routing policy.

## Consequences

**Positive:** Faster, cheaper runs for mechanical/tier-0 tasks; effort parity between Elephant and Goldfish reduces overthinking overhead on standard dispatches.

**Negative:** Two effort regimes (light profile vs. standard) widen the calibration surface in briefings.

**Risk:** The light profile could be mis-selected for high-risk/guardrail work — explicitly excluded ("never for high-risk/guardrails"); GF-08/GF-07 remain in place as safeguards regardless.

## Rejected alternatives

- **Keep `max` as the general Goldfish default** — rejected in favor of `xhigh` (parity with E16, speed lever).
- **Open the light profile to high-risk/guardrail work too** — explicitly excluded.

## Follow-up

None scheduled; speed levers #3/#4 remain deferred (out of scope for this decision).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0022: Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default

> Agent-Pipeline v0.1.0-draft · Sprint 1 · Stand 2026-07-06

**Status:** historisch akzeptiert (2026-07-05); Effort-Regel seit 2026-07-13 durch MP-27 ersetzt · **Grundlage:** Register E22

## Kontext

Speed-Tuning identifizierte mehrere Hebel; zwei davon betreffen den Goldfish direkt — ein leichtgewichtiges Dispatch-Profil für Stufe-0-/Mechanik-Aufgaben und ein genereller Effort-Default in Parität zur Elephant-Kalibrierung (Register E16, [ADR-0006](0006-model-effort-policy.md)).

## Entscheidung (E22, wortgetreu)

> Light-Dispatch-Profil + Goldfish-`xhigh`-Standard-Default (the PO 2026-07-05, Tuning-Session): (a) Opt-in `Profil: light` für Stufe-0-/Mechanik-Dispatches — kompakter 3-Feld-Report, Referenz-Inlining, kein Pre-Edit-Baseline-verify, Effort `xhigh`; **GF-08-Evidenz + GF-07-Stops unangetastet; NIE für Klasse hoch/Guardrails**. (b) **`xhigh` wird der generelle Goldfish-Standard-Default** (Parität zur E16-Elephant-Kalibrierung): `max` nur groß/komplex/Guardrail, `high` nur trivial/gleichförmig. Umgesetzt: operating-model §3.3, roles/goldfish.md §6, roles/elephant.md EL-05, goldfish-task.md, MP-02/MP-06/Rollen-Matrix (Commit `6b8b1c3`). Speed-Hebel #1/#2/#5 aus `2026-07-04-pipeline-durchsatz-speed.md`; #3/#4 vertagt. **Offen:** Goldfish-Implementor-Frontmatter (`effort: max`) auf `xhigh` nachziehen (Retro P1) — **erledigt 2026-07-05 (Welle 2, M6, Commit `886db4f`)**. ADR-Formalisierung Phase 2.

## Konsequenzen

**Phase-2-Nachtrag:** Das Light-Profil bleibt eine reine Zeremonieverkürzung. Die pauschale `xhigh`-Regel ist nicht mehr aktuell; maßgeblich ist MP-27 mit `mechanic=low`, `implementor=medium`, `deep=xhigh`. Deep-Arbeit fällt nicht unter das Light-Profil. Evidence-, Stop- und Risikoausschlüsse bleiben unverändert.

**Positiv:** Schnellere, günstigere Durchläufe für mechanische/Stufe-0-Aufgaben; Effort-Parität zwischen Elephant und Goldfish reduziert Overthinking-Overhead bei Standard-Dispatches.

**Negativ:** Zwei Effort-Regimes (Light-Profil vs. Standard) erhöhen die Kalibrierungs-Oberfläche im Briefing.

**Risiko:** Das Light-Profil könnte fälschlich für Klasse-hoch-/Guardrail-Arbeit gewählt werden — ausdrücklich ausgeschlossen („NIE für Klasse hoch/Guardrails"); GF-08/GF-07 bleiben als Sicherung unangetastet.

## Verworfene Alternativen

- **`max` als genereller Goldfish-Default beibehalten** — verworfen zugunsten von `xhigh` (Parität zu E16, Speed-Hebel).
- **Light-Profil auch für Klasse hoch/Guardrails öffnen** — ausdrücklich ausgeschlossen.

## Wiedervorlage

Keine terminiert; Speed-Hebel #3/#4 bleiben vertagt (nicht Bestandteil dieser Entscheidung).
