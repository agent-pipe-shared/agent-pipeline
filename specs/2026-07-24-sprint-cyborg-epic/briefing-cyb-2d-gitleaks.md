# Prepared Goldfish briefing — CYB-2D/gitleaks: v2 capability-contract descriptor

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND the
> CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3, CYB-2D** of that plan: depends
> only on CYB-2B (closed, commit `48d481b`). This is ONE of four
> file-independent siblings (gitleaks/osv-scanner/semgrep/license-check) —
> each dispatched separately, in an **isolated git worktree**, because this
> task edits a live, already-tested production file with a live consumer
> (`security-scan.mjs`), unlike every prior CYB-2 sub-package which only
> touched new files. Do not assume any sibling's file exists or has changed —
> you cannot see their worktrees. Ruleset SHA `d364d8c` (current HEAD at
> dispatch time).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset d364d8c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2D-gitleaks/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2D/gitleaks: add a v2 capability-contract descriptor to `gitleaks.mjs`

### 1. Goal

Add exactly ONE new export to `harness/scripts/security-adapters/gitleaks.mjs`:

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
- `tool: name` (reuse this file's own existing `name` export — do not
  hardcode a second copy of the string)
- `kind: "capability"` (gitleaks is a CYB-1F frozen `cap.*` root, not a
  catalog control)
- `capabilityId: "cap.secrets"` (CYB-1F §3's frozen root for gitleaks —
  confirm this against `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md`
  yourself rather than trusting this briefing blindly)
- `controlRef: null` (not applicable — this is a capability, not a control)
- `supportedEcosystems: null` (gitleaks is not ecosystem-scoped — it scans
  arbitrary text/source, not package manifests)
- `toolVersionConstraint: null` (no version constraint is documented or
  enforced anywhere in this file today — confirm by reading the whole file;
  if you find one you missed, use it instead of `null` and say so in your
  report)
- `networkBehavior: "offline"` (the `detect` invocation scans `rootDir`
  locally; no network call is made) — if you find evidence in the actual
  invocation that contradicts this, use `"unknown"` plus a
  `networkBehaviorNote: string` field explaining why, rather than asserting
  `"offline"` if you're not confident
- `requiredInputs: ["rootDir"]` (the only real input `run()` consumes beyond
  its own binary-resolution config — confirm against the actual function
  signature/body)
