<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project CLAUDE.md skeleton — Agent-Pipeline v0.1.0-draft
Source of truth: docs/operating-model.md §5/§6/§7/§8, ADR-0011 (language).
Motivating anti-pattern: a real project's CLAUDE.md grew to 578 lines
against its own "keep it lean" rule.
Language: English (agent-facing artifact, ADR-0011).

USAGE
1. Copy this file to the project repo root as CLAUDE.md.
2. Replace every {{PLACEHOLDER}}. Delete this comment block and all guidance comments.
3. Keep every numbered block below — they are mandatory. Add nothing from the
   "Forbidden content" list (see block 6).

HARD RULES FOR THE RESULTING FILE (checkable)
- MUST stay under {{CLAUDE_MD_MAX_LINES}} lines (default 200; the authoritative
  number lives in `.claude/pipeline.json` → `claudeMdMaxLines`).
  Why: CLAUDE.md is loaded into EVERY session; growth taxes every session start
  (a real project's CLAUDE.md reached 578 lines / >40k tokens).
  Check: `(Get-Content CLAUDE.md | Measure-Object -Line).Lines` — length gate in
  the close ritual (operating-model §6); merge is blocked while the gate is red.
- MUST NOT contain history, current-state prose, or roadmap prose (block 6).
  Why: three hand-maintained state copies demonstrably lied.
  Check: drift check in the close ritual; the only state pointer is the
  handover-file reference in block 3.
- MUST NOT contain secrets or absolute paths (two machines, different paths).
  Check: secret-hygiene step in the close ritual; grep for `[A-Z]:\\` and `/home/`.
═══════════════════════════════════════════════════════════════════════════
-->

# {{PROJECT_NAME}} — Agent Context

> Run the pipeline bootstrap first: `/pipeline-core:pipeline-start` (fallback if
> the skill is unknown: `templates/prompts/session-bootstrap-check.md` from the
> Agent-Pipeline repo — an unknown skill means the plugin is missing).

<!-- Block 1 — Stack & conventions. MUST be ≤ 10 lines. Facts only: what a fresh
     agent needs to not break idiom. No tutorials, no history. -->
## Stack & conventions (10-line map)

- Stack: {{STACK_SUMMARY e.g. "Next.js 15 / TypeScript / Prisma / pnpm"}}
- Layout: {{KEY_DIRECTORIES e.g. "app/ routes · lib/ domain · prisma/ schema"}}
- Conventions: {{CORE_CONVENTIONS e.g. "named exports; server components by default"}}
- Test/build: {{TOOLCHAIN_FACTS e.g. "vitest; pnpm build must pass before push"}}
- Language: code/comments English; commits + human docs German (ADR-0011).
- {{OPTIONAL_FACT_LINES — delete unused lines; never exceed 10 total}}

<!-- Block 2 — Pipeline binding. Declares which rule set governs this repo. -->
## Pipeline binding

- Operating model: plugin `pipeline-core` from marketplace `agent-pipeline`
  (binding committed in `.claude/settings.json`: `extraKnownMarketplaces` +
  `enabledPlugins`). Roles, rituals, review rules come from the plugin — they are
  NOT restated here (no copy-paste inheritance).
- Project calibration: `.claude/pipeline.json` — verify command, autonomy level,
  branch model, worktree rule, WIP limit, stakes, risk zones, ritual extensions
  (schema format: JSON; canonical example:
  `templates/pipeline.json.example` in the agent-pipeline repo).
- Permissions/denies: committed `.claude/settings.json` (+ git-guard config).
  Denies do NOT live in pipeline.json (operating-model §8).
- Single verify gate: `{{VERIFY_COMMAND e.g. "pnpm verify"}}` — the ONE command
  behind evidence duty. If it is red, nothing is done.

<!-- Block 3 — Handover. THE only state pointer allowed in this file. -->
## Session handover

- Current state, open items, and next block live ONLY in
  `{{HANDOVER_FILE default: docs/state.md}}` (single versioned handover source).
- MUST: read it at session start (bootstrap step 4); update it before session end
  and after every merge (merge-completion gate, operating-model §6).
- MUST NOT: duplicate its content anywhere — HISTORY is append-only past;
  memory is a mirror only (repo wins on contradiction).

<!-- Block 4 — Numbered constraints. The project's "do not revert" rules. -->
## Constraints (numbered — do not revert)

Semantics: each constraint is a hard project rule earned from a real failure or
decision. Format per entry: rule + one-line why + manifestation date (when the
failure/decision manifested) + optional ADR/HISTORY reference. Constraints are
never silently deleted or weakened — changing one requires the PO's approval and
a note in the handover file.

1. {{CONSTRAINT_1 e.g. "Never edit generated client code under gen/ — regenerate
   instead. Why: manual edits were overwritten and lost. (Manifested {{DATE}};
   see {{ADR_OR_HISTORY_REF}}.)"}}
2. {{CONSTRAINT_2}}
<!-- Add constraints only via the growth rule in block 5. Renumber never;
     retired constraints keep their number with status "(retired {{DATE}}: reason)". -->

<!-- Block 5 — Growth rule. How this file learns. -->
## Growth rule

- MUST: every agent misstep that traces back to a missing or vague rule becomes a
  new/sharpened rule in the RESPONSIBLE artifact — deterministic things go to
  hooks/permissions, facts and conventions to this file, procedures to skills
  (tooling-policy G1). Record the trigger in the session's Lehren entry.
  Why: the lessons loop is the only cross-session learning mechanism
  (operating-model §7). Check: each Lehren entry names the changed rule/artifact.
- Counterweight: growing toward the line limit forces consolidation — merge,
  move to hooks/skills, or delete. The length gate stays green; "add a rule"
  never justifies breaking it.

<!-- Block 6 — Forbidden content. The legacy anti-pattern list. -->
## Forbidden content in this file

- NO history / session logs / "what we did" prose → belongs in `HISTORY.md`.
- NO current-state or "next step" prose → belongs in the handover file (block 3).
- NO roadmap prose or milestone planning → belongs in `{{ROADMAP_FILE default: docs/roadmap.md}}`.
- NO full procedure walkthroughs → belong in skills (loaded on demand).
- NO secrets, tokens, private URLs, absolute paths.

Why: this file is paid for in every session; a real project's CLAUDE.md became a
578-line context dump against its own "keep it lean" rule.
Check: close-ritual drift check + length gate; a Critic flags violations on any
diff touching this file (guardrail-relevant → risk class high, operating-model §4.2).

<!-- Block 7 — Doc map. Where knowledge lands. One line per file. -->
## Doc map (knowledge lands in the responsible file)

| File | Owns |
|---|---|
| `{{HANDOVER_FILE}}` | current state, open items, next block (single source) |
| `HISTORY.md` | append-only session journal with mandatory Lehren block |
| `{{ROADMAP_FILE}}` | intent: now/next/later (no status, no log) |
| `docs/adr/` | decisions with rationale (never rewritten, only superseded) |
| `{{PROJECT_DOC_1 e.g. "docs/ARCHITECTURE.md"}}` | {{RESPONSIBILITY}} |
