# Prepared Goldfish briefing — CLAUDE-RUNNER-01g2: complete the interrupted lifecycle-ready hardening

> **Status: READY TO DISPATCH.** Closes Critic findings F3 (major) and F4
> (minor) from the CLAUDE-RUNNER-01 review — same goals as the original
> `briefing-g-lifecycle-ready-hardening.md`. That dispatch was cut off
> mid-task by a session-limit/API outage (external, not a task failure)
> after doing substantial, mostly-correct work, which is **sitting
> uncommitted in the working tree right now.** This briefing's job is to
> finish it: verify what's there, fix two known bugs in the unfinished part,
> confirm the DoD, and commit. Ruleset SHA: `609b50e` on
> `feat/sprint-cyborg-claude` (2026-07-27, unchanged since the interrupted
> attempt — no other commits landed in between).
> **Worktree: no** — run directly in the main checkout, exactly where the
> uncommitted changes already live.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE
task, "follow the plan exactly". This briefing and the files listed in
field 2 are your ONLY input. You have no memory and use none; do not read
handover/state files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 609b50e loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01g2/2026-07-27 · Role Goldfish

**Before anything else:** run `git status --porcelain`. You should see
exactly two modified files:
`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and
`plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`. This is
expected and correct — it is the prior interrupted attempt's uncommitted
work, not stray/foreign state. Run `git diff --
plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs
plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` and read the
full diff before doing anything else. If this precondition doesn't hold
(tree is clean, or different files are modified), stop and report — do not
guess or improvise around a mismatched starting state.

---

## Briefing CLAUDE-RUNNER-01g2: verify, fix, and land the uncommitted diff

### 1. Goal — part A: verify the F4 fix (should already be complete and correct)

The uncommitted diff to `guard-lifecycle-ready.mjs` replaces the module-scope
`GOVERNANCE_MARKERS` constant (which eagerly called
`loadRuntimeProjectionV3OwnedKeys()` at import time — a throw there crashed
the whole module before `main()`'s own try/catch could run, and node's exit 1
means "allow + config warning" per `hooks.json`'s own exit-semantics comment,
silently disarming this fail-closed gate) with a lazy, memoized
`resolveGovernanceMarkers(dependencies)` function, invoked only from inside
`evaluateLifecycleReadyGuard`'s existing try/catch (which already returns
`blocked()` on any exception). Read this change fully and independently judge
whether it's correct: does the module now load successfully regardless of
whether the owned-key manifest is readable/parseable/well-shaped, and does an
unresolvable manifest result in a blocked (exit 2) verdict rather than a
crash (exit 1)? The accompanying two new tests in the `.test.mjs` diff (search
for `F4 (Critic review CLAUDE-RUNNER-01)`) already appear to pass — confirm
this yourself by running them (see field 5), don't take it on faith.

### 2. Goal — part B: fix two bugs in the new F3 test, then verify

The diff also adds a new test, `"the registered hook process allows a
genuinely ready Claude project through the real readiness chain"` (search for
`F3 (Critic review CLAUDE-RUNNER-01)`), built around a new `claudeReadyRoot()`
helper. As left by the interrupted attempt, this test **does not pass** —
two concrete bugs, diagnosed already, need fixing:

1. **`claudeReadyRoot()` pre-initializes Git before calling `plan --root
   path`.** `project-onboarding-v3.mjs`'s legacy-root inspection classifies a
   root with 0 entries as `"fresh"` (→ `plan` returns
   `"portable-seed-required"`), but a root that already contains a `.git`
   entry falls through to `"existing-unmanaged"` (→ `plan` returns
   `"adoption-required"` instead) — see
   `plugins/pipeline-core/lib/project-onboarding-v3.mjs` around line 365
   (`entries.length === 0` → `"fresh"`) and line 403 (`"existing-unmanaged"`).
   `apply-portable-seed --activate` already runs `git init
   --initial-branch=main` itself when needed (same file, ~line 1475-1478,
   gated on `state.initializesGit`) — this is also the exact pattern already
   used successfully in `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs`
   (no explicit `git init` before the first `plan` call). Fix: remove the
   explicit `git init` block at the top of `claudeReadyRoot()` and let
   `apply-portable-seed --activate` initialize Git.
