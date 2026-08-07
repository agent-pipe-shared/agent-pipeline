# Prepared Goldfish briefing — CYB-2G: read-only capability-completeness preflight extension (AC10)

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND
> the CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3** of that plan. Per the plan's
> own table this sub-package depends only on CYB-1F's frozen `cap.*` roots
> (already ratified) — it does NOT depend on CYB-2B/2C landing first,
> deliberately, to stay parallel-safe. Runs in parallel with CYB-2C/2D/2H.
> **This is the one Wave-3 sub-package that EDITS an existing production
> file** (`plugins/pipeline-core/scripts/toolchain-preflight.mjs`) rather
> than only adding new files — read field 4 carefully; your edit must be
> strictly additive (one new exported function), never touching the
> existing `runToolchainPreflight()` function's own logic/behavior. Ruleset
> SHA `3da3ee8` (current HEAD at dispatch time). **Worktree: no** — the edit
> is additive-only and the file has no other concurrent Wave-3 consumer
> (confirmed: none of CYB-2C/2D/2H touch this file or
> `tool-identity.mjs`).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 3da3ee8 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2G/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2G: capability-completeness read-only preflight extension

### 1. Goal

`plugins/pipeline-core/scripts/toolchain-preflight.mjs` currently reports
per-**tool** readiness (`node`, `git`, `gitleaks`, `osv-scanner`, `semgrep`,
`license-check` — see `FIXED_TOOLS`), each with a status like `ready`,
`binary_missing`, etc. (read the file fully to see the exact status
vocabulary). AC10 needs a **capability-level** view on top of this: given a
list of required `cap.*` capability-root ids (CYB-1F's frozen roots:
`cap.secrets`, `cap.sca`, `cap.sast`, `cap.container`, `cap.iac`,
`cap.dast`, `cap.ai-agent`, and any others named in the catalog — read
`governance/security-controls/catalog.json`'s `capabilityRequirements`
fields for the exact set actually in use), report for each: **required,
available, missing, unsupported, or optional** — read-only, zero repo
mutation.

Add exactly ONE new exported function to this file (do not touch the
existing `runToolchainPreflight()` function's own body/logic/behavior) that:
1. Takes the ALREADY-COMPUTED result of `runToolchainPreflight()` (its
   `results` array, tool → status) plus a caller-supplied
   `requiredCapabilities: string[]` (a list of `cap.*` ids) as input — do
   NOT re-run any probe or touch the filesystem/git yourself; derive
   everything from the already-computed preflight result object passed in.
2. Maps each relevant tool to its capability root (`gitleaks`→`cap.secrets`,
   `osv-scanner`→`cap.sca`, `semgrep`→`cap.sast`; `license-check` is a
   catalog CONTROL not a capability family per CYB-1F's ratified F-4 — do
   NOT invent a `cap.license` root; if you need to represent it, do so as
   informative-only detail, never as a required/missing/unsupported
   capability-root verdict). `node`/`git` are toolchain prerequisites, not
   security capabilities — exclude them from the capability-level report
   entirely.
3. Produces, per requested `cap.*` id: `"required"` (in the caller's list
   and the underlying tool is ready), `"missing"` (in the caller's list, the
   tool exists in `FIXED_TOOLS` but isn't ready — binary missing, invalid,
   etc.), `"unsupported"` (in the caller's list but no known tool maps to
   this `cap.*` root at all in this codebase today), or `"optional"` (a
   `cap.*` root the underlying preflight found information about but the
   caller did NOT list as required). Document your exact five-state
   decision logic in the top-of-file comment addition.
4. Performs **zero filesystem/git mutation** — prove this explicitly with a
   test that snapshots `git status --porcelain` (or an equivalent tracked
   diff) before and after calling your new function and asserts it is
   byte-identical.

**Genuine design latitude:** the exact function name/return shape (document
it), and precisely how you represent `license-check`'s non-capability status
in the report (informative field vs. simply omitted) — your call, documented.

### 2. Context files

- `plugins/pipeline-core/scripts/toolchain-preflight.mjs` (read fully) — the
  file you are additively extending. Read `FIXED_TOOLS`, `result()`,
  `actionableResult()`, `overallStatus()`, and `runToolchainPreflight()`'s
  full body to understand the exact status vocabulary and result shape your
  new function consumes.
- `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs` (read fully,
  if it exists at this path — locate it via the same directory) — existing
  test style/precedent for this file, including any existing zero-mutation
  assertion pattern already in use (reuse it rather than inventing a new
  one).
- `governance/security-controls/catalog.json` (read fully, short) — for the
  real `cap.*` roots actually named by `capabilityRequirements` across the
  live catalog controls.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` — grep
  for "capability family" / "thirteen roots" (F-1 ratified) for the frozen
  full `cap.*` root list, read only that section.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` §3 row AC10
  only. Do not read other AC rows.

### 3. DoD checks

- New function is a pure, additive export; `runToolchainPreflight()`'s own
  code is byte-unchanged (confirm via `git diff` showing only additions, no
  modified lines inside that function).
- Given a caller-supplied `requiredCapabilities` list and a
  `runToolchainPreflight()`-shaped input, each of the five states
  (required/available.../missing/unsupported/optional) is exercised by at
  least one fixture (construct synthetic preflight-result-shaped inputs in
  your test file rather than requiring real scanner binaries to be
  installed on the test machine).
- `license-check` is never reported as a `cap.*` capability-root verdict.
- Zero-mutation proof: a test asserts the repo's tracked-file diff (or
  equivalent read-only check) is empty before and after invoking your new
  function.
