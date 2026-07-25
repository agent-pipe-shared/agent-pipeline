# Prepared Goldfish briefing — PSModulePath pollution fix in `windows-private-state.mjs`

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is a
> THIRD, distinct root cause from WIN-FPT-1 and WIN-PGA-2 — do not fold it
> into either; one concern per briefing. Ruleset SHA refreshed to `281e17a`
> (current HEAD, post-v0.4.4-rebase-publish). **Verify-baseline note (read
> this before running anything):** `node harness/scripts/verify.mjs`
> currently exits non-zero on this branch for reasons entirely unrelated to
> this task — a confirmed gitleaks false-positive in `security-scan.mjs`
> (see `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`)
> plus pre-existing native-Windows suite reds and one new suite
> (`project-onboarding-e2e-tests`) from the v0.4.x hotfix range. Do NOT
> investigate or attempt to fix any of that — it is out of scope and already
> tracked. Your own DoD below does not require a full `verify.mjs` run for
> exactly this reason.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 281e17a loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing WIN-PSM-1/2026-07-25 · Role Goldfish (deep)

---

## Briefing WIN-PSM-1: stop `invoke()` from inheriting a polluted `PSModulePath` when spawning the fixed legacy PowerShell

### 1. Goal

`plugins/pipeline-core/lib/windows-private-state.mjs`'s `invoke()` function
spawns a FIXED legacy `powershell.exe` (`WINDOWS_POWERSHELL_PATHS`) to observe
or harden a path's Windows DACL. It currently passes
`env: { ...environment, PIPELINE_PRIVATE_STATE_PATH: path }`, where
`environment` defaults to the calling process's full `process.env` —
including `PSModulePath` UNCHANGED. When the calling process's own ancestry
includes PowerShell 7 (pwsh), `PSModulePath` is prefixed with PS7-specific
module directories; the legacy `powershell.exe`'s module autoloader then
finds an incompatible reference to `Microsoft.PowerShell.Security` first and
fails to load it, so `Get-Acl`/`Set-Acl` become unavailable and every call
returns `{ status: "unavailable", reason: "native Windows DACL observation
failed" }` — a false negative, not a real DACL/security problem. Fix
`invoke()` so the spawned legacy PowerShell always resolves
`Microsoft.PowerShell.Security` regardless of the parent process's shell
ancestry, WITHOUT ever hardcoding a machine-specific path (see Forbidden).

### 2. Context files

- `plugins/pipeline-core/lib/windows-private-state.mjs` — the contract.
  Read the whole file (it is short, ~121 lines); the defect is in `invoke()`
  (~line 79-91); `WINDOWS_POWERSHELL_PATHS` (~line 13-16) is the existing
  "fixed system locations only, never resolve through PATH/user config"
  design intent this fix must extend, not contradict.
- `plugins/pipeline-core/lib/windows-private-state.test.mjs` — the existing
  test file for this module; read it fully before writing any new fixture,
  match its existing style.
- `docs/state.md`, section "Bug 2 deadlock DISSOLVED — root cause was
  PSModulePath pollution, not a genuine DACL limitation — 2026-07-25" (read
  this exact entry only, not the surrounding session log) — the confirmed
  root-cause writeup and reproduction trace; do not re-derive the diagnosis
  from scratch, but DO reproduce it yourself per the BUGFIX module below.

Confirmed root cause (already isolated by direct reproduction, do not
re-derive): calling `invoke()`'s spawned script with `PSModulePath` set to
only the three canonical Windows-PowerShell-v1.0 directories (no PS7 entries)
succeeds; the identical call with a PS7-polluted `PSModulePath` (PS7 module
directories prepended) fails with the module-autoload error. Toggling
`PSModulePath` alone reproduces both directions.

### 3. DoD checks

- AC: `invoke()` no longer depends on the ambient `PSModulePath` the calling
  process happens to have. The spawned legacy `powershell.exe` process must
  reliably resolve `Microsoft.PowerShell.Security` (`Get-Acl`/`Set-Acl`)
  regardless of whether its parent shell chain includes PowerShell 7.
- AC: the fix must NOT hardcode any user-profile-specific path (e.g. nothing
  resembling `C:\Users\<name>\OneDrive\...` or any other per-user directory)
  — this repo runs on two machines with different local paths/profiles
  (CLAUDE.md, "no machine-specific absolute paths"). The correct target is
  the fixed system location `%SystemRoot%\System32\WindowsPowerShell\v1.0\Modules`
  (derivable from `process.env.SystemRoot`/`windir`, or a hardcoded
  `C:\Windows\...` fallback consistent with `WINDOWS_POWERSHELL_PATHS`'s own
  existing fixed-path style — NOT a `${env:...}`-expanded per-user path) —
  OR simply omit `PSModulePath` from the child's env entirely so the legacy
  `powershell.exe` computes its own untouched default. Either approach is
  acceptable; hardcoding the three literal strings this session tested with
  is NOT.