2. **`MIGRATION_SCRIPT` is referenced (in `claudeReadyRoot()`, the
   `runner-profile-migration-v3.mjs` `apply` call) but never defined.** The
   file already defines `ONBOARDING_SCRIPT`,
   `ONBOARDING_LAUNCH_SCRIPT`, `START_PREFLIGHT_SCRIPT`, and
   `HOST_REPOSITORY_INIT_SCRIPT` near the top via
   `fileURLToPath(new URL("../scripts/<name>.mjs", import.meta.url))`. Add an
   analogous `MIGRATION_SCRIPT` constant pointing at
   `../scripts/runner-profile-migration-v3.mjs` (confirm that file exists and
   exposes an `apply --initialize-missing-runtime --activate` CLI surface
   before wiring it in — it does, per this repo's existing usage elsewhere,
   but verify yourself).

After both fixes, re-run the test file. You should observe the fixture now
gets much further (through `plan`/`apply-portable-seed`/the `pipeline.user.yaml`
runner-selection edit/`runner-profile-migration-v3 apply`/`kickoff plan`) and
then fail at `kickoff apply` with a runtime error surfaced as
`KICKOFF-PRIVATE-UNAVAILABLE: private onboarding state is unavailable`.

### 3. Goal — part C: diagnose whether that remaining failure is a genuine environment limitation — do NOT paper over it

**This is the important judgment call in this briefing — investigate it
properly, don't just trust this paragraph.** The generic
`KICKOFF-PRIVATE-UNAVAILABLE` message is produced by a catch-all wrapper
(`resolvePrivate()` in `plugins/pipeline-core/lib/onboarding-continuity.mjs`,
~line 258-271) that swallows whatever `resolveOnboardingPrivateState()`
(`plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`) actually threw.
Trace the real cause yourself (e.g. call
`resolveOnboardingPrivateState(root, "local", { create: true })` directly in
a throwaway script against a fixture root at the same point in the sequence,
or add temporary instrumentation and remove it before committing) — you
should find it bottoms out in `ensurePrivateDirectory()`
(`codex-onboarding-runtime.mjs` ~line 119-131), which requires the created
private-state directory to have literal POSIX mode `0o700` (`(mode & 0o777)
!== 0o700` throws), even after an explicit `chmodSync` attempt.

If your own investigation confirms this: on Windows/NTFS, `chmodSync` cannot
actually restrict a directory to `0o700` the way POSIX permission bits work,
so `lstatSync(...).mode & 0o777` will not equal `0o700` regardless of what was
requested — this is a **native-Windows-only environment limitation**, not a
logic defect in your F3 test or in the `guard-lifecycle-ready.mjs` fix, and
not something in this briefing's scope to fix (the file that enforces it,
`codex-onboarding-runtime.mjs`, is out of scope — do not touch it). Corroborate
this with two pieces of independent evidence before accepting it, don't just
trust the trace:
- A disposable-worktree baseline comparison: `git worktree add --detach
  <path> 609b50e`, run the **unmodified, pre-existing** (not your new one)
  `guard-lifecycle-ready.test.mjs` there, and confirm it already has exactly
  2 pre-existing failing tests unrelated to your change (a `symlinkSync`
  `EPERM` case and a `git commit -S`-signing case) — same names, same
  failure reasons, on this same machine, in this same file, before your diff
  touched anything. `git worktree remove --force` when done.
- Run `node --test plugins/pipeline-core/lib/onboarding-continuity.test.mjs`
  (untouched by you) and observe it **already** has one failing test, `"mode-
  unreadable state is unavailable"`, for the identical reason (POSIX
  permission bits unenforceable on this Windows filesystem) — further
  confirming this is a pre-existing, environment-wide limitation class, not
  something newly introduced.
- `docs/state.md`'s own most recent header (search for "native-Windows
  environment failures already characterized per-file this session") already
  documents and accepts exactly this category of pre-existing,
  environment-specific, non-regressing failure for this exact test file.

**If and only if all of this holds:** your new F3 test is correct in
principle (it would pass in a POSIX CI environment) but cannot pass on this
particular Windows development machine due to a limitation entirely outside
`guard-lifecycle-ready.mjs`'s own logic. In that case, **do not weaken, skip,
stub, or platform-gate the test to force it green** — the original briefing
explicitly anticipated a native-Windows-only blocker and said to report it
as a finding rather than paper over it. Keep the test exactly as designed
(a real, no-stub, end-to-end proof of the governed+ready ALLOW path), accept
that it is the third pre-existing-category failure in this file on this
machine, and **document this plainly and prominently** in your final report
(and note whether the F3 test's assertions logically hold up to the point
where it hits the environment wall — i.e., confirm the fixture-building steps
before the private-state directory creation are all genuinely correct, not
just "eventually gives up").