- `severityNormalization` — a plain data transcription of the ALREADY-REAL
  rule in this file ("every finding maps to fixed `high`" — see the header
  comment's "SEVERITY MAPPING" section and the `findings.map(...)` code).
  Suggested shape: `{ source: "fixed", value: "high", rationale: "gitleaks findings carry no native severity field" }` —
  the exact key names inside this nested object are your call, as long as it
  is a complete, faithful transcription of the real rule (do not invent a
  different rule).
- `confidenceNormalization: null` (gitleaks findings carry no confidence
  signal in this file's current output shape — confirm by reading the
  `findings.map(...)` construction; if you find one, use it instead)
- `coverageLimitations: string[]` — at least one factual, code-grounded entry
  (e.g. derived from the real `detect --source <root>` invocation: does it
  scan the working tree only, or git history too? Read the actual `args`
  array and gitleaks' own `detect` subcommand semantics as invoked here —
  do not guess; if you are not certain what `detect` covers by default versus
  what a `--log-opts`/history flag would add, and this file passes no such
  flag, document what you can verify directly from the invocation args
  themselves, not from general gitleaks knowledge beyond what this file
  actually does)
- `exitCodeMapping` — a plain data transcription of the real logic already in
  `run()`: `--exit-code 0` forces gitleaks to always exit 0; a NON-zero exit
  is always ERROR/`scanner_error` (never findings); status/classification
  otherwise come entirely from the parsed report content. Represent this as
  data, e.g. `{ "0": "always — status derived from parsed report content, never from exit code", "nonzero": "scanner_error (ERROR) — genuine crash, never findings" }`
  — exact key/value shape is your call, must be a faithful transcription.
- `timeoutContract: { defaultMs: 60000, cancellable: true, mechanism: "node:child_process spawnSync timeout option (SIGTERM on expiry)" }` —
  confirm the real default value and mechanism against the actual `run()`
  signature and its `ETIMEDOUT` handling rather than trusting this briefing's
  numbers blindly.
- `evidenceFields: ["tool", "severity", "rule", "path", "line", "msg"]` —
  confirm this exactly matches the real `findings.map(...)` object shape in
  the current code; if it has drifted from this list, use the real list.

This descriptor is a **transcription of existing, already-correct behavior**
— you are not inventing new tool behavior. If you find the header comment's
prose doesn't match the actual code (a real discrepancy), trust the CODE and
flag the mismatch in your report rather than silently picking one.

**No genuine design latitude on the field shape itself** (it's fixed above,
identically across all four sibling files) — your only real judgment calls
are: (a) the internal shape of the two nested transcription objects
(`severityNormalization`, `exitCodeMapping`) as noted, and (b) whether any of
the `null`/fixed values above turn out to be wrong once you actually read the
code (report any such correction explicitly, do not silently accept a
possibly-wrong default from this briefing).

### 2. Context files

- `harness/scripts/security-adapters/gitleaks.mjs` (read fully) — the file
  you are additively extending. Read its header comment AND the real code of
  `run()`/`isInstalled()` — do not derive the descriptor from the comment
  alone, cross-check against the code.
- `harness/scripts/security-scan.test.mjs` (read only the gitleaks-related
  test blocks, roughly the first ~16 named tests — for existing test style
  precedent; you are NOT modifying this file).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` — grep
  for "cap.secrets" to confirm the frozen capability-id string.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` §1 row CYB-2D
  only — the one-line scope description this sub-package implements. Do not
  read other rows.

### 3. DoD checks

- `gitleaks.mjs`'s existing `name`, `isInstalled`, `run` exports are
  byte-unchanged (confirm via `git diff` showing only additions, zero
  modified/deleted lines in those functions).
- New file `harness/scripts/security-adapters/gitleaks.test.mjs` (does not
  exist yet — you are creating it) contains tests asserting: the descriptor
  exists, is frozen (`Object.isFrozen(...)` true), every fixed field above
  has its documented value, and `tool === name` (the real export, not a
  hardcoded duplicate string).
- Verify command:
  `node --test harness/scripts/security-adapters/gitleaks.test.mjs` must
  exit 0.
- **Regression (mandatory, run yourself before reporting done):**
  `node --test harness/scripts/security-scan.test.mjs` — this file has a
  **known, pre-existing, environment-specific failure** unrelated to your
  work: two CLI-smoke sub-checks ("CLI: bare rootDir -> exit 0" and its
  stdout-verdict-line sibling) fail today because the test's spawned child
  process cannot find `git` on its `%PATH%` in this environment (a Windows
  environment-propagation issue, not a code defect). Confirm this exact same
  pair (and no others) is the only failure before AND after your change —
  if a DIFFERENT test starts failing, or the failure count grows, STOP and
  report; that would mean your change broke something real.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch baseline
  is currently noisy for unrelated reasons (confirmed `security-scan.mjs`
  cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: edit ONLY `harness/scripts/security-adapters/gitleaks.mjs`
  (additive: one new frozen const export + a short top-of-file doc addition
  explaining the descriptor's purpose, no change to any existing
  function/export). Create ONLY
  `harness/scripts/security-adapters/gitleaks.test.mjs` (new file).
- Do NOT touch `osv-scanner.mjs`, `semgrep.mjs`, `license-check.mjs`,
  `security-scan.mjs`, `security-scan.test.mjs`, `guard-push.mjs`,
  `governance/security-controls/catalog.json`, or any CYB-1/CYB-2 file — all
  closed/live, read-only for context.
- Do NOT wire this descriptor into `security-scan.mjs`'s aggregation logic —
  that is CYB-2E's job, a later, separately-serialized wave.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope — stop and
  report.
- Any test in `security-scan.test.mjs` OTHER than the two named
  known-pre-existing CLI-smoke failures starts failing — stop and report
  immediately; do not attempt to fix `security-scan.mjs` itself, that is out
  of scope.
- You discover the actual code contradicts one of this briefing's asserted
  fixed values (e.g. gitleaks DOES make a network call, or DOES have a
  version constraint) — do not silently follow the briefing's wrong
  assumption; use the real, verified value instead and report the correction
  clearly. This is expected, not a stop condition by itself.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `d364d8c` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: edits a live,
  already-tested production file with a live consumer (`security-scan.mjs`)
  — real regression risk even though the change is additive-only; per the
  body-slicing plan's own note this whole sub-package carries a stricter bar
  than CYB-1's brand-new-file waves.
- **Worktree: YES** — isolated git worktree, per the body-slicing plan's
  explicit instruction for CYB-2D given the live-production-file risk. Work
  entirely inside your assigned worktree; do not assume the main checkout's
  current state matches what you see (it may differ if sibling dispatches
  have landed).
- Profile: standard.
- Tool budget: ≤30 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo), fields `taskId: "CYB-2D-gitleaks"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist wiring this into `security-scan.mjs` or
  touching any sibling adapter file.
- Fixtures stay in the suite: your new descriptor-shape test file is
  permanent regression coverage, not a scratch check to remove after.

At the end, report back: the diff summary (confirm it is purely additive — no
existing line in `gitleaks.mjs` changed), the exact test commands you ran and
their exit codes/output (both your new test file AND the
`security-scan.test.mjs` regression check with its known-failure
confirmation), any field value you had to correct from this briefing's
assumed default, and confirm the commit SHA you produced (or a clean stop
with the reason, per field 5).
