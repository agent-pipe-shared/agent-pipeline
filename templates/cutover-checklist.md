<!--
═══════════════════════════════════════════════════════════════════════════
TEMPLATE: Project cutover checklist — Agent-Pipeline v0.1.0-draft
Source of truth: lessons distilled from a real project cutover migration;
consolidates what would otherwise be patched into each project dossier
divergently.
Language: English (agent-facing artifact, ADR-0011).

USAGE
1. This is a STANDING checklist, not a per-project file: read it alongside
   any project's `docs/migration/<project>-dossier.md` during cutover
   execution — the dossier carries the project-specific migration plan and
   step sequence, this file carries the cross-project gates/traps that
   apply regardless of project (a project's own migration dossier should
   point here: "cutover execution follows templates/cutover-checklist.md").
2. Blocks 1–3 and 5 apply to every cutover; block 4 (sparse-worktree traps)
   applies specifically to projects with a sparse/cone checkout (Unreal /
   large-repo layouts).
═══════════════════════════════════════════════════════════════════════════
-->

# Cutover checklist — project migration to the Agent-Pipeline

> Cross-project gates and traps distilled from a real project cutover
> migration. Use alongside the project's own migration dossier, which
> carries the step-by-step plan; this file carries what applies regardless
> of project.

## Block 1 — Guard-config armed-gate

- A **committed** `.claude/guard-config.json` is NOT automatically **armed**.
  The guard union loads it via `CLAUDE_PROJECT_DIR || cwd` — a config that
  merely exists in the repo, on a checkout the running session does not
  host, does nothing.
- **Standard gate before declaring the guard-config step done:**
  1. Confirm the config file is present in the **session-hosting checkout**
     (not only pushed upstream).
  2. Run a **live probe in harmless form**: e.g.
     `rm -r <project>-critic-probe-no-such-file` — this MUST be blocked. A
     probe that passes silently means the config is not armed.
- Reference: an earlier project cutover established these as three binding
  conditions — generalize that pattern rather than re-deriving it per project.

## Block 2 — Auto-mode classifier gates (expected steps, not incidents)

Plan for these three classifier behaviors as **expected** cutover steps —
none of them is a bug, and none of them is fixable by better prompting:

- **(a) Guard-registration edits to `.claude/settings.json` are blocked as
  self-modification.** Resolution pattern that works: explicit PO go-ahead
  → auto-mode briefly OFF → Elephant edits the settings under PO live
  review → docs/commit handled again by a goldfish dispatch → the commit
  body carries an explicit authorship split (who wrote what). A project's
  cutover briefing should name this pattern up front rather than
  discovering it mid-migration.
- **(b) Merging a guardrail-retirement PR is blocked as self-approval**
  until an explicit PO review/consensus is present in context. This is a
  desired harness layer, not a defect — plan a PO-review step before any
  such merge, don't route around the block.
- **(c) Classifier coverage is TOOL-dependent, not action-dependent.** An
  IDENTICAL `settings.json` edit was blocked via a Bash heredoc but allowed
  via the Edit tool. Risk analyses for a cutover step must
  account for this — "the classifier will catch it" depends on which tool
  performs the edit, not only on what the edit does.

## Block 3 — Dossier preflight (read-before-write on server state)

- Before any migration step that touches server-side settings/state
  (branch-protection rulesets, repo settings, existing guard configs,
  etc.), read the CURRENT server state first — do not assume the
  dossier's snapshot is still accurate.
- A real cutover hit an existing ruleset that had been created after the
  dossier's snapshot was taken, causing a goldfish stop that cost a full
  cycle. Standardize read-before-write on server settings as a briefing
  step, not an afterthought.

## Block 4 — Sparse-worktree gates (large/sparse checkouts)

- **UBT/build-stub false-green:** cone-sparse checkouts always materialize
  root files. A `.uproject` without a materialized `Source/` directory lets
  UBT build a temporary stub target ("Creating temporary `.Target.cs`
  files", result: Succeeded) — a green build that proves nothing. Verify
  wrappers need a **source-gate + stub-marker detection** — a critic review
  caught exactly this false-green in practice.
- **gitignore negation under an excluded directory is structurally dead:**
  `!/docs/state.md` nested under an excluded `/docs/` pattern never fires.
  Correct form: exclude with `/docs/*`, then negate the specific file.
  Check this whenever a project declares `handover: docs/state.md` but has
  not yet created the file — the negation trap surfaces exactly at
  creation time.
- **Grep proofs in sparse worktrees must run as `git grep <ref>`** (walks
  the full tree via git's object store), never as filesystem grep (which
  only sees the materialized subset of a cone-sparse checkout and can
  silently produce false negatives).

## Block 5 — CLAUDE.md advisory line

- Cutover adds the bootstrap advisory line to the project's `CLAUDE.md`
  ("run `/pipeline-core:pipeline-start` first", ADR-0010 anchoring 2).
- The `SessionStart` hook shipped by the plugin remains the PRIMARY
  mechanism (it fires automatically); the CLAUDE.md advisory line is the
  documented FALLBACK for sessions where the hook is inactive or the
  plugin is not yet installed — cutover should not skip it just because
  the hook already covers the common case.
