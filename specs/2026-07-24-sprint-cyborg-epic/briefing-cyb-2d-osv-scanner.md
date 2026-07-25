# Prepared Goldfish briefing — CYB-2D/osv-scanner: v2 capability-contract descriptor

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

> Bootstrap check passed: ruleset d364d8c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2D-osv-scanner/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2D/osv-scanner: add a v2 capability-contract descriptor to `osv-scanner.mjs`

### 1. Goal

Add exactly ONE new export to
`harness/scripts/security-adapters/osv-scanner.mjs`:

```js
export const CAPABILITY_CONTRACT_V2 = Object.freeze({ ... });
```

This is a **pure, static, additive data descriptor** — a machine-readable
transcription of behavior this file **already has and already documents** in
its own header comment. You are NOT changing `run()`, `isInstalled()`,
`checkV2()`, `mapOsvSeverity()`, or any existing behavior. Do NOT touch those
functions' bodies at all. This descriptor exists so CYB-2E's later aggregator
work can read a uniform capability contract across all four adapters without
re-deriving it from prose comments.

**FIXED SHAPE — every one of these exact field names is required, across all
four sibling adapters (you will not see the others, but the shape must match
what their own briefings mandate — do not invent your own alternative
names):**

- `contractVersion: "v2"` (literal string)
- `tool: name` (reuse this file's own existing `name` export)
- `kind: "capability"` (osv-scanner is a CYB-1F frozen `cap.*` root)
- `capabilityId: "cap.sca"` (CYB-1F §3's frozen root for osv-scanner — confirm
  against `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md`
  yourself rather than trusting this briefing blindly)
- `controlRef: null` (not applicable — this is a capability, not a control)
- `supportedEcosystems` — **read this file's real invocation
  (`osv-scanner scan source --format json -r <root>`) and the OUTPUT CONTRACT
  section of its header comment first.** This adapter does not itself
  enumerate or filter by ecosystem — it hands the whole `rootDir` to
  osv-scanner's own auto-detection and accepts whatever `results[].source`
  entries come back. If you find no explicit ecosystem allowlist/filter
  anywhere in this file's code, set `supportedEcosystems: null` with an
  adjacent `supportedEcosystemsNote: "auto-detected by the underlying osv-scanner binary from lockfiles/manifests found under rootDir; this adapter does not itself enumerate or restrict ecosystems"` —
  do not invent a specific ecosystem list (npm/pip/cargo/etc.) that this file
  itself does not actually declare or restrict to.
- `toolVersionConstraint: "osv-scanner major version 2 required (v1 syntax incompatible); enforced by checkV2()'s --version probe before scanning"` —
  confirm this matches the real `checkV2()` logic (the `major !== 2` check)
  before using it verbatim.
- `networkBehavior: "unknown"` with
  `networkBehaviorNote: "this adapter does not control osv-scanner's own network access for vulnerability-database lookups; whether the invoked osv-scanner binary queries a remote OSV database or uses a local/offline cache is a property of the binary's own configuration, not something this adapter file declares or restricts"` —
  do NOT assert `"offline"` or `"network-required"` with false confidence;
  this is a genuine "I checked and the file itself doesn't decide this"
  finding, document it honestly as such.
- `requiredInputs: ["rootDir"]` — confirm against the actual `run()`
  signature; note in your report if package-manifest/lockfile presence is
  itself an implicit input (it's really the underlying osv-scanner binary's
  concern, not this adapter's own logic, given the SKIPPED-on-"no package
  sources" path is a downstream *result*, not an input this adapter demands
  upfront).
- `severityNormalization` — a plain data transcription of the REAL
  `mapOsvSeverity()` three-tier fallback logic already in this file (native
  `database_specific.severity` string, lower-cased with "moderate"→"medium" →
  else first parseable numeric CVSS score bucketed at >=9/>=7/>=4 → else
  fixed "high" fallback). Represent all three tiers and the exact numeric
  thresholds as data — do not collapse this into a lossy single-value
  summary; the exact key/value shape of the nested object is your call, but
  it must let a reader reconstruct the real three-tier rule from the data
  alone.
- `confidenceNormalization: null` (no confidence signal exists in this file's
  current output shape — confirm by reading the real finding-construction
  code; use a real value instead if you find one).
- `coverageLimitations: string[]` — at least one factual, code-grounded entry
  (e.g. "SKIPPED (not scanned) when no package manifests/lockfiles exist at
  all under rootDir, exit 128 + 'No package sources found', per the real
  exit-128 special-case branch" — verify this against the actual code path,
  don't paraphrase from memory).
- `exitCodeMapping` — a plain data transcription of the REAL, more complex
  exit-code contract already documented in this file's header AND
  implemented in code: `0` = clean, `1` = findings present (BOTH valid
  completed runs, never conflated with ERROR), the ONE special-cased `128`
  (with stdout/stderr containing "No package sources found") = SKIPPED, any
  OTHER exit code (including any other 128) = ERROR (fail-closed). Represent
  all four cases distinctly as data — do not lose the "exit 1 is NOT an
  error" or "only this one specific 128 case is SKIPPED" nuances.
- `timeoutContract` — confirm the real default `timeoutMs` value and
  cancellation mechanism against the actual `run()` signature/`ETIMEDOUT`
  handling (same pattern as gitleaks — read it yourself, don't assume it
  matches gitleaks' own default).
- `evidenceFields: string[]` — read the real finding-construction code (near
  `mapOsvSeverity()`'s call site) and transcribe the actual field names
  populated on each finding object — confirm whether it matches gitleaks'
  `["tool", "severity", "rule", "path", "line", "msg"]` shape exactly or
  differs (e.g. package name/version/vulnerability id fields specific to
  this adapter) — do not assume it's identical to gitleaks without checking.

This descriptor is a **transcription of existing, already-correct behavior**
— you are not inventing new tool behavior. If you find the header comment's
prose doesn't match the actual code (a real discrepancy), trust the CODE and
flag the mismatch in your report rather than silently picking one.

**Genuine design latitude:** the internal nested shape of
`severityNormalization` and `exitCodeMapping` (must be complete/faithful, key
names are your call), and correctly identifying/documenting the two `null`+
`*Note` fields (`supportedEcosystems`, `networkBehavior`) as honest
"this file doesn't decide this" findings rather than guessed values.

### 2. Context files

- `harness/scripts/security-adapters/osv-scanner.mjs` (read fully) — the file
  you are additively extending. Read its header comment AND the real code of
  `run()`/`isInstalled()`/`checkV2()`/`mapOsvSeverity()` — cross-check the
  comment against the code, do not derive the descriptor from the comment
  alone.
- `harness/scripts/security-scan.test.mjs` (read only the osv-scanner-related
  test blocks — for existing test style precedent; you are NOT modifying
  this file).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` — grep
  for "cap.sca" to confirm the frozen capability-id string.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` §1 row CYB-2D
  only. Do not read other rows.

### 3. DoD checks

- `osv-scanner.mjs`'s existing exports (`name`, `isInstalled`, `run`) and
  internal helpers (`checkV2`, `mapOsvSeverity`, `resolveBinary`,
  `spawnFailure`, `versionMajor`) are byte-unchanged (confirm via `git diff`
  showing only additions, zero modified/deleted lines in existing code).
- New file `harness/scripts/security-adapters/osv-scanner.test.mjs` (does not
  exist yet — you are creating it) contains tests asserting: the descriptor
  exists, is frozen, every fixed field above has its documented value
  (including the two honest-uncertainty fields), and `tool === name` (the
  real export, not a hardcoded duplicate).
- Verify command:
  `node --test harness/scripts/security-adapters/osv-scanner.test.mjs` must
  exit 0.
- **Regression (mandatory, run yourself before reporting done):**
  `node --test harness/scripts/security-scan.test.mjs` has a **known,
  pre-existing, environment-specific failure** unrelated to your work: two
  CLI-smoke sub-checks ("CLI: bare rootDir -> exit 0" and its stdout-verdict-
  line sibling) fail today because the test's spawned child process cannot
  find `git` on its `%PATH%` in this environment. Confirm this exact same
  pair (and no others) is the only failure before AND after your change — if
  a DIFFERENT test starts failing, STOP and report.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch baseline
  is currently noisy for unrelated reasons (confirmed cross-branch gitleaks
  false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: edit ONLY `harness/scripts/security-adapters/osv-scanner.mjs`
  (additive: one new frozen const export + a short top-of-file doc addition,
  no change to any existing function/export). Create ONLY
  `harness/scripts/security-adapters/osv-scanner.test.mjs` (new file).
- Do NOT touch `gitleaks.mjs`, `semgrep.mjs`, `license-check.mjs`,
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
  already-tested production file with a live consumer, plus this adapter has
  the most complex existing exit-code/severity logic of the four (genuine
  transcription-fidelity risk).
- **Worktree: YES** — isolated git worktree, per the body-slicing plan's
  explicit instruction for CYB-2D.
- Profile: standard.
- Tool budget: ≤30 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location, fields `taskId: "CYB-2D-osv-scanner"`, `model`, `rulesetSha`,
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
assumed default (especially the two honest-uncertainty fields), and confirm
the commit SHA you produced (or a clean stop with the reason, per field 5).