If your own investigation finds something DIFFERENT from this diagnosis
(e.g., an actual logic bug, not an environment limitation) — trust your own
finding over this paragraph, fix or report accordingly, and say so explicitly
in your report.

### 4. Context files

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` and
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` — read the
  full uncommitted diff first (see the precondition check above), then the
  complete files.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — legacy-root
  classification (`"fresh"` vs `"existing-unmanaged"`, ~line 360-410) and
  `apply-portable-seed`'s own `git init` (~line 1475-1478); read-only, not in
  your scope to modify.
- `plugins/pipeline-core/scripts/project-onboarding-e2e.test.mjs` — the
  established, already-working pattern for building a fresh-root fixture via
  the real CLI without a pre-emptive `git init`; read-only reference.
- `plugins/pipeline-core/lib/onboarding-continuity.mjs` and
  `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` — read-only;
  `resolvePrivate()`/`resolveOnboardingPrivateState()`/
  `ensurePrivateDirectory()` are the trace target for part C. **Do not modify
  either file** — they are out of this briefing's scope regardless of what
  you find.
- `docs/state.md` — read only the most recent (topmost) header entry for
  precedent on how this repo already documents pre-existing,
  environment-specific test failures; do not read further back, do not treat
  it as your task list.

### 5. DoD checks

- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`:
  record the exact pass/fail counts and failing-test names. Expected final
  state: all F4-related tests pass; the two pre-existing Windows-only
  failures remain (unchanged names/reasons); the new F3 test either passes
  outright or fails ONLY at the diagnosed private-state-directory
  Windows-permission wall (part C) — if it fails anywhere else, that's a real
  bug you still need to fix or report.
- Disposable-worktree baseline comparison against `609b50e` (part C) —
  paste the exact commands and their failing-test-name output, not a
  paraphrase.
- `node --test plugins/pipeline-core/lib/onboarding-continuity.test.mjs` —
  confirm the pre-existing "mode-unreadable state is unavailable" failure
  (part C corroboration); this file is read-only context, do not modify it.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 6. Forbidden

- Scope: modify ONLY `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`
  and `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`.
  Conditionally `plugins/pipeline-core/hooks/hooks.json`'s header `$comment`
  text ONLY, if you judge it needs a wording update (optional, your call).
  No other file — in particular, do NOT modify
  `plugins/pipeline-core/lib/runtime-projection-v3.mjs`,
  `plugins/pipeline-core/lib/onboarding-continuity.mjs`,
  `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs`, or
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs`.
- Do NOT weaken, delete, skip, or platform-gate the new F3 test to force a
  green result on this machine (see part C).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  (plus `hooks.json` in the same commit only if you touched it — one
  coherent work package per GIT-02).
- **Commit trailer:** end your commit message with the line `AI-Assisted: true`
  on its own line. Do NOT include any `Co-Authored-By`, `Claude-Session`, or
  other provider/session-identifying trailer (`guardrails/git.md` GIT-03).

### 7. Stop conditions

- More than 2 failed attempts at the same problem — report the failure state.
- The task requires touching a file outside field 6's scope — stop and
  report.
- Your own investigation in part C finds something other than a genuine
  environment limitation (i.e., a real logic bug you cannot fix within
  budget, or the failure implicates a file you're not allowed to touch) —
  stop and report with full detail rather than guessing.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 8. Dispatch metadata

- Ruleset SHA/version: `609b50e` on `feat/sprint-cyborg-claude`.
- Model/effort: design-tier / xhigh (opus). Rationale: this touches a
  security-relevant, fail-closed admission-guard hook and its hardening
  tests (MP-07 criticality matrix) — same staffing as the original
  briefing-g.
- Worktree: no — run directly in the main checkout (the uncommitted diff is
  already there).
- Profile: standard.
- Tool budget: ≤35 tool uses (higher than usual since this includes
  independent root-cause tracing in part C).
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01g2"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the final diff, the exact test/verification
commands you ran (including the worktree baseline comparison) and their
output, your part-C environment-limitation determination with its
corroborating evidence, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 7).
