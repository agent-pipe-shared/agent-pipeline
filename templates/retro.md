<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Block/session retro — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: docs/operating-model.md §7 (feedback loop: mandatory question,
maturity metrics, growth rule, three-artifact archive), §3.2 step 11,
policies/model-policy.md MP-20 (telemetry line), tooling-policy G1 (rule → artifact).
Language note (ADR-0011): template structure/instructions in English; FILLED
content in the project's human-facing language (default English).

USAGE
1. Produced at block/session close as part of the /close ritual (until the skill
   ships: filled manually). Destination: the block's HISTORY.md entry (sections
   1–4 map into the entry) — no separate retro file archive needed; the retro IS
   part of the journal.
2. Fill in the project's human-facing language (default English). Delete this
   comment block.

HARD RULES (checkable)
- The mandatory question (section 1) MUST be answered: a concrete item OR a
  deliberate "nothing". Silence is not an option.
  Why: the lessons loop is the only cross-session learning mechanism; without
  the forced answer it silts up (operating-model §7).
  Check: close report contains the answered question; empty section = ritual failed.
- Every lesson MUST carry an escalation decision (section 3, column "Escalation").
  Why: a lesson without a landing artifact evaporates — the growth rule requires
  each rule-shaped lesson to change CLAUDE.md/hook/skill/ADR (G1 assignment).
  Check: the named artifact was actually changed in the same or next commit,
  or a backlog item exists.
- Metrics (section 2) come from the telemetry lines of this block (MP-20,
  `telemetry/costs.md`), not from memory.
  Check: telemetry rows for this block exist; numbers match.
═══════════════════════════════════════════════════════════════════════════
-->

# Retro — {{PROJECT_NAME}} · {{SESSION_OR_BLOCK_ID}} · {{YYYY-MM-DD}}

## 1. Elephant Retro (written by the session Elephant itself, operating-model §7)

Guiding question (verbatim): **"What should the Pipeline do better next time?"**

> Session Elephant's answer: {{CONCRETE_ITEM or deliberate "nothing" — silence is not an option.}}

the PO is NOT surveyed for this — his own observations reach the Pipeline separately, through his own channel.

If there is an item: adopted into the Pipeline backlog as a `workflow-improvement`, or transferred to the Pipeline Elephant?
{{yes → BACKLOG_ITEM_REF / no → rationale}}

## 2. Maturity Metrics (from this block's telemetry/costs.md, MP-20)

| Metric | Value | Trend/Note |
|---|---|---|
| First-pass rate (Goldfish submissions without a rework cycle) | {{n of m}} | {{if falling: debug the harness first, P1}} |
| Look-away (interventions needed per dispatch) | {{n of m without intervention}} | {{if rising: briefings are improving}} |
| Total rework cycles | {{NUMBER}} | {{>2 per task = was this an escalation case?}} |
| Notable events (MP-05/MP-07 escalations, cache, fallbacks) | {{SHORT_NOTE or —}} | |

## 3. Lessons → Escalation Path

Path per lesson (tooling-policy G1): **Fact/convention** → CLAUDE.md (numbered
constraint, with manifestation date) · **Deterministically enforceable** → Hook/
Permission · **Procedure** → Skill · **Policy decision** → ADR (+ register
at Pipeline level) · **Pipeline way of working** → `workflow-improvement` item.

| Lesson (1–2 sentences, concrete) | Trigger (task/finding) | Escalation (artifact + ref) |
|---|---|---|
| {{LESSON_1}} | {{TRIGGER}} | {{e.g. "CLAUDE.md constraint 14 (manifested {{DATE}})" / "ADR-NNNN" / "backlog/NNN"}} |
| {{LESSON_2}} | {{...}} | {{...}} |

## 4. Closing Checks (part of the Close ritual)

- [ ] Three-artifact archive done from rigor level 1 up: spec/problem statement ·
      acceptance criteria · result/close report (NO chat logs — §7).
- [ ] Handover file updated (merge-close gate, §6).
- [ ] CLAUDE.md length gate green ({{LIMIT}} lines).
- [ ] Telemetry line(s) written (MP-20).
- [ ] Memory mirror consistent with the repo (conflict → repo wins).
- [ ] Did I actually read the diffs, or just rubber-stamp the Critic verdicts?
      (preserve reading ability; "just rubber-stamped" → log as a lesson in section 3)
- [ ] Auto-compaction during this block? {{no / yes → process failure: "why was
      the cut missed?" as a lesson in section 3}}
