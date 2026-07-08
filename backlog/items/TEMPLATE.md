---
type: {{workflow-improvement|tooling-radar|defect|idea}}
status: new
created: {{YYYY-MM-DD}}
source: {{origin — retro question / radar run / critic finding / manual observation, with a concrete reference (file, ADR, session date)}}
due: {{OPTIONAL — YYYY-MM-DD, only for time-triggered items such as ADR-Wiedervorlagen; delete this line entirely if not applicable}}
---

<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Backlog item — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: backlog/README.md (types, status lifecycle, triage rules),
docs/operating-model.md §7 (feedback loop), policies/tooling-policy.md §4
(tooling-radar contract R1–R5).
Language note (ADR-0011): frontmatter field NAMES and this instruction block
are English (agent-facing/structural). Filled-in CONTENT is German — backlog
item prose is explicitly named human-facing in this project's language rule.

USAGE
1. Copy this file to backlog/items/YYYY-MM-DD-kurzer-deutscher-slug.md
   (date = created, not a due date).
2. Fill every {{PLACEHOLDER}} in the frontmatter above and the sections below.
   Delete the `due:` line entirely if the item has no time trigger.
3. Leave `status: new` and the Triage section empty — both are filled by the
   Elephant of the next Pipeline session (backlog/README.md, Triage-Regeln).
   An item never deletes itself out of the backlog; rejected/deferred items
   stay with their reasoning attached.
4. Delete this comment block once the item is filled in.
═══════════════════════════════════════════════════════════════════════════
-->

# {{Short, specific title — not a category name}}

## Beschreibung

{{Worum geht es? 2–5 Sätze: Situation, Problem oder Chance.}}

## Auslösende Situation

{{Was hat dieses Item ausgelöst — eine Retro-Frage, ein Radar-Lauf, ein Critic-Befund, eine konkrete Session/Aufgabe? Konkret referenzieren (Datei, ADR-Nummer, Datum).}}

## Betroffenes Artefakt

{{Welche Pipeline-Regel/-Datei berührt das — ADR-Nummer, Policy-Abschnitt, Guardrail, Skill, Template? "noch keins" ist zulässig bei rein konzeptionellen Ideen.}}

## Vorschlag

{{Konkreter Vorschlag, falls vorhanden. Bei `idea`-Items optional — eine unausgereifte Idee ohne fertigen Vorschlag ist ein gültiges Item.}}

## Triage (wird vom Elephant der nächsten Pipeline-Session ausgefüllt)

- **Entscheidung:** {{accepted | deferred | rejected | merged-into-<dateiname>}}
- **Begründung:** {{Pflicht bei rejected/deferred; optional bei accepted}}
- **Zuordnung (falls accepted):** {{Phase/Release}}
- **Datum:**
