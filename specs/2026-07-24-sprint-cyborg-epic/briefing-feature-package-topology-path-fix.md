# Prepared Goldfish briefing — feature-package-topology path-normalization fix

> **Status: PREPARED, NOT YET DISPATCHED.** Authored as Elephant design-phase
> work per PO approval of decision D (Windows-slice sequencing, 2026-07-25).
> `planApproved` for `sprint-cyborg-epic` is still mechanically `false`
> (blocked by the confirmed `PO-PROFILE-RECEIPT-INVALID`, Bug 2 — see
> `docs/state.md`), so this briefing is prepared, not dispatched. Refresh the
> ruleset SHA in field 6 to the actual HEAD at dispatch time before sending.
> Windows-slice sequencing item 1 (`windows-sandbox-assurance-slice-scope.md`).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset {{RULESET_SHA — fill with actual HEAD at dispatch}} loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing WIN-FPT-1/2026-07-25 · Role Goldfish

---

## Briefing WIN-FPT-1: fix native-Windows path-normalization bug in `canonicalRelative`

### 1. Goal

`plugins/pipeline-core/lib/feature-package-topology.test.mjs` passes when run
via `node --test plugins/pipeline-core/lib/feature-package-topology.test.mjs`
on native Windows (currently fails: `AssertionError: false !== true` at the
`validateFeatureTopology(root).ok` assertion). The fix must NOT weaken or
delete the safety check `canonicalRelative` performs (rejecting absolute
paths, `..`/`.`/empty segments, and literal backslashes) — it must only stop
the check from spuriously rejecting a VALID forward-slash relative path on
win32.

### 2. Context files

- `plugins/pipeline-core/lib/feature-package-topology.mjs` (the contract —
  function `canonicalRelative`, currently around line 25-32; also read
  `regularFile`, `walk`, and `inventoryFeaturePackages` in the same file for
  how the function's return value is consumed)
- `plugins/pipeline-core/lib/feature-package-topology.test.mjs` (the failing
  test — the ONLY test file for this module; do not add a second test file)
- `backlog/items/2026-07-25-windows-verify-brittle-test-hygiene.md` (the
  confirmed root-cause writeup — read the "Correction" section; it already
  identifies the exact defect and reproduction)

Confirmed root cause (already isolated, do not re-derive from scratch): the
plain `import { normalize } from "node:path"` resolves to `path.win32` on
native Windows. `path.win32.normalize("specs/safe-feature/prd.md")` returns
`"specs\\safe-feature\\prd.md"` — backslash-separated — which is never
`===` to the original forward-slash `value`, so the `cleaned !== value` check
in `canonicalRelative` rejects every legitimately-safe artifact path as
`"unsafe path"` on win32.

### 3. DoD checks

- AC: `node --test plugins/pipeline-core/lib/feature-package-topology.test.mjs`
  exits 0 on native Windows (verify this specific command yourself with
  `node --test`, not just the full suite runner).
- AC: the existing test's three assertions (clean fixture validates `ok:
  true`; a valid `planFeaturePackageTransition` returns `status: "preview"`;
  a tampered digest produces a `/digest does not bind/` finding) all still
  pass unchanged — do not edit the test's existing assertions.
- AC: `canonicalRelative` still rejects: an absolute path, a path containing
  `..` or `.` segments, an empty segment, and a path containing a literal
  backslash. Add a NEW fixture case (in the same test file, following its
  existing style) that asserts a clean forward-slash relative path (e.g.
  `"specs/safe-feature/prd.md"`) validates OK — this is the regression
  guard for the exact bug being fixed; do not skip adding it.
- Verify command: `node harness/scripts/verify.mjs` — must exit 0 (or at
  minimum: the `feature-package-topology-tests` suite specifically must now
  pass; if other pre-existing unrelated suites are still red on this host,
  that is expected per the documented native-Windows baseline in
  `docs/state.md` — do not attempt to fix unrelated suites).
- Its machine-written output (evidence/verify-latest.json or the direct
  `node --test` output) is your evidence artifact — never prose you compose.

### 4. Forbidden

- Scope: touch ONLY `plugins/pipeline-core/lib/feature-package-topology.mjs`
  and `plugins/pipeline-core/lib/feature-package-topology.test.mjs`. Any other
  file is out of scope.
- Do not change the test's three EXISTING assertions — only ADD the new
  forward-slash-path regression case.
- No-go paths: `.claude/**`, any file under `plugins/pipeline-core/hooks/**`,
  any other `lib/*.mjs` file.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.
- Do not touch `license-contract`'s file-mode assertion or anything under
  `check-license-contract.mjs`/`.test.mjs` — that finding was reclassified
  into a SEPARATE item (#35) and is explicitly out of scope for this task.
- Do not "fix" this by making `canonicalRelative` accept backslash paths, by
  deleting the `cleaned !== value` check outright, or by special-casing
  `process.platform === "win32"` to skip the safety check entirely — the
  check must remain platform-independent and equally strict; only the
  comparison mechanism may change (e.g. compare against a POSIX-normalized
  form, or perform the safety validation without going through a
  platform-dependent `normalize()` at all).

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The fix requires touching `regularFile`, `walk`, or `inventoryFeaturePackages`
  beyond a read — stop and report (the bug is isolated to `canonicalRelative`;
  if that turns out to be wrong, that is new information the Elephant needs).
- Any other suite in `verify.mjs` appears to newly fail because of this
  change (regression outside scope) — stop and report immediately, do not
  attempt to fix the regression yourself.
- Missing access/tool/permission.
- Genuine ambiguity the briefing does not resolve.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `{{FILL AT DISPATCH TIME — current HEAD}}` (this
  briefing was authored against `7f54f6d83739691679af2238f5bc3f79d2e24359`;
  do not dispatch against a stale SHA without refreshing this field).
- Model/effort: the implement-tier model / medium (`goldfish-implementor`) —
  this is a narrow, well-understood, already-isolated bugfix with a named
  root cause and fix direction; no design latitude, so the mechanic tier
  would also be defensible, but the bugfix reproduce-first discipline (field
  3) argues for implementor tier's fuller report format.
- Worktree: no — single small file pair, no parallel-dispatch conflict risk
  expected for this task in isolation (confirm against calibration
  `.claude/pipeline.json` `"worktree": "optional"` at actual dispatch time).
- Profile: standard.
- Tool budget: ≤30 tool uses.
- Dispatch record: write `dispatch-record.json` next to the evidence artifact
  per the standard template fields (`taskId: "WIN-FPT-1"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`).

---

## BUGFIX module (applies per template)

- Reproduce-first: run `node --test plugins/pipeline-core/lib/feature-package-topology.test.mjs`
  BEFORE writing any fix and confirm it fails with the exact error above —
  this is your RED baseline evidence.
- Root-cause-only: fix only `canonicalRelative`'s normalize()-dependent
  comparison. No incidental cleanup of the rest of the file.
- Renames separate: if the fix suggests a helper rename, do NOT do it here —
  file it as a follow-up note in your final report instead.
- Repro stays in the suite: the new forward-slash-path fixture case is
  permanent regression coverage, not a scratch check to remove after.
