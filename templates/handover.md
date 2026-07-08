<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project Handover (`docs/state.md`) — Agent-Pipeline v0.1.0-draft
Source of truth: ADR-0012 (handover canonicalization). This file is the
central per-project handover template referenced by `.claude/pipeline.json`
→ `handover` (default `docs/state.md`).
Language: this TEMPLATE is English (agent-facing, ADR-0011 — templates/ is
listed as agent-facing). Every INSTANCE (a project's actual `docs/state.md`)
is written in German, per project convention and ADR-0011's primary-reader
rule (the PO is the primary human reader of a project's handover; treat the
section structure below as inspiration, not a schema to copy verbatim). Keep the German section headers below verbatim in
instances — do not translate them back to English.

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

# {{PROJECT_NAME}} — Stand

> Zweck: Persistenter Handover-Stand des Projekts — einzige maßgebliche Stand-Quelle (ADR-0012). Wird nach jedem Block/jeder Session aktualisiert. HISTORY.md bleibt Log, kein zweiter Stand-Ort; Memory ist nur Spiegel.

**Letzte Aktualisierung:** {{YYYY-MM-DD, ggf. + Tageszeit-Kürzel bei mehreren Updates/Tag}} · **Aktueller Block/Session:** {{Block-/Sitzungsname oder -ID}} · **Modell-Setup:** {{aktives Modell + Effort dieser Session, z. B. "Implement-Tier-Modell / high"; Abweichungen von der projektüblichen Kalibrierung kurz begründen}}

{{1–3 Sätze Klartext: was gerade läuft oder gerade fertig wurde. Kein Ersatz für die Tabelle unten — nur Orientierung auf den ersten Blick.}}

## Status

> Jede Zeile = ein laufendes oder kürzlich abgeschlossenes Arbeitspaket. Marker: ✅ fertig · 🟡 Human-Verifikation ausstehend (blockt laut "🟡-Merge v2" NICHT den Merge, zählt aber weiter gegen das WIP-Limit) · 🔄 läuft. **Rollback-Anker ist Pflichtfeld bei 🟡** — Form je `branchModel` siehe Kopf-Kommentar.

| # | Arbeitspaket | Status | Rollback-Anker | Bemerkung |
|---|---|---|---|---|
| 1 | {{Kurzbezeichnung}} | {{✅ / 🟡 / 🔄}} | {{Tag `rollback/<date>-<block>` \| "Rollback-Anker: <sha>" \| "Pre-Merge-SHA: <merge-sha>^1" \| "–" wenn kein 🟡}} | {{kurz}} |

## Nächste Schritte

{{Nummerierte, konkrete nächste Schritte — kein Backlog-Reprint, nur was unmittelbar ansteht.}}

1. {{Schritt}}

## Entscheidungen seit letztem Gate

{{Was wurde seit dem letzten the PO-Gate/Checkpoint entschieden — Datum, Entscheidung, kurze Begründung (1–2 Sätze). Nur was noch nicht in ADRs/Entscheidungsregister formalisiert ist; sonst verlinken statt duplizieren.}}

- {{YYYY-MM-DD}}: {{Entscheidung + Begründung}}

## Umgebung & Toolchain

> Achtung: Pfade und Toolchain-Details sind maschinenspezifisch (dieses Projekt läuft ggf. auf mehreren Rechnern mit unterschiedlichen Pfaden). Nie einen einzelnen Maschinen-Pfad zentral (CLAUDE.md, guardrails, Prompts) hardcoden — hier je Maschine führen, bei Maschinenwechsel neu verifizieren statt annehmen.

| Tool/Pfad | {{Maschine 1, z. B. Laptop}} | {{Maschine 2, z. B. Haupt-PC}} | Status |
|---|---|---|---|
| Repo-Pfad | {{Pfad}} | {{Pfad}} | {{✓ / ⚠}} |
| {{weitere Einträge nach Bedarf: git/gh/lfs-Version, `verify`-Kommando-Abhängigkeiten, Credential-Store}} | | | |

## Offene Fragen an the PO

{{Nummerierte Liste offener Entscheidungsfragen, die nur the PO klären kann. "– keine –" wenn nichts offen ist — nicht künstlich auffüllen.}}

1. {{Frage}}