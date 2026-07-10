# ADR-0007: Dynamic Workflows / Ultracode as Per-Task Opt-in with Hard Write Preconditions

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E7 + condition A2

## Context

Dynamic Workflows orchestrate up to 16 parallel / 1,000 agents; multi-agent costs roughly 15× the tokens, and per Anthropic "most coding tasks" are the worst fit for it. Safety-critical: workflow subagents ALWAYS run under `acceptEdits` and inherit the tool allowlist — permission modes (`plan`/`ask`) do not apply there, only PreToolUse hook denies hold. The PO revised the initially restrictive research proposal to a low-threshold opt-in (good experience in the indication domains); the cp1 review flagged the safety precondition lost in that revision as major (L2-02) → condition A2 = this ADR.

## Decision (E7, verbatim)

> **Ultracode/Workflows (PO-revised):** low-threshold per-task opt-in (indication list: initial research, process models, audits, migrations); calibration run only recommended; precondition for write-capable use: hook guardrails + tight Bash allowlist + worktree (`acceptEdits`!)

Refinement (condition A2):

- Opt-in via the keyword `ultracode` per task; not session-persistent (no `/effort ultracode`). Indication list per Decision 5: initial research, process-model/architecture exploration, audits, migrations.
- Preconditions for WRITE-capable workflows — all three, hard: (1) git-guard hook union installed (hook layer also holds under `acceptEdits`; [ADR-0013](0013-git-guard-union.md)), (2) tight session Bash allowlist, (3) worktree.
- **`<PROJECT_B>` special rule:** until the guard migration is complete, write-capable workflows in `<PROJECT_B>` run only with explicit PO approval (high stakes: real devices).
- Calibration run (small slice) recommended for novel, large workflows — not a mandatory gate.

## Consequences

**Positive:** low threshold where workflows are demonstrably strong; the protection sits at the one layer `acceptEdits` cannot bypass (hooks).

**Negative:** token cost "substantially higher" than normal sessions — visible via cost telemetry ([ADR-0006](0006-model-effort-policy.md)).

**Risk:** misclassifying read-only vs. write-capable bypasses the preconditions. OPEN (Phase 4): deterministic enforcement of the precondition check (e.g. in the workflow-start building block).

## Rejected alternatives

- **Restrictive exception regime (research proposal: mandatory calibration run, narrow purposes)** — revised by PO decision; the friction would be disproportionate to the demonstrated benefit in the indication domains.
- **Session-wide `/effort ultracode` or workflows as default** — permanently high token cost, some launch prompts would be skipped; contradicts "use multi-agent sparingly."
- **Prohibition** — forfeits demonstrated benefit for research, audits, migrations.

## Follow-up

The `<PROJECT_B>` special rule lapses once the guard migration in `<PROJECT_B>` is complete (Sprint 1; dossier in Phase 4).

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0007: Dynamic Workflows / Ultracode als Task-Opt-in mit harten Schreib-Vorbedingungen

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E7 + Auflage A2

## Kontext

Dynamic Workflows orchestrieren bis 16 parallele / 1.000 Agents; Multi-Agent kostet ~15× Tokens, und „most coding tasks" sind laut Anthropic der schlechteste Fit. Sicherheitskritisch: Workflow-Subagents laufen IMMER in `acceptEdits` und erben die Tool-Allowlist — Permission-Modi (`plan`/`ask`) greifen dort nicht, nur PreToolUse-Hook-Denies halten. Der PO hat den restriktiven Recherche-Vorschlag zum niedrigschwelligen Opt-in revidiert (gute Erfahrungen in den Indikations-Domänen); das cp1-Review reklamierte die dabei verlorene Sicherheitsvorbedingung als major (L2-02) → Auflage A2 = dieses ADR.

## Entscheidung (E7, wortgetreu)

> **Ultracode/Workflows (PO revidiert):** niedrigschwelliger Task-Opt-in (Indikationsliste: initiale Recherchen, Vorgehensmodelle, Audits, Migrationen); Kalibrierlauf nur empfohlen; Vorbedingung für Schreibendes: Hook-Guardrails + enge Bash-Allowlist + Worktree (acceptEdits!)

Präzisierung (Auflage A2):

- Opt-in per Keyword `ultracode` pro Task; nicht session-dauerhaft (kein `/effort ultracode`). Indikationsliste gemäß Entscheidung 5: initiale Recherchen, Vorgehensmodell-/Architektur-Exploration, Audits, Migrationen.
- Vorbedingungen für SCHREIBENDE Workflows — alle drei, hart: (1) git-guard-Union installiert (Hook-Ebene wirkt auch in `acceptEdits`; [ADR-0013](0013-git-guard-union.md)), (2) enge Bash-Allowlist der Session, (3) Worktree.
- **<PROJECT_B>-Sonderregel:** Bis zur abgeschlossenen Guard-Migration laufen schreibende Workflows in <PROJECT_B> nur mit expliziter PO-Freigabe (hohe Stakes: reale Geräte).
- Kalibrierlauf (Small Slice) bei neuartigen großen Workflows empfohlen, keine Pflicht-Hürde.

## Konsequenzen

**Positiv:** niedrige Schwelle dort, wo Workflows belegt stark sind; der Schutz liegt auf der einzigen Ebene, die `acceptEdits` nicht aushebeln kann (Hooks).

**Negativ:** Token-Kosten „substanziell höher" als normale Sessions — sichtbar über die Kosten-Telemetrie ([ADR-0006](0006-model-effort-policy.md)).

**Risiko:** Fehlklassifikation read-only vs. schreibend umgeht die Vorbedingungen. OFFEN (Phase 4): deterministische Absicherung des Vorbedingungs-Checks (z. B. im Workflow-Start-Baustein).

## Verworfene Alternativen

- **Restriktives Ausnahme-Regime (Recherche-Vorschlag: Pflicht-Kalibrierlauf, enge Zwecke)** — durch PO-Entscheid revidiert; die Reibung stünde in den Indikations-Domänen in keinem Verhältnis zum belegten Nutzen.
- **Session-weites `/effort ultracode` oder Workflows als Default** — dauerhaft hohe Token-Kosten, Launch-Prompts entfallen teils; widerspricht „Multi-Agent sparsam einsetzen".
- **Verbot** — verschenkt belegten Nutzen bei Recherchen, Audits, Migrationen.

## Wiedervorlage

<PROJECT_B>-Sonderregel entfällt mit abgeschlossener Guard-Migration in <PROJECT_B> (Sprint 1; Dossier in Phase 4).
