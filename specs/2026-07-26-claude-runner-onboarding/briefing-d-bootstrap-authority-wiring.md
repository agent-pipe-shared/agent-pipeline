# Prepared Goldfish briefing — CLAUDE-RUNNER-01d: wire runner through the real bootstrap-authority/restart-barrier call sites

> **Status: DISPATCHING NOW.** Discovered as a genuine gap during independent
> verification of CLAUDE-RUNNER-01b (commit `90d2cd1`): that package added a
> `runner` parameter to `validateV3BootstrapAuthority()` and made
> `projectionCurrent()` runner-conditional, but **the real lifecycle code
> never actually supplies that parameter**, and a second, independent
> unconditional restart-barrier read sits downstream of it. Confirmed by
> this session's own `plan-verifier` dispatch (6 verified / 4 gap / 0
> unplanned against `briefing-b-app-server-conditional.md`) AND by direct
> source inspection. This briefing is (d) in sequence — dispatched between
> (b) and (c) because (c)'s scope (guard-lifecycle-ready wiring) sits
> downstream of a lifecycle that must actually be able to reach `ready` for
> a Claude project first. PO gate covers this: it is squarely inside
> `spec.md`'s AC-5 ("reach `status: ready`... rather than fail closed on a
> missing Codex-executable digest") and §4 item 1
> (`project-onboarding-v3.mjs` is already a named file in that item) — no
> new PO gate needed, this is closing a gap inside the already-approved
> scope, not expanding it. Ruleset SHA `90d2cd1` (current HEAD at dispatch
> time). **Worktree: no** — run directly in the main checkout, same
> reasoning as (a)/(b).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 90d2cd1 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01d/2026-07-27 · Role Goldfish (deep)

---

## Briefing CLAUDE-RUNNER-01d: make the real lifecycle call sites runner-aware, not just the functions they call

### 1. Goal

`plugins/pipeline-core/lib/project-onboarding-v3.mjs` has THREE places that
must become runner-conditional, all inside `legacyInspection()`/
`readyLifecycleResult()`'s "ready" handling — not just the one function
CLAUDE-RUNNER-01b already fixed:

1. **`legacyInspection()`, ~line 377** — `validateV3BootstrapAuthority({ rootDir: root, deps: fs })`
   is called with NO `runner` argument, so it always evaluates the Codex
   path. This call site has no `runner` variable in scope at all (it runs
   before the lifecycle-level runner derivation happens elsewhere) — you
   must add a `selectedRunner(root, fs)` call here (the function already
   exists and is exported from this same file, per CLAUDE-RUNNER-01a) and
   pass its result through.
2. **`readyLifecycleResult()`'s "ready" branch, ~line 1165** —
   `validateV3BootstrapAuthority({ rootDir: legacy.root, deps: fs })` is
   called with NO `runner` argument, even though `runner` IS already in
   scope in this function (used two lines later at ~1169 in
   `afterRuntimeLifecycleResult({..., runner, ...})`). This is a one-line
   fix: pass `runner` through.
3. **The SAME function, ~line 1201** — after the `authority.status` check
   passes (`["projection-current","restart-required","ready"].includes(...)`
   `|| authority.runtimeProjection === "noop"`), the code unconditionally
   calls `readRestartBarrier({ rootDir: legacy.root, repositoryCapability: repository.mode, deps: fs })`
   and everything downstream of it (through ~line 1290) assumes a Codex
   restart-barrier artifact is the only way to reach `ready`/
   `runtime-attestation-required`/`restart-required`. **For `runner ===
   "claude"`, this entire block must be skippable**, reaching
   `afterRuntimeLifecycleResult()` directly with an honest non-Codex runtime
   status (the same `"not-applicable"`-style honesty CLAUDE-RUNNER-01b
   established for `runtimeReadback` — do not invent a third, inconsistent
   literal; reuse or closely parallel that precedent) instead of ever
   calling `readRestartBarrier`/`readCurrentRuntimeReadback` for a runner
   that has no such concept.

**Genuine design latitude:** exactly how you structure the runner-conditional
branch at point 3 (an early return before the `try` block, a runner check
inside it, a separate small helper function) is your call — the closed
contract is: for `runner === "claude"`, `readRestartBarrier`/
`readCurrentRuntimeReadback` (both from `codex-onboarding-runtime.mjs`) are
NEVER called, and the function still reaches a `ready`-eligible result
through `afterRuntimeLifecycleResult()` when `authority.status` was
`ready`/`projection-current`/`noop` (i.e. everything else about the project
checks out). Preserve the exact existing Codex-path behavior byte-for-byte
when `runner === "codex"` (or any other/unspecified runner — this is a
narrowing change for `"claude"` only, per the Spec's general narrowing
discipline established by (a)).

