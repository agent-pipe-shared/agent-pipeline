# Neutral findings registry — rework cycle, round 1 (candidate `2c867ea9`)

Fix-verification input for the round-2 delta dispatch. Factual finding
statements only; no verdict prose, no fix narrative.

| ID | Severity | Finding (factual) |
|---|---|---|
| F1 | major | `design/agent-first-architecture.md` §3.1 concept-file frontmatter row claims the #104 §2 field list "verbatim" while omitting "compatibility and lifecycle expectations" (present at §2.2 of the same document and at `evidence/issues-snapshot-2026-08-27.md:543`). |
| F2 | major | The eleven #104 contract-sufficiency signals (`evidence/issues-snapshot-2026-08-27.md:672-686`), audited `missing` by `design/gap-analysis-2026-08-28.md`, are enumerated in neither reworked document, and the §D integration map contains no entry routing them into `spec.md`. Weaker same-pattern instance: the #106 §Scope-2 eleven-item fitness-model representation list is routed by issue pointer rather than absorbed. |
| F3 | minor | `design/gap-analysis-2026-08-28.md` asserts "snapshot verified current — no issue changed since 2026-08-11" with no supporting artifact anywhere in the package (the snapshot carries no `updatedAt` field; `design-authoring-record.json` records no currency check). |
| F4 | minor | Commit `2c867ea9` carries `AI-Assisted: true` but no `Dispatch:` trailer (`templates/prompts/agent-obligations.md` §6 names two forms; `dispatch-authorship-verify` reports trailer-less commits `UNVERIFIABLE`). The five preceding branch commits are likewise trailer-less. |
| F5 | minor | `design/agent-first-architecture.md` §3.3 uses the unglossed German term `"wiederfinden"` in an English-canonical agent-facing artifact (ADR-0011). |
