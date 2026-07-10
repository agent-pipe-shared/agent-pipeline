# ADR-0007: Dynamic Workflows / Ultracode als Task-Opt-in mit harten Schreib-Vorbedingungen

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

**In brief (English):** This ADR makes "ultracode" (Dynamic Workflows / multi-agent orchestration, up to 16 parallel agents) a per-task opt-in — not a session-wide setting — restricted to an indication list (initial research, process/architecture exploration, audits, migrations). Because workflow subagents always run under `acceptEdits`, where permission modes like `plan`/`ask` don't apply, any *write*-capable workflow is hard-gated on three preconditions: the git-guard hook union (ADR-0013), a tight Bash allowlist, and a worktree — since hooks are the only enforcement layer `acceptEdits` cannot bypass. Status: accepted 2026-07-03, recorded as Register E7 with Auflage (condition) A2, after review flagged that an earlier, more permissive revision had dropped this safety precondition.

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

**Negativ:** Token-Kosten „substanziell höher" als normale Sessions — sichtbar über die Kosten-Telemetrie ([ADR-0006](0006-modell-effort-policy.md)).

**Risiko:** Fehlklassifikation read-only vs. schreibend umgeht die Vorbedingungen. OFFEN (Phase 4): deterministische Absicherung des Vorbedingungs-Checks (z. B. im Workflow-Start-Baustein).

## Verworfene Alternativen

- **Restriktives Ausnahme-Regime (Recherche-Vorschlag: Pflicht-Kalibrierlauf, enge Zwecke)** — durch PO-Entscheid revidiert; die Reibung stünde in den Indikations-Domänen in keinem Verhältnis zum belegten Nutzen.
- **Session-weites `/effort ultracode` oder Workflows als Default** — dauerhaft hohe Token-Kosten, Launch-Prompts entfallen teils; widerspricht „Multi-Agent sparsam einsetzen".
- **Verbot** — verschenkt belegten Nutzen bei Recherchen, Audits, Migrationen.

## Wiedervorlage

<PROJECT_B>-Sonderregel entfällt mit abgeschlossener Guard-Migration in <PROJECT_B> (Sprint 1; Dossier in Phase 4).
