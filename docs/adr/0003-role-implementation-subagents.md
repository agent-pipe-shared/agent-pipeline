# ADR-0003: Role implementation — Goldfish as subagent, Critic read-only with a `--bare` tier

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E3

## Context

Roles map onto native Claude Code primitives: subagents get their own context window and system prompt — only the delegation prompt goes in, only the summary comes back. Fresh reviewer context is officially motivated (no bias from code just written). Mechanical limit: custom subagents auto-load CLAUDE.md + git status, non-disableable; the strict reading "sees ONLY spec + diff + guardrails" is only delivered by a separate `claude -p --bare` run. `memory` auto-enables Read/Write/Edit.

## Decision (E3, verbatim)

> Goldfish = custom subagent (no `memory`); Critic = read-only subagent, `--bare` tier for critical diffs

Detail:

- **Goldfish:** custom subagent (plugin `agents/`), narrow `tools` set, `maxTurns`, worktree per [ADR-0008](0008-permissions-worktree-policy.md), NO `memory`.
- **Critic, standard tier:** read-only subagent (`tools: Read, Grep, Glob` + tightly scoped Bash for `git diff`/`git log`), NO `memory`.
- **Critic, harder tier:** separate `claude -p --bare` run with `--json-schema` — skips all auto-discovery (incl. CLAUDE.md), reproducible, machine-readable verdict. Trigger (canonical wording, verbatim-matched to operating-model.md §4.2/§3.3 and [ADR-0014](0014-critic-contract.md)): "Every architecture/guardrail/security diff runs with Critic Fable 5 / `max` AND additionally in `--bare` isolation. Rigor level 2 makes the Critic mandatory (default: Sonnet 5 / `max`); Fable 5 / `max` applies there only when the risk class is additionally high OR an architecture/guardrail/security diff is present."

**Deliberately accepted trade-off (CLAUDE.md autoload):** the standard Critic sees CLAUDE.md + git status — full input isolation only holds at the `--bare` tier. Day to day, in-session pragmatism wins (findings directly usable, low friction); on critical diffs, the isolation guarantee wins.

## Consequences

**Positive:** no bespoke build — all roles on officially documented primitives; two-tier: everyday cheap and convenient, critical diffs maximally isolated with a machine-readable verdict.

**Negative:** the `--bare` tier needs its own auth setup (`ANTHROPIC_API_KEY`/`apiKeyHelper`) and explicit context hand-off (`--append-system-prompt`, `--settings`) — extra effort per critical review.

**Risk:** contamination of the standard Critic by CLAUDE.md content is real — accepted, documented, and bounded by the harder tier.

## Rejected alternatives

- **Skill with `context: fork` (built-in Explore/Plan)** — fully isolated, but not configurable (neither tools nor model nor system prompt).
- **`memory: project` for recurring task types** — breaks the Goldfish definition (fresh context as a feature) and any read-only guarantee; learning runs through the versioned operating model instead.
- **Always `--bare` for every Critic run** — loses in-session convenience; friction disproportionate to the isolation gain on non-critical diffs.

## Follow-up

**Agreed 2026-07-04 (U3 disposition, second-Elephant finding 9).** Status: the `--bare` tier has been **suspended** since 2026-07-04 pending wrapper delivery (three empirical headless defects; fallback path: neutral cwd + standard subagent Critic with a documented isolation deviation). **Follow-up content:** after wrapper delivery, an A/B test of subagent-Critic vs. `--bare`/neutral-cwd on an **identical prompt** (the two P4-T1 reviews as validation run) — the comparison planned in Sprint 0 never happened, so the isolation value-add of the harder tier remains **unproven**. The result decides whether the tier stays mandatory, becomes optional, or is dropped (decision: Elephant + PO gate, not silently in the radar).

**History:** Original conception: "No follow-up. Implement both Critic tiers as callable building blocks: Phase 3." Phase 3 delivered (Critic agent + skill); the `--bare` tier failed in Phase 4 on the transport mechanism, not on the concept.

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The authoritative content is the English above. Convention: CLAUDE.md (Language). -->

# ADR-0003: Rollen-Implementierung — Goldfish als Subagent, Critic read-only mit `--bare`-Stufe

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E3

## Kontext

Die Rollen mappen auf native Claude-Code-Primitives: Subagents haben ein eigenes Kontextfenster und einen eigenen System-Prompt; nur der Delegations-Prompt geht rein, nur die Summary kommt zurück. Frischer Reviewer-Kontext ist offiziell begründet — kein Bias auf eben geschriebenen Code. Grenze der Mechanik: Custom Subagents laden CLAUDE.md + Git-Status automatisch und nicht abschaltbar; die strikte Lesart „sieht NUR Spec + Diff + Guardrails" liefert nur ein separater `claude -p --bare`-Lauf. `memory` aktiviert automatisch Read/Write/Edit.

