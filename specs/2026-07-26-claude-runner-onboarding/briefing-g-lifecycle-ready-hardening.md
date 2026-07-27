# Prepared Goldfish briefing — CLAUDE-RUNNER-01g: harden the Claude lifecycle-ready hook (real allow-path proof + fail-closed on module load)

> **Status: READY TO DISPATCH.** Closes Critic findings F3 (major) and F4
> (minor) from the CLAUDE-RUNNER-01 review — both scoped to the same
> guard-lifecycle-ready hook, bundled as one coherent work package (GIT-02).
> Ruleset SHA: `24f5c04` on `feat/sprint-cyborg-claude` (2026-07-27).
> **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 24f5c04 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01g/2026-07-27 · Role Goldfish (deep)

---

## Briefing CLAUDE-RUNNER-01g: two hardening fixes for `guard-lifecycle-ready.mjs`'s Claude wiring

### 1. Goal — part A: a real governed+ready ALLOW-path proof (F3, major)

`plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` was recently
registered directly into Claude's own `hooks.json` `Edit|Write` matcher — a
globally active, deliberately fail-closed admission gate for every
Pipeline-governed root a Claude session touches. Its test file currently
proves two things about the REAL registered hook, run as a real child
process (`runGuardProcess()`, `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:561`):
(1) it BLOCKS a governed-but-not-ready root, and (2) it ALLOWS a
NON-governed root (a root with no governance marker at all, which returns
before any lifecycle inspection happens). A third, separate, in-process-only
test (`main()` at line ~638) proves the ALLOW decision translates to exit 0
— but only via an injected `requireProjectOnboardingReadyFn` stub that
returns `status: "ready"` unconditionally.

**What is missing:** a test that constructs a genuinely governed,
genuinely-ready `runner: "claude"` project on real disk, and shows the REAL
registered hook — invoked as a real child process, the same way `hooks.json`
invokes it, calling the REAL `requireProjectOnboardingReady()` →
`inspectProjectOnboardingV3()` chain with no stub — returns exit 0. Today,
"a Claude project reaches ready" (proven in `project-onboarding-v3.test.mjs`,
AC-5) and "the hook enforces the gate" (proven for the block case only) have
never been proven TOGETHER through the real subprocess boundary. Close that
gap.

**Two precedents to combine, not invent from scratch:**

- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs:1878` —
  `initializedRoot(runner)` shows the exact technique for bringing a project
  to a genuine `runner: "claude"` `ready` state through the real public
  entrypoint: seed via `planProjectOnboardingV3`/`applyProjectOnboardingV3`,
  select the runner via `selectRunner(path, { enabled: [...], default: runner })`,
  then apply the runtime via `applyRunnerProfileMigrationV3` (NOT the
  lifecycle runtime operation — that path is what would try to write a
  restart barrier and hit native-Windows write issues that are irrelevant to
  Claude's path in the first place). Read this function and both `AC-5`
  tests around it (lines 1890–1938) fully.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs:561` —
  `runGuardProcess(projectDir, input)` shows the exact technique for
  invoking the REAL hook script as a REAL child process with real stdin/env,
  the way `hooks.json` invokes it.

The bridge between them — building the `initializedRoot("claude")`-equivalent
state on a REAL on-disk directory (not the `fakeDeps`-injected fixtures
`project-onboarding-v3.test.mjs` uses elsewhere for its faster in-process
tests) so a REAL child-process hook call reaches it — is your design work.
You have latitude here: e.g. you may drive the real onboarding CLI
(`plugins/pipeline-core/scripts/project-onboarding-v3.mjs`) via `execFileSync`
the same way this test file's own "public kickoff plan/apply..." test does,
or find an equivalent path through real, non-injected library calls. Confirm
whichever path you take does NOT require any native-Windows-only operation
that other tests in this session have already shown to fail on this host
(symlink creation, restart-barrier writes) — the Claude path should not need
either, which is exactly the point of this feature; if you hit one anyway,
that itself would be a new, reportable finding, not something to route
around silently.

### 2. Goal — part B: fail-closed on module-load failure (F4, minor)

`GOVERNANCE_MARKERS` (line 27–33 of `guard-lifecycle-ready.mjs`) is computed
at MODULE SCOPE (import time), and includes
`...loadRuntimeProjectionV3OwnedKeys().targets.map(...)` — a call that reads
and `JSON.parse`s a config file from disk
(`plugins/pipeline-core/lib/runtime-projection-v3.mjs:102-104`, itself
unguarded). If that file is missing, corrupt, or unreadable, the exception
propagates out of the module's top-level scope. `hooks.json`'s own header
comment defines this script's exit semantics as "0 allow, 2 block, 1 allow +
config warning" — an uncaught module-load exception produces node exit 1,
which is ALLOW, not block. This contradicts the same header's claim that the
guard is "deliberately FAIL-CLOSED" for "an unresolvable project root, a
malformed ready receipt, or an unknown lifecycle exception" — a broken owned-
keys config is exactly such an anomaly and today silently disarms the gate
instead.

**Worth knowing (checked, not hypothetical):** this same module is also
imported by `plugins/pipeline-core/hooks/codex-pretool-guard.mjs` and
`plugins/pipeline-core/hooks/guard-apply-patch.mjs` (confirmed via grep) — a
module-load crash here has a wider blast radius than just this one guard.

