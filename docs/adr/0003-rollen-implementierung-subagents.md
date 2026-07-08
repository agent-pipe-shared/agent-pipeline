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
- **Critic, härtere Stufe:** separater `claude -p --bare`-Lauf mit `--json-schema` — überspringt jede Auto-Discovery (inkl. CLAUDE.md), reproduzierbar, maschinenlesbares Verdikt. Trigger (kanonischer Wortlaut, wortgleich mit operating-model.md §4.2/§3.3 und [ADR-0014](0014-critic-kontrakt.md)): „Jeder Architektur-/Guardrail-/Security-Diff läuft mit Critic Fable 5 / `max` UND zusätzlich in `--bare`-Isolation. Rigor-Stufe 2 macht den Critic zur Pflicht (Standard: Sonnet 5 / `max`); Fable 5 / `max` gilt dort nur, wenn zusätzlich die Risikoklasse hoch ist ODER ein Architektur-/Guardrail-/Security-Diff vorliegt."

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