- AC: new regression fixture added to `windows-private-state.test.mjs`
  (win32-gated, following the existing capability-probe/platform-guard
  pattern already in this test file) that: constructs a deliberately
  PS7-polluted `PSModulePath` value (module directories that do not contain
  a usable `Microsoft.PowerShell.Security`, or simply a value with unrelated
  PS7-style entries prepended) via the injectable `environment` option
  `invoke()`/`assessWindowsPrivatePath` already exposes, and asserts the
  fixed function still returns `status: "secure"` (or whatever the correct
  successful status is for a known-good test path) — i.e. the fix is
  provably independent of the calling shell's own `PSModulePath`, not just
  "worked when I tried it once."
- AC: existing tests in `windows-private-state.test.mjs` continue to pass
  unchanged.
- Verify command: `node --test plugins/pipeline-core/lib/windows-private-state.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` for
  this task — see the status note at the top of this briefing; it currently
  exits non-zero for reasons unrelated to your work, and reconciling that is
  the Elephant's job after your dispatch, same as the WIN-PGA-2 precedent.
- Machine-written test/verify output is your evidence artifact — never
  prose you compose.

### 4. Forbidden

- Scope: touch ONLY `plugins/pipeline-core/lib/windows-private-state.mjs`
  and its own test file. Any other file (including
  `plugins/pipeline-core/lib/po-gate-authority.mjs`,
  `plugins/pipeline-core/lib/po-gate-profile-publisher.mjs`, or
  `plugins/pipeline-core/lib/private-boundary.mjs`) is out of scope even
  though they consume this module — read-only for context if needed.
- Do NOT hardcode any per-user/profile-specific path (see DoD AC above) —
  this is the single most important constraint of this briefing.
- Do NOT weaken `evaluateWindowsPrivateState`'s security policy (the
  owner-only/no-reparse-point/DACL checks) — this fix is about environment
  hygiene for the OBSERVATION mechanism, not about relaxing what counts as
  secure.
- Do NOT change `WINDOWS_POWERSHELL_PATHS`'s fixed-path list itself unless
  the fix specifically requires it (unlikely; if it seems necessary, stop
  and report instead — that would be new information about the actual
  defect shape).
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The fix requires touching a file outside field 4's scope — stop and
  report; that would mean the defect is bigger than currently scoped.
- Any test outside this file's own suite starts failing because of this
  change — stop and report immediately, do not attempt to fix the
  regression yourself.
- The hermetic regression fixture (DoD) cannot be made to pass without
  hardcoding a per-user path — stop and report; do not ship a
  machine-specific fix.
- Missing access/tool/permission.
- Genuine ambiguity the briefing does not resolve.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `281e17a` (refreshed 2026-07-25 for this dispatch,
  post-v0.4.4-rebase-publish; originally authored against
  `996d22f8b3f2e128618d26209f3b5395a588fd8a`).
- Model/effort: `goldfish-deep` / xhigh. This is DACL-assurance canon code
  (spec.md §5: "Guard/hook/canon code... authorship dispatch to
  goldfish-deep") with genuine in-task design latitude (the exact mechanism
  — env-var override vs. omission, how to derive the system path — is not
  fully pre-decided by this briefing on purpose; a wrong choice here
  reintroduces machine-specific brittleness).
- Worktree: no — single file pair, no parallel-dispatch conflict expected
  in isolation (confirm against calibration `.claude/pipeline.json`
  `"worktree": "optional"` at actual dispatch time).
- Profile: standard (guardrail/DACL-assurance-adjacent code).
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` next to the evidence
  artifact per the standard template fields (`taskId: "WIN-PSM-1"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`).

---

## BUGFIX module (applies per template)

- Reproduce-first: reproduce the failure yourself — construct a
  PS7-polluted `PSModulePath` (via the injectable `environment` option) and
  confirm `assessWindowsPrivatePath` returns `"unavailable"` with the
  module-autoload-failure reason BEFORE writing any fix — this is your RED
  baseline evidence.
- Root-cause-only: fix only the `PSModulePath` handling inside `invoke()`.
  No incidental cleanup of the rest of the file.
- Renames separate: if the fix suggests extracting a helper, that is fine
  within this file's scope, but do not rename or restructure exported
  function signatures other consumers rely on.
- Repro stays in the suite: the PS7-pollution regression fixture is
  permanent regression coverage, not a scratch check to remove after.
