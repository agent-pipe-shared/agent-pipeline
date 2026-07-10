<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: ADR — Agent-Pipeline v0.1.0-draft · Sprint 0 Phase 3 · 2026-07-03
Source of truth: docs/adr/README.md (conventions), existing ADRs 0001–0015 (format),
operating-model §2.2 ("no silently made fundamental decisions").
Language note: this template's INSTRUCTIONS are English (agent-facing); fill the
ADR content in the project's human-facing language (default English) — ADRs are
explicitly human-facing documents ("everything the PO reads, reviews, and signs
off on"). Keep section headings consistent with the existing ADRs in docs/adr/.

USAGE
1. Next free number: NNNN = highest existing number in the target adr/ directory + 1.
   Filename: `NNNN-<kebab-slug>.md`.
2. Fill all sections in the project's human-facing language (default English).
   Delete this comment block.
3. MUST: add a row to the ADR index (`docs/adr/README.md` table; projects keep an
   equivalent index). Why: unindexed ADRs are invisible to future sessions.
   Check: index row exists in the same commit.
4. MUST: an ADR is never rewritten — it is superseded by a new ADR
   (old status becomes "superseded by NNNN"). Why: decision history must stay
   reconstructable. Check: git log shows no content
   rewrites of accepted ADRs beyond status/typo fixes.
5. MUST: quote the underlying register/decision wording verbatim where one exists
   ("Decision (verbatim, Ex)"). Why: the register is canonical on conflict.
6. If a follow-up date/trigger exists, also add it to the index's
   "Follow-ups" table.

Status vocabulary: "proposed" | "accepted (YYYY-MM-DD, <Gate>)" |
"rejected" | "superseded by NNNN".
═══════════════════════════════════════════════════════════════════════════
-->

# ADR-{{NNNN}}: {{TITLE — decision phrased as a statement, not a question}}

> {{PROJECT_OR_PIPELINE_ID e.g. "Agent-Pipeline v0.1.0-draft"}} · {{PHASE_OR_SPRINT}} · as of {{YYYY-MM-DD}}

**Status:** {{STATUS}} · **Basis:** {{REGISTER_ENTRY / MANDATE / TRIGGER with reference, e.g. "decision register entry ([state.md](../state.md))"}}

## Context

{{2–6 sentences: what forces/facts make a decision necessary? Cite evidence as
repo-relative references (findings, inventory, reviews). No solution prose.}}

## Decision

{{For a register/PO decision: verbatim quote in a blockquote, then clarification
as a list. Otherwise: the decision in 1–3 sentences, then clarification.}}

> {{VERBATIM_QUOTE_IF_AVAILABLE}}

Clarification:

- {{CLARIFICATION_1}}
- {{CLARIFICATION_2}}

## Consequences

**Positive:** {{what improves}}

**Negative:** {{what price is knowingly paid}}

**Risk:** {{residual risk + mitigation, if any}}

## Alternatives considered

- **{{ALTERNATIVE_1}}** — {{reason for rejection, 1 sentence}}
- **{{ALTERNATIVE_2}}** — {{reason for rejection, 1 sentence}}

## Follow-up

{{"None." OR date/trigger + what to check then. Also add the trigger to the
ADR index's follow-ups table.}}