- Top-of-file comment addition documents the function's shape, the tool→
  capability mapping, the five-state decision logic, and the
  `license-check`-is-not-a-capability design note.
- Verify command:
  `node --test plugins/pipeline-core/scripts/toolchain-preflight.test.mjs`
  must exit 0 (your new tests plus all pre-existing tests in this same
  file, since you are extending the existing file's own test file — see
  field 4 for exactly what you may add there).
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline is currently noisy for reasons unrelated to your work (confirmed
  `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: edit ONLY `plugins/pipeline-core/scripts/toolchain-preflight.mjs`
  (additive: one new exported function + its top-of-file doc addition, no
  changes to any existing function's logic) and its existing test file at
  `plugins/pipeline-core/scripts/toolchain-preflight.test.mjs` (additive:
  new test cases only, do not modify/delete any existing test case). Do not
  create any new file for this task.
- Do NOT touch `plugins/pipeline-core/scripts/tool-identity.mjs`,
  `plugins/pipeline-core/scripts/security-readiness/*`, any CYB-1 file,
  `security-evidence-fixture-matrix.mjs`/`.test.mjs` (CYB-2A),
  `security-evidence-evaluator.mjs`/`.test.mjs` (CYB-2B), or
  `governance/security-controls/catalog.json` — all read-only for context.
- Do NOT touch or create any file a sibling Wave-3 dispatch (CYB-2C's plan
  builder, CYB-2D's four adapter files, CYB-2H's migration fixture) might
  also create.
- Do NOT change `runToolchainPreflight()`'s existing behavior, return
  shape, exit codes, or probe logic in any way — this must be a strictly
  additive change with zero behavioral diff to existing callers.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; use the exact existing paths (both already
  tracked, no pathspec/`git add` needed for new files here since none are
  created).

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope, or requires
  ANY change to `runToolchainPreflight()`'s existing logic to work — stop
  and report; that would mean the "purely additive" design assumption in
  this briefing was wrong, an Elephant-level call.
- Any pre-existing test in `toolchain-preflight.test.mjs` starts failing —
  stop and report immediately; you must not have modified it if this
  happens, so this signals your NEW code broke something via a shared
  import/module-level side effect, which needs investigation, not a
  workaround.
- No `toolchain-preflight.test.mjs` file exists at all at the expected path
  — stop and report the actual location/absence rather than guessing where
  to create test coverage instead.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `3da3ee8` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: this task edits a live,
  already-tested production file (unlike CYB-2A/2B/2C/2H's new-file-only
  scope) and carries genuine design latitude in the tool→capability mapping
  and five-state logic; an under-specified additive edit here still risks
  a shared-module regression if module-level state or imports interact
  unexpectedly with the existing function.
- Worktree: no — additive-only edit, no concurrent Wave-3 consumer of this
  file.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-2A/2B/2C precedent, fields `taskId:
  "CYB-2G"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist wiring this into `security-scan.mjs`,
  `guard-push.mjs`, or a CLI flag — that is later waves' job, if ever.
- Fixtures stay in the suite: all constructed capability-completeness
  fixtures and the zero-mutation proof are permanent regression coverage,
  not scratch checks to remove after.

At the end, report back: the diff summary (confirm it is purely additive —
no existing line changed), the exact test command you ran and its exit
code/output, the tool→capability mapping and five-state logic you designed,
and confirm the commit SHA you produced (or a clean stop with the reason,
per field 5).
