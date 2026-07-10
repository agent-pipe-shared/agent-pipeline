---
type: {{workflow-improvement|tooling-radar|defect|idea}}
status: new
created: {{YYYY-MM-DD}}
source: {{origin — retro question / radar run / critic finding / manual observation, with a concrete reference (file, ADR, session date)}}
due: {{OPTIONAL — YYYY-MM-DD, only for time-triggered items such as ADR resubmissions; delete this line entirely if not applicable}}
---

<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Backlog item — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: backlog/README.md (types, status lifecycle, triage rules),
docs/operating-model.md §7 (feedback loop), policies/tooling-policy.md §4
(tooling-radar contract R1–R5).
Language note (ADR-0011): frontmatter field NAMES and this instruction block
are English (agent-facing/structural). Filled-in CONTENT is now also English
for this shared template — single-language scaffolding.

USAGE
1. Copy this file to backlog/items/YYYY-MM-DD-short-english-slug.md
   (date = created, not a due date).
2. Fill every {{PLACEHOLDER}} in the frontmatter above and the sections below.
   Delete the `due:` line entirely if the item has no time trigger.
3. Leave `status: new` and the Triage section empty — both are filled by the
   Elephant of the next Pipeline session (backlog/README.md, triage rules).
   An item never deletes itself out of the backlog; rejected/deferred items
   stay with their reasoning attached.
4. Delete this comment block once the item is filled in.
═══════════════════════════════════════════════════════════════════════════
-->

# {{Short, specific title — not a category name}}

## Description

{{What is this about? 2–5 sentences: situation, problem, or opportunity.}}

## Triggering situation

{{What triggered this item — a retro question, a radar run, a Critic finding, a concrete session/task? Reference concretely (file, ADR number, date).}}

## Affected artifact

{{Which Pipeline rule/file does this touch — ADR number, policy section, guardrail, skill, template? "none yet" is acceptable for purely conceptual ideas.}}

## Proposal

{{Concrete proposal, if available. Optional for `idea` items — an unrefined idea without a finished proposal is a valid item.}}

## Triage (filled in by the Elephant of the next Pipeline session)

- **Decision:** {{accepted | deferred | rejected | merged-into-<filename>}}
- **Rationale:** {{mandatory for rejected/deferred; optional for accepted}}
- **Assignment (if accepted):** {{phase/release}}
- **Date:**