## Entscheidung (E3, wortgetreu)

> Goldfish = Custom Subagent (kein `memory`); Critic = read-only Subagent, `--bare`-Stufe für kritische Diffs

Präzisierung:

- **Goldfish:** Custom Subagent (Plugin-`agents/`), enges `tools`-Set, `maxTurns`, Worktree gemäß [ADR-0008](0008-permissions-worktree-policy.md), KEIN `memory`.
- **Critic, Standardstufe:** read-only Subagent (`tools: Read, Grep, Glob` + eng begrenztes Bash für `git diff`/`git log`), KEIN `memory`.
- **Critic, härtere Stufe:** separater `claude -p --bare`-Lauf mit `--json-schema` — überspringt jede Auto-Discovery (inkl. CLAUDE.md), reproduzierbar, maschinenlesbares Verdikt. Trigger (kanonischer Wortlaut, wortgleich mit operating-model.md §4.2/§3.3 und [ADR-0014](0014-critic-contract.md)): „Jeder Architektur-/Guardrail-/Security-Diff läuft mit Critic Fable 5 / `max` UND zusätzlich in `--bare`-Isolation. Rigor-Stufe 2 macht den Critic zur Pflicht (Standard: Sonnet 5 / `max`); Fable 5 / `max` gilt dort nur, wenn zusätzlich die Risikoklasse hoch ist ODER ein Architektur-/Guardrail-/Security-Diff vorliegt."

**Bewusst akzeptierter Trade-off (CLAUDE.md-Autoload):** Der Standard-Critic sieht CLAUDE.md + Git-Status — die volle Input-Isolation gilt erst auf der `--bare`-Stufe. Im Alltag gewinnt In-Session-Pragmatik (Findings direkt verwertbar, geringe Reibung); bei kritischen Diffs gewinnt die Isolationsgarantie.

## Konsequenzen

**Positiv:** kein Eigenbau — alle Rollen auf offiziell dokumentierten Primitives; zweistufig: Alltag günstig und bequem, kritische Diffs maximal isoliert mit maschinenlesbarem Verdikt.

**Negativ:** die `--bare`-Stufe braucht eigenes Auth-Setup (`ANTHROPIC_API_KEY`/`apiKeyHelper`) und explizite Kontext-Übergabe (`--append-system-prompt`, `--settings`) — Mehraufwand pro kritischem Review.

**Risiko:** Kontamination des Standard-Critic durch CLAUDE.md-Inhalte ist real — akzeptiert, dokumentiert und durch die härtere Stufe begrenzt.

## Verworfene Alternativen

- **Skill mit `context: fork` (Built-ins Explore/Plan)** — voll isoliert, aber nicht konfigurierbar (weder Tools noch Modell noch System-Prompt).
- **`memory: project` für wiederkehrende Task-Typen** — bricht die Goldfish-Definition (frischer Kontext als Feature) und jede Read-only-Garantie; Lernen läuft über das versionierte Operating Model.
- **Immer `--bare` für jeden Critic-Lauf** — verliert den In-Session-Komfort; Reibung im Alltag unverhältnismäßig zum Isolationsgewinn bei unkritischen Diffs.

## Wiedervorlage

**Vereinbart 2026-07-04 (Ü3-Disposition, Zweit-Elephant-Befund 9).** Stand: Die `--bare`-Stufe ist seit 2026-07-04 bis zur Wrapper-Lieferung **ausgesetzt** (drei empirische Headless-Defekte; Ersatzpfad Neutral-cwd + Standard-Subagent-Critic mit dokumentierter Isolations-Abweichung). **Wiedervorlage-Inhalt:** Nach Wrapper-Lieferung ein A/B-Test Subagent-Critic vs. `--bare`/Neutral-cwd bei **identischem Prompt** (die beiden P4-T1-Reviews als Validierungslauf) — der in Sprint 0 geplante Vergleich kam nie zustande, der Isolations-Mehrwert der härteren Stufe ist damit weiterhin **unbewiesen**. Das Ergebnis entscheidet, ob die Stufe Pflicht bleibt, optional wird oder entfällt (Entscheid: Elephant + PO-Gate, nicht still im Radar).

*Historie: Erstfassung „Keine [Wiedervorlage]. Implementierung beider Critic-Stufen als aufrufbare Bausteine: Phase 3." — Phase 3 hat geliefert (Critic-Agent + Skill); die `--bare`-Stufe scheiterte in Phase 4 am Transportweg, nicht am Konzept.*
