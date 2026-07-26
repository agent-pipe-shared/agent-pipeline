# Prepared Goldfish briefing — CLAUDE-RUNNER-01b: runner-conditional App-Server/restart requirement

> **Status: DISPATCHING NOW.** CLAUDE-RUNNER-01a landed as `88c8029` and was
> independently re-verified (own re-run of both test files, full 9-file
> regression sweep, `plan-verifier` 12/2/0 — see `docs/state.md`'s
> "CLAUDE-RUNNER-01a CLOSED" entry, 2026-07-27). PO gate answered "freigeben"
> for `prd_claude-runner-onboarding.md`/`spec.md` (2026-07-26, recorded in
> `docs/state.md`). Ruleset SHA `3ecc41a` (current HEAD at dispatch time).
> **Worktree: no** — run directly in the main checkout, same reasoning as
> (a) (documented worktree-isolation incident, this branch has diverged too
> far from `origin/main` for `isolation: "worktree"` to anchor correctly).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 3ecc41a loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01b/2026-07-26 · Role Goldfish (deep)

---

## Briefing CLAUDE-RUNNER-01b: make the App-Server/restart-barrier requirement conditional on the derived runner

### 1. Goal

Per `specs/2026-07-26-claude-runner-onboarding/spec.md` (read this file FULLY
first — it is your primary technical authority) §2 Technical Plan and §4
items 3-5, AC-3/AC-4/AC-5:

1. `plugins/pipeline-core/lib/codex-onboarding-app-server.mjs`'s
   `observeOnboardingAppServer()` (and
   `plugins/pipeline-core/lib/project-onboarding-v3.mjs`'s
   `observeReadyAppServer()`, which calls it) currently treat App-Server
   health as unconditionally `required: true` for `bootstrap`/`session`/
   `dispatch` intents, regardless of runner. Note the file ALREADY has a
   precedent for a non-required component shape: `onboarding` intent returns
   `component(false, "not-requested", null)` (line ~91). You are adding a
   PARALLEL but distinctly-coded case: for `runner === "claude"`, return
   `{required: false, status: "not-applicable", code: null}` — a new status
   string (`"not-applicable"`), not reusing `"not-requested"`, because the
   reason differs: `"not-requested"` means "this intent doesn't need it
   here", `"not-applicable"` means "this runner has no such concept at all,
   for any intent". Do not conflate the two meanings by reusing the same
   status string — Spec requires this distinction explicitly.
2. Both functions need a runner parameter threaded in (exact signature shape
   — new parameter vs. reading from an already-available context object — is
   your implementation latitude per Spec's "Open items" section; the closed
   contract is the AC-3/AC-4 behavior only).
3. `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`'s
   `projectionCurrent()` function (~line 91) unconditionally calls
   `readRestartBarrier`/`readCurrentRuntimeReadback` (from
   `codex-onboarding-runtime.mjs`) and fails closed
   (`v3_runtime_readback_unavailable`) if no Codex restart-barrier artifact
   exists. For `runner === "claude"`, this must instead be able to reach
   `status: "ready"` (with `runtimeReadback` reflecting the honest
   not-applicable state — do not fabricate `"current"`) WITHOUT requiring a
   restart-barrier artifact to exist on disk at all — Claude Code has no
   comparable "prove a fresh process reloaded the runtime" contract in this
   codebase (Spec §2, §3 Alternatives — explicitly rejected building a
   parallel Claude attestation mechanism; do not invent one).
4. `codex-onboarding-runtime.mjs` itself (the restart-barrier/readback
   schemas, `codexExecutableSha256` binding, etc.) stays UNCHANGED for the
   Codex path — this task only changes how/whether `v3-bootstrap-authority.mjs`
   invokes it, not the module's own internal logic or schemas.

**Genuine design latitude:** the exact `runtimeReadback` value your `"ready"`
result carries for the Claude path (e.g. a new literal like
`"not-applicable"` alongside the existing `"absent"`/`"restart-required"`/
`"current"` set) is your call, as long as it is honest (never claims
`"current"` when no readback was ever produced) and documented in your
report. If introducing a new literal, check whether any downstream consumer
of `v3-bootstrap-authority.mjs`'s return shape has a closed enum that would
break — search for consumers before deciding.

### 2. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` (read FULLY) — your
  primary technical authority. §1 Problem, §2 Technical Plan, §4 items 3-5,
  §5 AC-3/AC-4/AC-5, §6 DoD.
- `specs/2026-07-26-claude-runner-onboarding/prd_claude-runner-onboarding.md`
  (read for product framing/rationale only).
- `plugins/pipeline-core/lib/codex-onboarding-app-server.mjs` (read fully,
  157 lines) — `component()` helper (~line 48), `mapCodexAppServerObservation()`
  (~line 62, already has a `required !== true` short-circuit you should
  study as the closest existing precedent), `observeOnboardingAppServer()`
  (~line 85).
- `plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs` (read
  fully, 275 lines) — existing test suite; study fixture style.
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` — specifically
  `validAppServerComponent()` (~line 699, the closed shape validator your new
  `not-applicable` component must satisfy or you must extend this validator
  to accept it — read its exact boolean logic, do not guess), and
  `observeReadyAppServer()` (~line 714) plus its caller (~line 760-798, the
  `if (appServer.required === true && appServer.status !== "running")`
  branch that currently blocks the lifecycle).
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs` (read fully, 318
  lines) — `projectionCurrent()` (~line 91-175, the function you modify),
  `validateV3BootstrapAuthority()` (~line 193, its caller).
