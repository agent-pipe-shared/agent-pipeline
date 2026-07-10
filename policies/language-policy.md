# Language Policy — Pointer File

> Agent-Pipeline v0.1.0-draft · Sprint 0 · 2026-07-03 · Language: English (agent-facing pointer; the normative decision document is German, per its own rule).

**Normative source: [ADR-0011 — Language Policy](../docs/adr/0011-language-policy.md).** This file only satisfies the kickoff structure requirement (`policies/language-policy.md`, DoD item 4) and points there — it defines nothing of its own.

## The rule in short (informative — ADR-0011 wins on any divergence)

- **German** — human-facing docs: everything the PO reads, reviews, and approves (operating model, ADRs, policies prose, reviews, migration dossiers, management summaries, backlog item prose, commit messages).
- **English** — agent-facing artifacts: everything an agent loads at runtime or produces in a standardized form (templates, skills, prompts, agent/skill/hook frontmatter, CLAUDE.md files).
- **Primary-reader rule** for mixed cases: an artifact follows the language of its primary reader; template structures and field names stay English, filled-in content follows the primary reader.

## Why an ADR instead of a full policy document (recorded deviation)

The kickoff structure sketch lists `language-policy.md` as a policy file. The language rule is a **one-time foundational decision without operative rule IDs, thresholds, or enforcement mechanics** — exactly what an ADR is for, unlike the model/tooling policies with their versioned rule sets (MP-xx, W/R/G-xx). It therefore lives as ADR-0011; this pointer file closes the structural gap without duplicating content (single source, no copy-paste inheritance — anti-pattern AP1).

## Verification

Language assignment of new artifacts is Critic hunt category 10 (`plugins/pipeline-core/skills/critic-review/SKILL.md` §4; ADR-0014/ADR-0015).