Fix it so a failure loading the owned-keys config results in a BLOCKED
verdict when the guard actually runs, not a bare crash. Two reasonable
shapes (your latitude — pick one, document why in your report):

(i) Keep `GOVERNANCE_MARKERS`'s owned-keys portion computed at module scope,
    but wrap ONLY the `loadRuntimeProjectionV3OwnedKeys()` call in its own
    try/catch; on failure, fall back to the static marker list (without the
    owned-keys targets) AND set a module-level sentinel (e.g.
    `OWNED_KEYS_LOAD_ERROR`); have `evaluateLifecycleReadyGuard()` (or
    `main()`) check that sentinel FIRST, before any other branch, and return
    a `blocked()` verdict with a clear stderr reason if set. The module
    always loads successfully (protecting the two other importers named
    above from an unrelated cascade failure); the guard itself still fails
    closed at evaluation time.

(ii) Make the owned-keys load itself lazy (a memoized function called only
     when the guard actually evaluates an input, inside the existing
     `main()` try/catch or an equivalent guarded path) rather than a
     module-scope side effect at all.

Whichever you choose, add a test proving: (a) the module still imports/loads
successfully when the owned-keys config load throws, and (b) evaluating an
input against a governed root under that failure condition returns a BLOCKED
verdict (exit 2), not allow.

### 3. Context files

- `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs` (read fully) — the
  file you modify for part B; study `GOVERNANCE_MARKERS`, `main()`,
  `evaluateLifecycleReadyGuard()`.
- `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs` (read fully)
  — the file you extend for both parts; study `runGuardProcess()`, the
  existing subprocess tests (lines 561–660), and the file's general fixture
  style (`root()`, `edit()`, `write()`, cleanup discipline).
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (read the
  region around lines 1839–1940 fully) — the `initializedRoot()`/AC-5
  precedent for part A.
- `plugins/pipeline-core/lib/runtime-projection-v3.mjs` (read
  `loadRuntimeProjectionV3OwnedKeys()` and its call site fully) — the
  unguarded read/parse behind part B.
- `plugins/pipeline-core/hooks/hooks.json` — re-read its header `$comment`
  on exit semantics and the fail-closed deviation note for entry (9), to
  keep your fix and its documentation consistent with what's already
  claimed there. If your fix changes the accuracy of that claim, update the
  header comment too (in scope — see field 4).

### 4. DoD checks

- A new test exercises the REAL registered hook (via `runGuardProcess()` or
  equivalent real-subprocess invocation) against a REAL, non-stubbed,
  genuinely-ready `runner: "claude"` project and asserts exit 0, empty
  stderr — proving the governed+ready ALLOW path end-to-end for the first
  time.
- A new test proves the module load failure → blocked-at-evaluation behavior
  described in part B.
- `node --test plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`
  — record before/after pass/fail counts via a `git stash`-based comparison
  of your own diff (same technique used elsewhere in this package); the two
  pre-existing Windows-environment failures (symlink EPERM, a shell-word
  matcher not matching Windows temp paths) must remain unchanged in name and
  count — only new tests may change the total.
- Full regression: also re-run `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
  and `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
  (read-only context for you; confirm your diff doesn't touch them and their
  results are unaffected).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 5. Forbidden

- Scope: modify ONLY `plugins/pipeline-core/hooks/guard-lifecycle-ready.mjs`,
  `plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs`, and
  (only if your part-B fix changes the accuracy of its claims)
  `plugins/pipeline-core/hooks/hooks.json`'s header `$comment` text — no
  functional change to `hooks.json`'s hook registrations themselves. No
  other file.
- Do NOT modify `plugins/pipeline-core/lib/runtime-projection-v3.mjs`,
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs`, or any file under
  `plugins/pipeline-core/lib/` — read-only context only.
- Do NOT modify `codex-pretool-guard.mjs` or `guard-apply-patch.mjs` — they
  are read-only context (the "worth knowing" blast-radius note), not in
  scope to change.
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <the exact files you touched>`.
- **Commit trailer:** end your commit message with the line `AI-Assisted: true`
  on its own line. Do NOT include any `Co-Authored-By`, `Claude-Session`, or
  other provider/session-identifying trailer (`guardrails/git.md` GIT-03).

### 6. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately.
- Part A's real fixture hits a native-Windows-only operation failure you
  cannot route around within budget — stop and report this as a finding
  (per the note in Goal part A), do not silently weaken the test to a stub.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 7. Dispatch metadata

- Ruleset SHA/version: `24f5c04` on `feat/sprint-cyborg-claude`.
- Model/effort: `goldfish-deep` / xhigh. Rationale: this is a genuine
  architecture/security single case (MP-05) — hardening a fail-closed
  admission-gate hook that is now globally active on Claude's own
  `Edit|Write` matcher, including a real design decision on part B's fix
  shape with real security consequences (a wrong shape could still leave a
  fail-open residual).
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤45 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01g"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff, your design-latitude choices (part A's
real-fixture bridge technique, part B's fix shape) and why, the exact test
commands you ran and their exit codes including the required before/after
comparison, and confirm the commit SHA you produced (or a clean stop with
the reason, per field 6).
