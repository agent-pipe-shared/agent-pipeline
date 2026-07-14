# Language Policy — Pointer File

**Normative source: [ADR-0011 — Language Policy](../docs/adr/0011-language-policy.md).** This file only satisfies the kickoff structure requirement (`policies/language-policy.md`, DoD item 4) and points there — it defines nothing of its own.

## Authority in short (informative — ADR-0011 wins on any divergence)

- **English** is canonical for the public core and all agent-facing artifacts.
- The four public front doors named by ADR-0011 may retain an explicitly marked
  German reader aid; their English content remains authoritative.
- A private overlay may configure its operator-/PO-facing language under the
  primary-reader rule. That configuration is not part of the shared public canon.

## Why an ADR instead of a full policy document (recorded deviation)

The kickoff structure sketch lists `language-policy.md` as a policy file. The language rule is a **one-time foundational decision without operative rule IDs, thresholds, or enforcement mechanics** — exactly what an ADR is for, unlike the model/tooling policies with their versioned rule sets (MP-xx, W/R/G-xx). It therefore lives as ADR-0011; this pointer file closes the structural gap without duplicating content (single source, no copy-paste inheritance — anti-pattern AP1).

## Verification

Language assignment of new artifacts is Critic hunt category 10 (`plugins/pipeline-core/skills/critic-review/SKILL.md` §4; ADR-0014/ADR-0015).
