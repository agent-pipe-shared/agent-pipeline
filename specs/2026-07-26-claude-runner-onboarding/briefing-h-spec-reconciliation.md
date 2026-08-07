# Prepared Goldfish briefing — CLAUDE-RUNNER-01h: reconcile spec.md with what shipped

> **Status: READY TO DISPATCH.** (f) and (g) have both landed and been
> independently verified (`609b50e`, `984ebb5`) — this task now documents the
> FINAL touched-file set and diagnostic wording across the whole package.
> Closes Critic findings F5 (minor) and F6 (minor) from the CLAUDE-RUNNER-01
> review, bundled as one coherent documentation-reconciliation work package
> (GIT-02) since both are "bring spec.md in line with what shipped".
> Ruleset SHA: `99cfd9c` on `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE
task, "follow the plan exactly". This briefing and the files listed in
field 2 are your ONLY input. You have no memory and use none; do not read
handover/state files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 99cfd9c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01h/2026-07-27 · Role Goldfish

---

## Briefing CLAUDE-RUNNER-01h: bring `spec.md` in line with what shipped

### 1. Goal — part A: header status (F6)

`specs/2026-07-26-claude-runner-onboarding/spec.md`'s header table currently
reads `| Status | draft |` and
`| Readiness check | not yet run — required before first dispatch per rigor 2 |`.
Seven sub-packages have since been dispatched, landed, and independently
verified (including a Critic review) against this spec. Update both fields
to reflect reality:
- `Status`: change from `draft` to a value indicating implementation is
  complete and reconciled (your call on the exact word — check
  `templates/prompts/` or another closed spec in `specs/` for this repo's
  convention if one exists; if none is established, `implemented` is a
  reasonable plain choice).
- `Readiness check`: change from `not yet run` to reflect that dispatch
  already happened under it (e.g. state plainly that the readiness check was
  performed before first dispatch and is superseded by the now-complete
  implementation — do not fabricate a specific readiness-check artifact path
  that doesn't exist; if you cannot find one, say plainly that dispatch
  proceeded and completed without a separately filed readiness-check
  document).

### 2. Goal — part B: complete the §4 file enumeration (F6)

§4's Detailed Implementation table (originally 11 items) is followed by:
"No other file in the four investigated candidates... is touched by this
package". This is no longer accurate — implementation and its own follow-up
hardening touched additional files beyond the original 11. **Do not trust
this briefing's own list of what those are — compute it yourself and treat
it as authoritative:**

1. Run `git log --oneline 8f244fa..HEAD -- plugins/ harness/scripts/ docs/product-capability-inventory.json`
   (or equivalent) to enumerate every production/gate commit in this
   package's full history (the range starts right after the three original
   briefings a/b/c were drafted; it captures every commit that follows).
2. For each such commit, run `git show --stat <sha>` to get its exact
   touched-file list.
3. Union all touched files across all those commits. Subtract the 11 files
   already named in §4's existing table (and the four confirmed-untouched
   candidates named in the sentence right after the table — do not re-list
   those as newly touched unless your own git evidence shows otherwise).
4. For everything left in the union, add a new row to the §4 table
   (continuing the numbering from 12) with an accurate one-line rationale —
   read the actual commit(s) that touched each file to write the rationale
   truthfully, do not guess. Expect this list to include at least:
   `harness/scripts/verify.mjs` (test-suite registration),
   `docs/product-capability-inventory.json` (this repo's own self-application
   surface-coverage gate requires it to track new hooks/verify-phases this
   package introduced), and `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
   (extended coverage) — but verify this list is complete and correct
   yourself rather than assuming it; if your own git evidence finds more or
   fewer files, use what you actually found.
5. Update the "No other file..." sentence immediately after the table to
   accurately state the new total item count and that the additional items
   are hardening/self-application-gate follow-ups discovered during
   post-implementation review, not silently expanded original scope.

### 3. Goal — part C: AC-2's diagnostic wording (F5)

AC-2 (§5) reads: "...THE SYSTEM SHALL still return `status: "invalid"` with
**the existing diagnostic**..." — but the actual diagnostic message and
guidance text were intentionally changed (commit `88c8029`) from
Codex-specific wording ("the selected runner is not Codex" / "select Codex
through the source authority") to enum-appropriate wording ("the selected
runner is not one registered, enabled runner" / "select one enabled
registered runner through the source authority") — a necessary, correct
change given AC-1 turned a Codex-only check into an enum check, but the spec
text was never updated to match, so AC-2 as literally written is not
satisfiable (the "existing" diagnostic text no longer exists).

Fix: reword AC-2 to no longer claim the diagnostic text itself is unchanged
(the `status: "invalid"` outcome, the JSON path `$.source.runners.default`,
and the error code `source_invalid` ARE unchanged — those are the actual
regression-relevant invariants). Add a short explicit note (in AC-2 itself
or as a brief adjacent line) documenting the intentional wording change with
old→new text, per the level-2 spec-deviation-update rule (§6: "Spec updated
BEFORE merge on any implementation deviation"). Verify the exact old/new
strings yourself via `git show 88c8029 -- plugins/pipeline-core/lib/project-onboarding-v3.mjs`
rather than trusting this briefing's paraphrase.

### 4. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` — the file you edit,
  read fully first.
- `git log`/`git show` on the repo's own history (per parts B and C above)
  — your primary evidence source; do not guess file lists or wording diffs.
- `harness/definition-of-done.md` — read if you want to confirm this
  repo's status-vocabulary convention; not required if you find a clearer
  precedent in another closed spec under `specs/`.

### 5. DoD checks

- The header table's `Status` and `Readiness check` fields read as true
  statements about the current state of this package.
- §4's table enumerates every file this package's full commit range
  actually touched (verified by you via `git show --stat`, not assumed),
  and the "No other file..." sentence matches the table's final item count.
- AC-2 is satisfiable as written against the actual shipped diagnostic
  text (quote the real text, verified via `git show`).
- This is a documentation-only change to a single file
  (`specs/2026-07-26-claude-runner-onboarding/spec.md`) — there is no test
  to run; your evidence is the diff itself plus the exact `git`
  commands/output you used to verify each claim (paste them in your
  report, do not paraphrase).

### 6. Forbidden

- Scope: modify ONLY `specs/2026-07-26-claude-runner-onboarding/spec.md`.
  No other file.
- Do NOT modify any production code, test file, or the PRD document.
- Do NOT modify any AC other than AC-2's diagnostic-wording clause (do not
  rewrite AC-1/AC-3 through AC-9's substance — those remain accurate as
  written).
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

- Ruleset SHA/version: `99cfd9c` on `feat/sprint-cyborg-claude`.
- Model/effort: Implement-tier / standard. Rationale: mechanical
  documentation reconciliation against verifiable git evidence, no design
  decision beyond wording clarity.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤25 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01h"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, the exact `git log`/`git show` commands
you ran to verify each of the three parts and their output, and confirm the
commit SHA you produced (or a clean stop with the reason, per field 7).
