# ADR-0003: Role implementation — Goldfish as subagent, Critic read-only with a `--bare` tier

> _A German version follows below · Eine deutsche Fassung folgt weiter unten._

Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · as of 2026-07-03

**Status:** accepted (2026-07-03, Checkpoint 1) · **Basis:** Register E3

## Context

Roles map onto native Claude Code primitives: subagents get their own context window and system prompt — only the delegation prompt goes in, only the summary comes back. Fresh reviewer context is officially motivated (no bias from code just written). Mechanical limit: custom subagents auto-load CLAUDE.md + git status, non-disableable; the strict reading "sees ONLY spec + diff + guardrails" is only delivered by a separate `claude -p --bare` run. `memory` auto-enables Read/Write/Edit.

## Decision (E3, historical record)

> Goldfish = custom subagent (no `memory`); Critic = read-only subagent, `--bare` tier for critical diffs

Detail:

- **Goldfish:** custom subagent (plugin `agents/`), narrow `tools` set, `maxTurns`, worktree per [ADR-0008](0008-permissions-worktree-policy.md), NO `memory`.
- **Critic, standard tier:** read-only subagent (`tools: Read, Grep, Glob` + tightly scoped Bash for `git diff`/`git log`), NO `memory`.
- **Critic, harder tier:** separate `claude -p --bare` run with `--json-schema` — skips all auto-discovery (incl. CLAUDE.md), reproducible, machine-readable verdict. Historical trigger wording from 2026-07-03 (matched the then-current `operating-model.md` §4.2/§3.3 and [ADR-0014](0014-critic-contract.md); the current normative policy is the runner-native amendment below): "Every architecture/guardrail/security diff runs with Critic Fable 5 / `max` AND additionally in `--bare` isolation. Rigor level 2 makes the Critic mandatory (default: Sonnet 5 / `max`); Fable 5 / `max` applies there only when the risk class is additionally high OR an architecture/guardrail/security diff is present."

**Deliberately accepted trade-off (CLAUDE.md autoload):** the standard Critic sees CLAUDE.md + git status — full input isolation only holds at the `--bare` tier. Day to day, in-session pragmatism wins (findings directly usable, low friction); on critical diffs, the isolation guarantee wins.

### Amendment — runner-native functional equivalent (PO decision 2026-07-17)

The decision text above records the original Claude-specific primitive and
remains historical evidence; it is not a Claude-CLI-only requirement for a
multi-runner pipeline. The effective T1 policy supersedes only that operational
mechanism, not its rigor, evidence, independence, staffing, or disposition
requirements.

> "Every architecture/guardrail/security diff runs with the Critic on the higher-capability tier AND with the selected runner's usable native isolation; if that isolation is technically unavailable or unusable in the current host setup, the standing PO-authorized functional equivalent is ONE fresh independently briefed, contractually read-only Critic subagent with a JSON-schema-shaped verdict and the literal assurance `functional-equivalent-read-only; OS isolation not asserted`. Rigor level 2 makes the Critic mandatory (default: the review-tier model); escalation to the higher-capability tier applies there only when, in addition, the risk class is high OR an architecture/guardrail/security diff is present."

For T1, retain the selected runner and use its usable native isolation first.
`claude -p --bare` remains the Claude runner adapter. If the selected runner's
native isolation is technically unavailable or unusable in the current host,
the standing PO authorization permits exactly one fresh independently briefed
Critic subagent with no chat/history or implementer reasoning, refs-only bounded
input, strict read-only/no-write/no-subdelegation instruction, fixed candidate
commit and diff, higher-capability route, and a JSON-schema-shaped verdict. The
assurance literal above is mandatory and never asserts OS isolation or effective
model identity. If that runner cannot provide even this contractual review,
stop at a PO course gate; do not silently substitute another runner.

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

<!-- DE-REFERENCE-BELOW | agents: skip everything below this line; it is a full German reference translation (redundant, wastes context). The English text is the source version; both language versions preserve the current runner-native amendment. Convention: CLAUDE.md (Language). -->

# ADR-0003: Rollen-Implementierung — Goldfish als Subagent, Critic read-only mit `--bare`-Stufe

> Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 2 · Stand 2026-07-03

**Status:** akzeptiert (2026-07-03, Checkpoint 1) · **Grundlage:** Register E3

## Kontext

Die Rollen mappen auf native Claude-Code-Primitives: Subagents haben ein eigenes Kontextfenster und einen eigenen System-Prompt; nur der Delegations-Prompt geht rein, nur die Summary kommt zurück. Frischer Reviewer-Kontext ist offiziell begründet — kein Bias auf eben geschriebenen Code. Grenze der Mechanik: Custom Subagents laden CLAUDE.md + Git-Status automatisch und nicht abschaltbar; die strikte Lesart „sieht NUR Spec + Diff + Guardrails" liefert nur ein separater `claude -p --bare`-Lauf. `memory` aktiviert automatisch Read/Write/Edit.