- `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` — **this
  file does NOT exist yet** (confirmed absent during this package's
  readiness check). You are creating it net-new. Do not assume a fixture
  pattern exists to extend — design it fresh, but keep it consistent in
  style with `codex-onboarding-app-server.test.mjs`'s conventions (same
  `node:test`/`node:assert` idioms already used across this codebase).
- `plugins/pipeline-core/lib/codex-onboarding-runtime.mjs` (read the module
  docstring and `BARRIER_SCHEMA`/`readRestartBarrier`/
  `readCurrentRuntimeReadback` exports only — you are NOT modifying this
  file's internals, only understanding what `v3-bootstrap-authority.mjs`
  currently calls into it for).
- Output of sub-package (a)'s landed diff (read the actual committed diff,
  not this briefing's description of it) — you need the exact final shape
  of the runner-derivation function/parameter (a) introduced in
  `project-onboarding-v3.mjs`, to thread it correctly here.

### 3. DoD checks

- AC-3: `observeOnboardingAppServer`/`observeReadyAppServer` invoked with
  `runner: "claude"` for intent `bootstrap`, `session`, or `dispatch`
  returns `{required: false, status: "not-applicable", code: null}` and does
  NOT block the lifecycle on App-Server unavailability — write an explicit
  test proving the lifecycle reaches a non-blocked state through this path.
- AC-4: the SAME functions invoked with `runner: "codex"` behave
  byte-identically to pre-change 0.4.6 behavior — write this as an explicit
  regression-proof test (do not just claim "unchanged", prove it against a
  fixture that exercises every existing status branch:
  running/execution-denied/not-running/unavailable).
- AC-5: `validateV3BootstrapAuthority` invoked for a `runner: "claude"`
  project with NO restart-barrier artifact on disk reaches `status: "ready"`
  (subject to its other non-Codex-specific checks passing) — construct this
  fixture explicitly (e.g. mock `readRestartBarrier` to simulate genuine
  absence, not a stubbed-out bypass) and assert `ready`.
- Every pre-existing test in `codex-onboarding-app-server.test.mjs` passes
  unchanged.
- New file `v3-bootstrap-authority.test.mjs` covers: the new Claude-path
  `ready` case (AC-5) AND enough of the existing Codex-path behavior
  (ready/host-init-required/projection-drift, per Spec §2's note that no
  pre-existing test protects this file today) to prove your change didn't
  silently alter the Codex path — this is your own regression net since none
  existed before you.
- Verify commands:
  `node --test plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs`
  and
  `node --test plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs`
  both exit 0.
- Full regression against sub-package (a)'s files: also re-run
  `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` and
  `node --test plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`
  — both must still exit 0 (proves (a)+(b) compose correctly, not just (b)
  in isolation).
- Do NOT run the full `node harness/scripts/verify.mjs` — same reasoning as
  (a)'s briefing (documented noisy baseline; full run happens later as its
  own dedicated step).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY
  `plugins/pipeline-core/lib/codex-onboarding-app-server.mjs`,
  `plugins/pipeline-core/lib/codex-onboarding-app-server.test.mjs`,
  `plugins/pipeline-core/scripts/v3-bootstrap-authority.mjs`; CREATE
  `plugins/pipeline-core/scripts/v3-bootstrap-authority.test.mjs` (new
  file). You may also need a small, narrow addition to
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs`'s
  `validAppServerComponent()`/`observeReadyAppServer()` ONLY if the new
  `not-applicable` component shape needs the validator extended — if so,
  keep this change minimal (extending the existing boolean logic, not
  restructuring the function) and call it out explicitly in your report.
- Do NOT modify `codex-onboarding-runtime.mjs`'s own internals — only how
  `v3-bootstrap-authority.mjs` calls into it.
- Do NOT touch `project-onboarding-ready-gate.mjs`, `guard-lifecycle-ready.mjs`,
  `hooks.json` — (a) already closed the ready-gate file; (c) owns the hook
  wiring, dispatched separately after this one.
- Do NOT touch any file under `guardrails/**`, `roles/**`, `docs/adr/**`.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new file needs `git add -- <path>` before
  commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately.
- You find that sub-package (a)'s landed runner-derivation shape doesn't
  give you what you need to thread a runner value into these functions
  cleanly — stop and report this as a finding for the Elephant (may indicate
  (a)'s implementation needs a small follow-up), do NOT invent a parallel,
  inconsistent runner-detection mechanism here.
- You find `validAppServerComponent()` cannot be minimally extended to
  accept the new `not-applicable` shape without a larger restructure — stop
  and report, do not force a fit that compromises the existing Codex-path
  validation.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `3ecc41a` (current HEAD at dispatch time, 2026-07-27).
- Model/effort: `goldfish-deep` / xhigh. Rationale: rigor 2 / risk class high
  per Spec header; this task also creates a net-new test file with no
  established fixture precedent (v3-bootstrap-authority.test.mjs), requiring
  genuine design judgment, not just pattern-following.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤45 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01b"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff summary, the exact test commands you ran
and their exit codes/output, any design-latitude choice you made and why
(especially the `runtimeReadback` literal choice and whether
`validAppServerComponent()` needed extension), and confirm the commit SHA
you produced (or a clean stop with the reason, per field 5).
