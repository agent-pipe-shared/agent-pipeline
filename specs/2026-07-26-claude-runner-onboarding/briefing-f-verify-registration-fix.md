# Prepared Goldfish briefing — CLAUDE-RUNNER-01f: register v3-bootstrap-authority.test.mjs in the aggregate verify gate

> **Status: READY TO DISPATCH.** Closes Critic finding F2 (major) from the
> CLAUDE-RUNNER-01 review. Ruleset SHA: `24f5c04` on
> `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 24f5c04 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01f/2026-07-27 · Role Goldfish

---

## Briefing CLAUDE-RUNNER-01f: close a gate-registration gap

### 1. Goal

`plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` is a net-new
test file (12 checks) that is currently the ONLY test coverage protecting
`plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`. It is never
registered in `harness/scripts/verify.mjs`'s `TEST_SUITES` array, so the
project's own aggregate gate (`node harness/scripts/verify.mjs`) never runs
it — a regression in that file could land and pass full verify green.

Two coordinated edits are required (this repo's own self-application gate,
HAW-A01, will otherwise reject one without the other — verify this yourself,
don't take it on faith):

1. **`harness/scripts/verify.mjs`**: add one entry to the `TEST_SUITES`
   array:
   ```js
   { name: "v3-bootstrap-authority-tests", file: join(pluginScriptsDir, "v3-bootstrap-authority.test.mjs") },
   ```
   Place it near the other onboarding-v4-family entries (after the
   `codex-onboarding-app-server-tests` line, before
   `project-onboarding-e2e-tests`, is a reasonable position — read the
   surrounding ~30 lines yourself to confirm `pluginScriptsDir` is already in
   scope and pick the placement that reads cleanest; exact position is not
   load-bearing, only that the entry exists and the name is unique).

2. **`docs/product-capability-inventory.json`**: the addition above creates a
   new discovered `verify-phase` surface
   (`verify-phase:harness/scripts/verify.mjs:v3-bootstrap-authority-tests`)
   that the self-application gate (`check-product-capability-inventory.mjs`,
   HAW-A01) will require the inventory to cover exactly. Add this surface to
   the existing `"id": "deterministic-verification"` capability's
   `surfaceIds` array, in its sorted position (the array is a long list of
   `verify-phase:harness/scripts/verify.mjs:...` entries already sorted by
   UTF-8 byte comparison — insert accordingly). Do not touch any other field
   of that capability, and do not touch any other capability.

Confirm the gap and the fix independently: run
`node --test harness/scripts/check-product-capability-inventory.test.mjs`
BEFORE any edit (it should currently pass, since the gap doesn't exist yet —
this briefing's own edit to `verify.mjs` is what CREATES the gap that step 2
then closes) and AFTER both edits (must pass again).

### 2. Context files

- `harness/scripts/verify.mjs` — read the `TEST_SUITES` array and the
  `pluginScriptsDir`/`libDir`/`hooksDir` constant definitions near the top of
  the file.
- `docs/product-capability-inventory.json` — read the
  `"id": "deterministic-verification"` capability entry fully, and a handful
  of neighboring `verify-phase:...` surfaceIds entries, to match the file's
  exact sorted-array convention.
- `harness/scripts/check-product-capability-inventory.mjs` — read
  `verifyMembers()` (how it derives verify-phase surfaces from
  `TEST_SUITES`) if you want to understand the mechanism, not required to
  make the edit.
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` — confirm
  it exists and exports nothing unusual that would make a bare
  `node --test <file>` invocation behave differently from the other
  registered suites (it should not — same self-contained pattern).

### 3. DoD checks

- `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
  exits 0 (12/12) — confirms the file itself is unaffected by your edit (you
  are not touching it).
- `node --test harness/scripts/check-product-capability-inventory.test.mjs`
  exits 0 (14/14) after BOTH edits land.
- `node harness/scripts/verify.mjs` is NOT required of you in full (a later,
  dedicated aggregate step) — but confirm your new `TEST_SUITES` entry is
  syntactically well-formed and doesn't crash the script by running
  `node harness/scripts/verify.mjs --help` or equivalent lightweight smoke
  (your call on the cheapest reliable confirmation; do not run the full
  ~10-minute aggregate suite yourself).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY `harness/scripts/verify.mjs` and
  `docs/product-capability-inventory.json`. No other file.
- Do NOT modify `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`
  or its test file.
- Do NOT modify `harness/scripts/check-product-capability-inventory.mjs` or
  its test file.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- harness/scripts/verify.mjs docs/product-capability-inventory.json`
  (both files, one commit — this is one coherent work package per GIT-02).
- **Commit trailer:** end your commit message with the line `AI-Assisted: true`
  on its own line. Do NOT include any `Co-Authored-By`, `Claude-Session`, or
  other provider/session-identifying trailer — this repo's guardrail
  (`guardrails/git.md` GIT-03) forbids it.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure state.
- The task requires touching a file outside field 4's scope — stop and report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `24f5c04` on `feat/sprint-cyborg-claude`.
- Model/effort: Implement-tier / standard. Rationale: mechanical,
  narrowly-scoped registration addition with a deterministic test oracle.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤20 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01f"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, the exact test commands you ran and their
exit codes, and confirm the commit SHA you produced (or a clean stop with the
reason, per field 5).
