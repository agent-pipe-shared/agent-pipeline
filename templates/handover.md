<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project Handover (`docs/state.md`) — Agent-Pipeline v0.1.0-draft
Source of truth: ADR-0012 (handover canonicalization). This file is the
central per-project handover template referenced by `.claude/pipeline.json`
→ `handover` (default `docs/state.md`).
Language: this TEMPLATE is English (agent-facing, ADR-0011 — templates/ is
listed as agent-facing). Every INSTANCE (a project's actual `docs/state.md`)
is written in the project's human-facing language — English by default
for this share — per ADR-0011's primary-reader rule (the PO is the primary
human reader of a project's handover; treat the section structure below as
inspiration, not a schema to copy verbatim). If a project's primary human
reader works in a different language, translate the section headers below
consistently and keep them stable across the project's handover history —
do not swap languages mid-project.

USAGE
1. Copy this file to `docs/state.md` in the target project repo (path fixed
   by ADR-0012 and by the project's `.claude/pipeline.json` → `handover`
   field; do not rename or relocate without updating both).
2. Replace every {{PLACEHOLDER}}, delete this comment block.
3. This file is the ONLY canonical stand-source (ADR-0012). HISTORY.md stays
   an append-only log and must never hand-maintain an "open items" block of
   its own — it references this file instead. Memory is a mirror only:
   every session must be fully workable from a fresh clone without it.
4. Keep it lean — a handover file is a POINTER, not an archive. Move
   anything that isn't "what's the state / what's next / what's open" out
   to ADRs, backlog items, or research docs, and link instead of inlining.
   The project's CLAUDE.md "Stand" section shrinks to a 3–5 line pointer
   that references this file — it does not duplicate its content.
5. Update this file at the close of every block/session (bootstrap protocol,
   operating-model §5.1/§6) — persist immediately, never rely on chat
   history: a session is a cache on the persisted artifact, not the record
   of truth.

HARD RULES (checkable)
- The Rollback-Anker column in the status table is MANDATORY on every row
  carrying an open 🟡 marker (under the "🟡-Merge v2" policy, merge is
  allowed ahead of full human verification once a rollback anchor exists;
  the 🟡 persists in this file — and keeps counting against the project's
  WIP limit — until the PO verifies; live-deploy still needs separate
  sign-off per the global rule, merging code is not the same as shipping
  it live). The anchor's FORM depends on the project's `branchModel`
  (`.claude/pipeline.json`):
    - `branchModel: direct-push+staging` (fast-forward only, no merge
      commit): a pushed TAG `rollback/<date>-<block>` on the pre-ff `main`
      SHA.
    - `branchModel: direct-main` (manual live deploy): a literal line
      "Rollback-Anker: <sha>" recorded before deploying, for every change
      that goes live ahead of complete verification.
    - `branchModel: pr-flow` (real merge commits): a literal line
      "Pre-Merge-SHA: <merge-sha>^1" recorded in this file at merge time.
  A row with an open 🟡 and no anchor in the matching form is a Critic/
  Elephant finding, not a stylistic gap.
- Drift check, run at session bootstrap: warn when BOTH hold —
  (a) the newest commit is more than 1 calendar day newer than "Letzte
  Aktualisierung" below, AND (b) the repo is more than 3 commits ahead of
  the commit this file was last updated against. One threshold for all
  projects (simplicity over per-project tuning). A warning means "refresh
  this file", not a hard block.
- Machine-specific values (local paths, credential-store entries, etc.)
  live ONLY in "Umgebung & Toolchain" below and MUST show a per-machine
  breakdown wherever they differ — never hardcode a single machine's path
  anywhere else in this file or in CLAUDE.md.
- No secrets, tokens, or credentials in this file (guardrails/security.md)
  — reference where they live, never the values.
═══════════════════════════════════════════════════════════════════════════
-->

# {{PROJECT_NAME}} — Status

> Purpose: persistent handover state for the project — the single authoritative state source (ADR-0012). Updated after every block/session. HISTORY.md stays a log, not a second state location; memory is a mirror only.

**Last updated:** {{YYYY-MM-DD, plus a time-of-day tag if multiple updates/day}} · **Current block/session:** {{block/session name or ID}} · **Model setup:** {{active model + effort for this session, e.g. "implement-tier model / high"; briefly justify any deviation from the project's usual calibration}}

{{1–3 plain-language sentences: what's running right now or just finished. Not a substitute for the table below — just orientation at a glance.}}

## Status

> Each row = one work package in progress or recently completed. Markers: ✅ done · 🟡 human verification pending (does NOT block the merge under "🟡-Merge v2", but keeps counting against the WIP limit) · 🔄 in progress. **Rollback anchor is mandatory for 🟡** — form depends on `branchModel`, see the header comment.

| # | Work package | Status | Rollback anchor | Note |
|---|---|---|---|---|
| 1 | {{short label}} | {{✅ / 🟡 / 🔄}} | {{tag `rollback/<date>-<block>` \| "Rollback-Anker: <sha>" \| "Pre-Merge-SHA: <merge-sha>^1" \| "–" if no 🟡}} | {{brief}} |

## Next steps

{{Numbered, concrete next steps — not a backlog reprint, only what's immediately ahead.}}

1. {{step}}

## Decisions since the last gate

{{What was decided since the last PO gate/checkpoint — date, decision, brief rationale (1–2 sentences). Only what isn't yet formalized in ADRs/decision register; otherwise link instead of duplicating.}}

- {{YYYY-MM-DD}}: {{decision + rationale}}

## Environment & toolchain

> Note: paths and toolchain details are machine-specific (this project may run on multiple machines with different paths). Never hardcode a single machine's path centrally (CLAUDE.md, guardrails, prompts) — track it per machine here, and re-verify rather than assume on a machine switch.

| Tool/path | {{Machine 1, e.g. laptop}} | {{Machine 2, e.g. main PC}} | Status |
|---|---|---|---|
| Repo path | {{path}} | {{path}} | {{✓ / ⚠}} |
| {{further entries as needed: git/gh/lfs version, `verify`-command dependencies, credential store}} | | | |

## Open questions for the PO

{{Numbered list of open decision questions only the PO can resolve. "– none –" if nothing is open — don't pad it artificially.}}

1. {{question}}