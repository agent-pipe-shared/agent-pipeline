# Prepared Goldfish briefing — CYB-2D/semgrep: v2 capability-contract descriptor

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND the
> CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3, CYB-2D** of that plan: depends
> only on CYB-2B (closed, commit `48d481b`). This is ONE of four
> file-independent siblings (gitleaks/osv-scanner/semgrep/license-check) —
> each dispatched separately, in an **isolated git worktree**, because this
> task edits a live, already-tested production file with a live consumer
> (`security-scan.mjs`). Do not assume any sibling's file exists or has
> changed — you cannot see their worktrees. Ruleset SHA `d364d8c` (current
> HEAD at dispatch time).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset d364d8c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2D-semgrep/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2D/semgrep: add a v2 capability-contract descriptor to `semgrep.mjs`

### 1. Goal

Add exactly ONE new export to `harness/scripts/security-adapters/semgrep.mjs`:

```js
export const CAPABILITY_CONTRACT_V2 = Object.freeze({ ... });
```

This is a **pure, static, additive data descriptor** — a machine-readable
transcription of behavior this file **already has and already documents** in
its own header comment. You are NOT changing `run()`, `isInstalled()`, or any
existing behavior. Do NOT touch those functions' bodies at all. This
descriptor exists so CYB-2E's later aggregator work can read a uniform
capability contract across all four adapters without re-deriving it from
prose comments.

**FIXED SHAPE — every one of these exact field names is required, across all
four sibling adapters (you will not see the others, but the shape must match
what their own briefings mandate — do not invent your own alternative
names):**