## Entscheidung (E3, historische Fassung)

> Goldfish = Custom Subagent (kein `memory`); Critic = read-only Subagent, `--bare`-Stufe für kritische Diffs

Präzisierung:

- **Goldfish:** Custom Subagent (Plugin-`agents/`), enges `tools`-Set, `maxTurns`, Worktree gemäß [ADR-0008](0008-permissions-worktree-policy.md), KEIN `memory`.
- **Critic, Standardstufe:** read-only Subagent (`tools: Read, Grep, Glob` + eng begrenztes Bash für `git diff`/`git log`), KEIN `memory`.
- **Critic, härtere Stufe:** separater `claude -p --bare`-Lauf mit `--json-schema` — überspringt jede Auto-Discovery (inkl. CLAUDE.md), reproduzierbar, maschinenlesbares Verdikt. Historischer Trigger-Wortlaut vom 2026-07-03 (entsprach damals `operating-model.md` §4.2/§3.3 und [ADR-0014](0014-critic-contract.md); die aktuelle normative Policy steht in der runner-nativen Ergänzung unten): „Jeder Architektur-/Guardrail-/Security-Diff läuft mit Critic Fable 5 / `max` UND zusätzlich in `--bare`-Isolation. Rigor-Stufe 2 macht den Critic zur Pflicht (Standard: Sonnet 5 / `max`); Fable 5 / `max` gilt dort nur, wenn zusätzlich die Risikoklasse hoch ist ODER ein Architektur-/Guardrail-/Security-Diff vorliegt."

**Bewusst akzeptierter Trade-off (CLAUDE.md-Autoload):** Der Standard-Critic sieht CLAUDE.md + Git-Status — die volle Input-Isolation gilt erst auf der `--bare`-Stufe. Im Alltag gewinnt In-Session-Pragmatik (Findings direkt verwertbar, geringe Reibung); bei kritischen Diffs gewinnt die Isolationsgarantie.

### Ergänzung — runner-native funktionale Entsprechung (PO-Entscheid 2026-07-17)

Der Entscheidungstext oben dokumentiert das ursprüngliche Claude-spezifische
Primitive und bleibt historische Evidenz; er ist keine nur für die Claude-CLI
geltende Pflicht einer Multi-Runner-Pipeline. Die wirksame T1-Policy ersetzt
nur diesen operativen Mechanismus, nicht dessen Strenge sowie Evidenz-,
Unabhängigkeits-, Staffing- oder Dispositionspflichten.

> „Jeder Architektur-/Guardrail-/Security-Diff läuft mit dem Critic auf dem höheren Capability-Tier UND mit der nutzbaren nativen Isolation des ausgewählten Runners; ist diese Isolation im aktuellen Host-Setup technisch nicht verfügbar oder nicht nutzbar, ist die stehende PO-autorisierte funktionale Entsprechung GENAU EIN frisch und unabhängig gebriefter, vertraglich read-only Critic-Subagent mit schemaförmigem JSON-Verdikt und dem wörtlichen Assurance-Literal `functional-equivalent-read-only; OS isolation not asserted`. Rigor-Stufe 2 macht den Critic zur Pflicht (Standard: Review-Tier-Modell); die Eskalation auf das höhere Capability-Tier gilt dort nur, wenn zusätzlich die Risikoklasse hoch ist ODER ein Architektur-/Guardrail-/Security-Diff vorliegt."

Für T1 bleibt der ausgewählte Runner erhalten und nutzt zuerst seine nutzbare
native Isolation. `claude -p --bare` bleibt der Adapter des Claude-Runners.
Ist die native Isolation des ausgewählten Runners im aktuellen Host technisch
nicht verfügbar oder nicht nutzbar, erlaubt die stehende PO-Autorisierung genau
einen frisch und unabhängig gebrieften Critic-Subagent ohne Chat/History oder
Implementierer-Reasoning, mit begrenzter Refs-only-Eingabe, strikter
Read-only/No-write/No-subdelegation-Anweisung, festem Kandidatencommit und Diff,
einer Route auf höherem Capability-Tier und schemaförmigem JSON-Verdikt. Das Assurance-Literal oben
ist Pflicht und behauptet weder OS-Isolation noch Effective-Model-Identity. Kann
dieser Runner nicht einmal diesen vertraglichen Review liefern, stoppt die Arbeit
an einem PO-Kurs-Gate; ein anderer Runner wird nicht still eingesetzt.

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
