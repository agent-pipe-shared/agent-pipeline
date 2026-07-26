# Prepared Goldfish briefing — CLAUDE-RUNNER-01a: runner derivation + hard-reject removal

> **Status: DISPATCHING NOW.** PO gate answered "freigeben" for
> `prd_claude-runner-onboarding.md`/`spec.md` (2026-07-26, recorded in
> `docs/state.md`). This is sub-package (a) of 3, serialized: (b) and (c)
> depend on the runner-derivation shape this task establishes — do not
> dispatch them until this one lands and is verified. Ruleset SHA `ac72eba`
> (current HEAD at dispatch time). **Worktree: no** — run directly in the
> main checkout (this branch has diverged too far from `origin/main` for the
> Agent tool's `isolation: "worktree"` to anchor correctly; see
> `docs/state.md`'s documented CYB-2D worktree-isolation incident — do not
> use worktree isolation for this dispatch).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset ac72eba loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CLAUDE-RUNNER-01a/2026-07-26 · Role Goldfish (deep)

---

## Briefing CLAUDE-RUNNER-01a: make the V4 lifecycle derive and thread a real `runner`, remove the two hard Codex-only rejects

### 1. Goal

Per `specs/2026-07-26-claude-runner-onboarding/spec.md` (read this file FULLY
first — it is your primary technical authority, this briefing does not
duplicate it) §2 Technical Plan and §4 items 1-2, AC-1/AC-2/AC-6/AC-7:

1. In `plugins/pipeline-core/lib/project-onboarding-v3.mjs`: replace
   `selectedRunnerIsCodex(root, fs)` with a general `selectedRunner(root, fs)`
   that reads `runners.default` from `pipeline.user.yaml` and returns
   whichever value is present (validated against the enum the file's own
   `runners.enabled` declares — today `["claude","codex"]`), rather than a
   boolean codex-only check. Remove the hard
   `if (!selectedRunnerIsCodex(...)) return lifecycleResult({status:"invalid",...})`
   reject inside the "partial" V3-source branch (around line 1041 at time of
   writing — confirm the exact current line yourself, do not trust a stale
   line number). In its place, the branch must proceed using the derived
   runner value. An `runners.default` value OUTSIDE the enum remains a
   genuine `"invalid"` rejection (AC-2) — you are narrowing this check, not
   deleting runner validation.
2. `lifecycleResult()`'s `runner` parameter currently defaults to the literal
   `"codex"` (around line 675). Every call site must instead pass its runner
   value explicitly, derived via `selectedRunner()` where a V3 source exists,
   or keeping today's existing `null`-on-failure semantics for fresh/unsafe
   paths (see the two call sites around lines 966 and 1004 that already do
   `runner: root === null ? null : "codex"` and
   `runner: legacy.root ? "codex" : null` — these need the same derivation
   treatment, not a blind literal swap).
3. In `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`: replace
   the `observed.runner !== "codex"` check (around line 150) with validation
   against the same runner enum (`"claude"` or `"codex"`), not a single
   literal. An out-of-enum runner value must still cause
   `PORG-INVALID-OBSERVATION` (AC-7) — same narrowing discipline as point 1.

**Genuine design latitude:** exactly how you factor the enum-validation logic
(a small shared helper vs. inline checks in both files) is your call, as long
as both files enforce the identical enum. Read `pipeline.user.yaml`'s
`runners.enabled` field yourself to confirm the canonical enum source rather
than hardcoding `["claude","codex"]` as a second, potentially-drifting copy —
prefer reading it from the same schema/validation surface
`runner-profiles-v3.mjs` already uses if that's cleaner; if you instead
introduce a second literal enum, document why in your report.

### 2. Context files

- `specs/2026-07-26-claude-runner-onboarding/spec.md` (read FULLY) — your
  primary technical authority. §1 Problem, §2 Technical Plan, §4 items 1-2,
  §5 AC-1/AC-2/AC-6/AC-7, §6 DoD.
- `specs/2026-07-26-claude-runner-onboarding/prd_claude-runner-onboarding.md`
  (read for product framing/rationale only — the Spec is your binding
  contract, not this file).
- `plugins/pipeline-core/lib/project-onboarding-v3.mjs` (read fully) — the
  file you're modifying. Pay particular attention to `lifecycleResult()`
  (~line 672), `selectedRunnerIsCodex()` (~line 882), the "partial" branch
  reject (~line 1041), `freshIntent()` (~line 287, sets
  `runners: {enabled:["claude","codex"], default:"codex"}` for brand-new
  projects — this stays unchanged, out of scope for this task per Spec's
  Non-goals; do not touch `freshIntent()`).
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs` (read fully)
  — the second file you're modifying. Note `RESULT_KEYS` (~line 41) and
  `requireProjectOnboardingReady()`'s exact validation sequence — your fix
  must preserve every other check in that function untouched.
- `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (read fully) —
  existing test suite (1787 lines); study its fixture style for how a
  "partial"-branch / lifecycle-result test is structured. You will extend
  this file, not replace it.
