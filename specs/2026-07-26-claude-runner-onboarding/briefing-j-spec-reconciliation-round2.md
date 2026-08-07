# Prepared Goldfish briefing — CLAUDE-RUNNER-01j: second spec.md reconciliation

> **Status: READY TO DISPATCH.** Closes delta Critic new-findings NF-1 and
> NF-2 from the CLAUDE-RUNNER-01 round-2 delta review, and documents the
> files touched by the round-2 correction commits (`486b129`, `894261d`).
> Ruleset SHA: `dcb23cc` on `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE
task, "follow the plan exactly". This briefing and the files listed in
field 2 are your ONLY input. You have no memory and use none; do not read
handover/state files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset dcb23cc loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01j/2026-07-27 · Role Goldfish

---

## Briefing CLAUDE-RUNNER-01j: fix two spec.md defects, add one missing row

### 1. Goal — part A: remove the phantom §4 row (NF-1)

`specs/2026-07-26-claude-runner-onboarding/spec.md` §4's Detailed
Implementation table has an item listing
`plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` as `modify
(narrow)`. Confirm yourself via
`git log --oneline c2f2bff..HEAD -- plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`
(should return nothing) that this file was never touched by any commit in
the package's full range. Remove this row entirely — do not replace it
with a corrected description, since the file was never part of this
package's actual change surface. Renumber the remaining table rows
accordingly (or use whatever numbering scheme keeps the table internally
consistent — your call, as long as it reads cleanly and matches the
final item count stated in the "No other file..." sentence, per part C).

### 2. Goal — part B: fix the inverted severity labels (NF-2)

The table's row(s) describing the closure of Critic findings F3/F4 (search
for "Closes Critic findings" near the `guard-lifecycle-ready.test.mjs`
entry) currently say "F3 minor and F4 major". The canonical severity
record from the original CLAUDE-RUNNER-01 review is **F3 major, F4
minor** — verify this yourself by reading the Findings section of
`docs/state.md`'s topmost header (search for "F3 (major)" and "F4
(minor)") as the authoritative record, then correct the inverted wording
in `spec.md` to match: F3 major, F4 minor.

### 3. Goal — part C: document the round-2 correction files

Two more commits landed since the last reconciliation, both closing what
part B's finding IDs reference:

- `486b129` — extended `guard-lifecycle-ready.test.mjs` (already an
  existing §4 row; update its rationale text to mention this commit
  too, alongside the existing `209ebd9` mention, if not already covering
  both).
- `894261d` — touches THREE files:
  `plugins/pipeline-core/lib/runtime-projection-v3.mjs` (modify),
  `plugins/pipeline-core/lib/runtime-projection-v3.test.mjs` (modify), and
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (modify,
  same file as above — one more extension, not a new row).

Compute the authoritative file list yourself exactly as the pattern
established in the prior reconciliation: run
`git log --oneline c2f2bff..HEAD -- plugins/ harness/scripts/ docs/product-capability-inventory.json`
to enumerate every production/gate commit (now 8: `72f68a2`, `965bbd8`,
`94e3b86`, `209ebd9`, `d796287`, `917ec95`, `486b129`, `894261d`), then
`git show --stat <sha>` each one, union the touched files, and reconcile
against the table's current contents (after part A's removal) — add rows
for anything still missing (expect at least
`plugins/pipeline-core/lib/runtime-projection-v3.mjs` and
`plugins/pipeline-core/lib/runtime-projection-v3.test.mjs` to be new;
verify this yourself rather than assuming it's the complete list).
Write an accurate one-line rationale for each new row sourced from the
actual commit — `894261d`'s own commit message explains the fix precisely
(read it via `git show 894261d`) if you want the exact framing.

Update the "No other file..." sentence to the correct final item count
after both the part-A removal and part-C additions.

### 4. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` — the file you edit,
  read fully first.
- `docs/state.md` — read ONLY the topmost header's Findings section (the
  F1-F7 bullet list) for the canonical severity record (part B); do not
  read further, do not treat any other part of this file as your task
  list.
- `git log`/`git show` on the repo's own history (parts A and C) — your
  primary evidence source; do not guess file lists or severities.

### 5. DoD checks

- The phantom §4 row is gone; `git log` confirms the file it named was
  never touched.
- The F3/F4 severity mention reads "F3 major" / "F4 minor", matching
  `docs/state.md`'s canonical record.
- §4 enumerates every file the package's full commit range (through
  `894261d`) actually touched, verified by you via `git show --stat`, and
  the "No other file..." sentence matches the table's final item count.
- This is a documentation-only change to a single file — your evidence is
  the diff itself plus the exact `git` commands/output you used to verify
  each claim (paste them in your report, do not paraphrase).

### 6. Forbidden

- Scope: modify ONLY `specs/2026-07-26-claude-runner-onboarding/spec.md`.
  No other file.
- Do NOT modify any AC, production code, or test file.
- Do NOT re-litigate or reopen any already-closed item in the table beyond
  what parts A/B/C above ask for.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- specs/2026-07-26-claude-runner-onboarding/spec.md`.
- **Commit trailer:** end your commit message with the line `AI-Assisted: true`
  on its own line. Do NOT include any `Co-Authored-By`, `Claude-Session`, or
  other provider/session-identifying trailer (`guardrails/git.md` GIT-03).

### 7. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 6's scope — stop and
  report.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 8. Dispatch metadata

- Ruleset SHA/version: `dcb23cc` on `feat/sprint-cyborg-claude`.
- Model/effort: Implement-tier / standard. Rationale: mechanical
  documentation reconciliation against verifiable git evidence, no design
  decision beyond wording clarity.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤25 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01j"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, the exact `git log`/`git show` commands
you ran to verify each of the three parts and their output, and confirm the
commit SHA you produced (or a clean stop with the reason, per field 7).