- `contractVersion: "v2"` (literal string)
- `tool: name` (reuse this file's own existing `name` export)
- `kind: "capability"` (semgrep is a CYB-1F frozen `cap.*` root)
- `capabilityId: "cap.sast"` (CYB-1F §3's frozen root for semgrep — confirm
  against `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md`
  yourself rather than trusting this briefing blindly)
- `controlRef: null` (not applicable — this is a capability, not a control)
- `supportedEcosystems: null` (semgrep's rule-based static analysis is
  language/rule-scoped, not package-ecosystem-scoped, in this adapter — if
  you find this file itself declares a language allowlist, use that instead
  of `null`; check `config.rulesDir` handling and the header comment's
  INVOCATION section)
- `toolVersionConstraint: null` (no version constraint is documented or
  enforced anywhere in this file — confirm by reading the whole file; if you
  find one, use it instead)
- `networkBehavior` — **read the header comment's INVOCATION section
  carefully.** When `config.rulesDir` is absent, this adapter falls back to
  the literal string `"auto"` as semgrep's `--config` value, which is
  semgrep's own **built-in ruleset-registry mode** — this may involve a
  network fetch to Semgrep's rule registry depending on the real semgrep
  binary's behavior, which this adapter file does not itself control or
  guarantee. When `config.rulesDir` IS present (an actual local directory
  path from the manifest), the invocation is local-only. Represent this
  conditional honestly: e.g.
  `networkBehavior: "network-optional"` with
  `networkBehaviorNote: "offline when config.rulesDir names a local rules directory; the 'auto' fallback (semgrep's built-in registry mode) may involve a network fetch depending on the semgrep binary's own behavior, which this adapter does not control"` —
  do not assert a single unconditional value if the real behavior is
  conditional on `config.rulesDir`.
- `requiredInputs: ["rootDir"]` with `config.rulesDir` noted as an *optional*
  input (falls back to `"auto"` when absent) — confirm the exact real
  signature/behavior, don't guess.
- `severityNormalization` — a plain data transcription of the REAL, already-
  documented three-tier native mapping (`extra.severity` "ERROR"→high,
  "WARNING"→medium, "INFO"→info; any other/missing value→"medium" defensive
  fallback, never dropped/never crashes). Represent all three native values
  plus the fallback rule as data.
- `confidenceNormalization: null` (no confidence signal in this file's
  current output shape — confirm by reading the real finding-construction
  code; use a real value if you find one).
- `coverageLimitations: string[]` — at least one factual, code-grounded entry
  (e.g. "coverage is entirely determined by the active rule set — a local
  `rules_dir` (if configured) or semgrep's own built-in 'auto' registry mode
  when not configured; this adapter does not itself enumerate which rules
  ran" — verify against the real invocation/config handling).
- `exitCodeMapping` — a plain data transcription of the REAL exit-code/body
  policy already documented and implemented: only a ZERO child exit WITH a
  JSON body carrying a `results[]` array AND no error payload is a completed
  scan; any nonzero exit, error payload, or missing `results[]` is
  `scanner_error` (ERROR) even if stdout otherwise looks like a clean report
  (deliberately fail-closed, avoids false PASS after partial/error run).
  Represent this precisely — do not lose the "even if stdout looks clean"
  fail-closed nuance.
- `timeoutContract` — confirm the real default `timeoutMs` value and
  cancellation mechanism against the actual `run()` signature/`ETIMEDOUT`
  handling — read it yourself, don't assume it matches gitleaks/osv-scanner's
  own defaults.
- `evidenceFields: string[]` — read the real finding-construction code and
  transcribe the actual field names populated on each finding object —
  confirm whether it matches gitleaks' `["tool", "severity", "rule", "path", "line", "msg"]`
  shape exactly or differs.

This descriptor is a **transcription of existing, already-correct behavior**
— you are not inventing new tool behavior. If you find the header comment's
prose doesn't match the actual code (a real discrepancy), trust the CODE and
flag the mismatch in your report rather than silently picking one.

**Genuine design latitude:** the internal nested shape of
`severityNormalization` and `exitCodeMapping` (must be complete/faithful, key
names are your call), and correctly representing the conditional
`networkBehavior` honestly rather than picking one value and hiding the
conditionality.

### 2. Context files

- `harness/scripts/security-adapters/semgrep.mjs` (read fully) — the file you
  are additively extending. Read its header comment AND the real code of
  `run()`/`isInstalled()` — cross-check the comment against the code.
- `harness/scripts/security-scan.test.mjs` (read only the semgrep-related
  test blocks — for existing test style precedent; you are NOT modifying
  this file).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` — grep
  for "cap.sast" to confirm the frozen capability-id string.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` §1 row CYB-2D
  only. Do not read other rows.

### 3. DoD checks

- `semgrep.mjs`'s existing exports (`name`, `isInstalled`, `run`) are
  byte-unchanged (confirm via `git diff` showing only additions).
- New file `harness/scripts/security-adapters/semgrep.test.mjs` (does not
  exist yet — you are creating it) contains tests asserting: the descriptor
  exists, is frozen, every fixed field above has its documented value, and
  `tool === name` (the real export, not a hardcoded duplicate).
- Verify command:
  `node --test harness/scripts/security-adapters/semgrep.test.mjs` must exit
  0.
- **Regression (mandatory, run yourself before reporting done):**
  `node --test harness/scripts/security-scan.test.mjs` has a **known,
  pre-existing, environment-specific failure** unrelated to your work: two
  CLI-smoke sub-checks fail today because the test's spawned child process
  cannot find `git` on its `%PATH%` in this environment. Confirm this exact
  same pair (and no others) is the only failure before AND after your
  change — if a DIFFERENT test starts failing, STOP and report.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch baseline
  is currently noisy for unrelated reasons (confirmed cross-branch gitleaks
  false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: edit ONLY `harness/scripts/security-adapters/semgrep.mjs`
  (additive: one new frozen const export + a short top-of-file doc addition,
  no change to any existing function/export). Create ONLY
  `harness/scripts/security-adapters/semgrep.test.mjs` (new file).
- Do NOT touch `gitleaks.mjs`, `osv-scanner.mjs`, `license-check.mjs`,
  `security-scan.mjs`, `security-scan.test.mjs`, `guard-push.mjs`,
  `governance/security-controls/catalog.json`, or any CYB-1/CYB-2 file.
- Do NOT wire this descriptor into `security-scan.mjs`'s aggregation logic —
  that is CYB-2E's job, a later, separately-serialized wave.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` before the
  commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any test in `security-scan.test.mjs` OTHER than the two named
  known-pre-existing CLI-smoke failures starts failing — stop and report
  immediately; do not attempt to fix `security-scan.mjs` itself.
- You discover the actual code contradicts one of this briefing's asserted
  fixed values — use the real, verified value instead and report the
  correction clearly. This is expected, not a stop condition by itself.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `d364d8c` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: edits a live,
  already-tested production file with a live consumer; the conditional
  `networkBehavior` transcription is a genuine judgment call with real
  regression-adjacent stakes for CYB-2E's later consumption.
- **Worktree: YES** — isolated git worktree, per the body-slicing plan's
  explicit instruction for CYB-2D.
- Profile: standard.
- Tool budget: ≤30 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location, fields `taskId: "CYB-2D-semgrep"`, `model`, `rulesetSha`,
  `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist wiring this into `security-scan.mjs` or
  touching any sibling adapter file.
- Fixtures stay in the suite: your new descriptor-shape test file is
  permanent regression coverage, not a scratch check to remove after.

At the end, report back: the diff summary (confirm it is purely additive), the
exact test commands you ran and their exit codes/output (both your new test
file AND the `security-scan.test.mjs` regression check with its known-failure
confirmation), any field value you had to correct from this briefing's
assumed default (especially the conditional `networkBehavior`), and confirm
the commit SHA you produced (or a clean stop with the reason, per field 5).