- `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs` (read
  fully, 128 lines) — existing test suite you will extend.
- `plugins/pipeline-core/lib/runner-profiles-v3.mjs` (read the validation
  function only, ~line 196-202) — for the canonical `agent_runtime`/`runners`
  enum validation pattern already used elsewhere, in case it's cleaner to
  reuse than to hand-roll a second enum check.
- `pipeline.user.yaml` (repo root, read fully) — this repo's own live V3
  source; note its `runners.default: "claude"`, `runners.enabled:
  ["claude","codex"]`, `agent_runtime: "claude-code"` — this is a REAL
  example of the exact input shape your fix must handle correctly, not a
  hypothetical.

### 3. DoD checks

- AC-1: a fixture project with `pipeline.user.yaml`'s `runners.default:
  "claude"`, classified into the "partial" branch (incomplete runtime
  projection but valid V3 source), no longer returns `status: "invalid"` —
  it proceeds to the runtime/App-Server-conditional logic (which sub-package
  (b) will complete; for THIS task, it is sufficient that the code path no
  longer hard-rejects before reaching that logic — you may see an
  intermediate non-`"invalid"` status like `runtime-attestation-required`
  until (b) lands, and that is correct and expected).
- AC-2: a fixture with `runners.default: "something-else"` (out of enum)
  STILL returns `status: "invalid"` with a diagnostic — write this as an
  explicit regression-proof test, not an assumption.
- AC-6: `requireProjectOnboardingReady()` accepts an observation with
  `status: "ready"` and `runner: "claude"` (construct this fixture directly
  against the function, mocking `inspect` per the existing test file's own
  pattern — do not require the full lifecycle chain from (a)+(b)+(c) to be
  complete to prove this function-level contract).
- AC-7: `requireProjectOnboardingReady()` STILL throws
  `PORG-INVALID-OBSERVATION` for an out-of-enum `runner` value in the
  observation — explicit regression-proof test.
- Every pre-existing test in both
  `project-onboarding-v3.test.mjs`/`project-onboarding-ready-gate.test.mjs`
  passes unchanged — this is your proof the Codex runtime path has zero
  regression (Spec AC-9, partial proof — (b)/(c) complete it).
- Verify commands:
  `node --test plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`
  and
  `node --test plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`
  both exit 0.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline currently has 21 pre-existing, documented, unrelated failures
  (native Windows/Codex-App-Server environment gaps — see `docs/state.md`'s
  2026-07-26 rebase-verification entries); running it would produce noise
  you'd have to explain, not new signal. The full aggregate run happens
  later, as its own dedicated step (Task #8), after all three sub-packages
  land.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: modify ONLY
  `plugins/pipeline-core/lib/project-onboarding-v3.mjs`,
  `plugins/pipeline-core/lib/project-onboarding-ready-gate.mjs`,
  `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`,
  `plugins/pipeline-core/lib/project-onboarding-ready-gate.test.mjs`. No
  other file.
- Do NOT touch `codex-onboarding-app-server.mjs`, `v3-bootstrap-authority.mjs`,
  `codex-onboarding-runtime.mjs`, `guard-lifecycle-ready.mjs`, `hooks.json` —
  these belong to sub-packages (b) and (c), dispatched separately after this
  one is verified.
- Do NOT touch `freshIntent()`'s hardcoded `runners: {default: "codex"}` for
  brand-new projects — explicitly out of scope per Spec's Non-goals (a fresh
  project's default runner choice is a separate product decision, not part
  of this fix).
- Do NOT wire `agent_runtime` in as a second discriminator — Spec explicitly
  defers this (PRD Decision point 2); use `runners.default` only.
- Do NOT touch any file under `guardrails/**`, `roles/**`, `docs/adr/**`.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; list exact paths in both `git add` and
  `git commit`.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any pre-existing test outside your own new/modified assertions starts
  failing and you cannot determine why within budget — stop and report
  immediately, do NOT silently adjust the pre-existing test to make it pass.
- You find the "partial" branch's runner check has a load-bearing reason to
  stay Codex-only that Spec/PRD did not anticipate (e.g. a downstream
  invariant that genuinely requires Codex) — stop and report this as a
  finding for the Elephant, do not silently narrow your fix to avoid it.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `ac72eba` (current HEAD at dispatch time, 2026-07-26).
- Model/effort: `goldfish-deep` / xhigh. Rationale: rigor 2 / risk class high
  per Spec header — this touches the core dispatch-gating decision surface
  (project-onboarding-ready-gate.mjs is the admission gate for every
  mutating Pipeline entrypoint), same escalation tier as WIN-PGA-2/CYB-2D in
  this epic.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤40 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CLAUDE-RUNNER-01a"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

At the end, report back: the diff summary, the exact test commands you ran
and their exit codes/output, any design-latitude choice you made and why,
and confirm the commit SHA you produced (or a clean stop with the reason,
per field 5).