### 2. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` (read FULLY) — your
  primary technical authority, specifically AC-5 and §4 item 1.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` (read fully) — the
  file you're modifying. Read `selectedRunner()` (added by
  CLAUDE-RUNNER-01a, confirm its exact current signature/location
  yourself), `legacyInspection()` (~line 348-383, point 1 above),
  `readyLifecycleResult()`'s full "ready" branch (~line 1164-1293, points 2
  and 3 above), `afterRuntimeLifecycleResult()` (its signature and what
  `runtime` shape it expects), and CLAUDE-RUNNER-01b's own
  `not-applicable`/`runtimeReadback` precedent inside
  `observeReadyAppServer`/`validAppServerComponent` for the honesty pattern
  to parallel.
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` (read fully) —
  CLAUDE-RUNNER-01b's `projectionCurrent()` runner-conditional short-circuit
  (the `RUNNERS_WITHOUT_NATIVE_READBACK` set and its early-return shape) —
  this is your closest existing precedent for how a "skip the Codex-only
  read entirely" branch should look; do not reinvent a different style.
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` (read the module
  docstring and `readRestartBarrier`/`readCurrentRuntimeReadback` export
  signatures only — you are NOT modifying this file).
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (read fully) —
  you will extend this file; study existing "ready" branch / restart-barrier
  fixture style (search for `restart-required`, `projection-current`,
  `runtime-attestation-required` fixtures for precedent).
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` (read the
  Claude-path fixtures CLAUDE-RUNNER-01b added — precedent for how a
  "claude never reads the barrier" assertion is structured, e.g. a call
  counter/spy on the injected dependency).

### 3. DoD checks

- AC-5, end-to-end: a fixture project with `runner: "claude"` (derive it the
  same way — a `pipeline.user.yaml` with `runners.default: "claude"`) whose
  `legacy.status === "ready"` and whose V3 authority would otherwise resolve
  to `ready`/`projection-current`/`noop` reaches a non-blocked
  `afterRuntimeLifecycleResult()` outcome through `inspectProjectOnboardingV3()`
  itself (the real public entrypoint) — not just through an isolated call to
  `validateV3BootstrapAuthority()` in unit-test isolation. This is the
  specific gap this briefing exists to close; your test must exercise the
  real entrypoint, not just the inner functions.
- Explicit proof `readRestartBarrier`/`readCurrentRuntimeReadback` are never
  invoked for `runner: "claude"` on this path — inject a spy/counter on
  those dependencies (mirror CLAUDE-RUNNER-01b's own technique in
  `v3-bootstrap-authority.test.mjs` for this) and assert zero calls.
- Codex-path regression proof: the SAME entrypoint, same fixture shape, with
  `runner: "codex"` (or the default/unspecified case) still reaches
  `readRestartBarrier` and behaves byte-identically to pre-change 0.4.6
  behavior — explicit test, not assumption.
- `legacyInspection()`'s point-1 fix: a fixture proves `runner` is correctly
  derived and threaded even when `legacyInspection()` itself is called in
  isolation (not just through the full `v4Inspection` chain) — this
  function has its own call sites elsewhere in the file that also need to
  keep working.
- Every pre-existing test in `project-onboarding-v3.test.mjs` continues to
  either pass or fail with the exact same failure signature it had before
  your change — this codebase currently has ~19-20 pre-existing,
  environment-specific (native-Windows restart-barrier/App-Server/symlink)
  failures on this host; do not be alarmed by them, but confirm via your own
  before/after comparison (e.g. `git stash` your change, run, note failures,
  restore, run again) that your change adds ZERO new failures beyond your
  own new test additions. Report the exact failing-test-name sets from both
  runs in your report, not just a pass/fail count (counts alone have already
  caused one false-alarm in this package's own verification history — always
  diff the actual test names).
- Verify command: `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
  — report its exact output; per the point above, exit code alone is not
  sufficient evidence, the failing-name-set comparison is what matters.
- Also re-run `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
  and `node --test plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs`
  — both must still exit 0 (proves you didn't disturb (b)'s own closed
  scope).
- Do NOT run the full `node harness/scripts/verify.mjs` — full aggregate run
  is Task #8, later.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY `plugins/pipeline-core/lib/project-onboarding-v3.mjs`
  and `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`. No other
  file — specifically do NOT touch `v3-bootstrap-authority.mjs`,
  `codex-onboarding-runtime.mjs`, `codex-onboarding-app-server.mjs`,
  `project-onboarding-ready-gate.mjs` (all already closed/verified by prior
  sub-packages), or `guard-lifecycle-ready.mjs`/`hooks.json` (owned by (c),
  not yet dispatched).
- Do NOT change `validateV3BootstrapAuthority()`'s own signature or
  `projectionCurrent()`'s logic — those are CLAUDE-RUNNER-01b's closed
  scope; you only change how `project-onboarding-v3.mjs` CALLS them.
- Do NOT touch `freshIntent()` or wire `agent_runtime` — same standing
  exclusion as every prior sub-package in this series.
- Do NOT touch any file under `guardrails/**`, `roles/**`, `docs/adr/**`.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- You find that skipping the restart-barrier block for Claude would leave
  some OTHER invariant unsatisfied that this briefing didn't anticipate
  (e.g. a downstream consumer of the lifecycle result that specifically
  requires a barrier-derived field to be non-null even for Claude) — stop
  and report this as a finding for the Elephant, do not paper over it with
  a fabricated value.
- Any pre-existing test's failure SIGNATURE changes (not just "still
  fails" but fails differently, or a previously-passing test now fails) —
  stop and report immediately, do not adjust the pre-existing test.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `90d2cd1` (current HEAD at dispatch time, 2026-07-27).
- Model/effort: `goldfish-deep` / xhigh. Rationale: rigor 2 / risk class
  high per Spec header; this is a correctness-critical gap-closure in the
  core lifecycle admission path, discovered by independent verification
  rather than self-reported — extra care warranted.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤40 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01d"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff summary, the exact test commands you ran
and their exit codes/output (including the before/after failing-name-set
comparison per DoD), any design-latitude choice you made and why, and
confirm the commit SHA you produced (or a clean stop with the reason, per
field 5).
