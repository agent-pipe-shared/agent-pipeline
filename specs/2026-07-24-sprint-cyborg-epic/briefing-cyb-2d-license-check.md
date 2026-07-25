# Prepared Goldfish briefing — CYB-2D/license-check: v2 control-contract descriptor

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND the
> CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3, CYB-2D** of that plan: depends
> only on CYB-2B (closed, commit `48d481b`). This is ONE of four
> file-independent siblings (gitleaks/osv-scanner/semgrep/license-check) —
> each dispatched separately, in an **isolated git worktree**, because this
> task edits a live, already-tested production file with a live consumer
> (`security-scan.mjs`). Do not assume any sibling's file exists or has
> changed — you cannot see their worktrees. Ruleset SHA `d364d8c` (current
> HEAD at dispatch time). **This is the one CYB-2D sibling that is NOT a
> `cap.*` capability** — per CYB-1F's ratified F-4, license-check is a
> catalog CONTROL, never a capability-root verdict. Read field 1 carefully;
> your descriptor's `kind` must be `"control"`, not `"capability"`.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset d364d8c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2D-license-check/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2D/license-check: add a v2 control-contract descriptor to `license-check.mjs`

### 1. Goal

Add exactly ONE new export to
`harness/scripts/security-adapters/license-check.mjs`:

```js
export const CAPABILITY_CONTRACT_V2 = Object.freeze({ ... });
```

(Same export NAME as its three siblings, for uniform consumption by CYB-2E
later — even though this file's `kind` is `"control"` not `"capability"`,
keep the export identifier identical.)

This is a **pure, static, additive data descriptor** — a machine-readable
transcription of behavior this file **already has and already documents** in
its own header comment. You are NOT changing `run()`, `isInstalled()`, or any
existing behavior. Do NOT touch those functions' bodies at all.

**FIXED SHAPE — every one of these exact field names is required, across all
four sibling adapters (you will not see the others, but the shape must match
what their own briefings mandate — do not invent your own alternative
names):**

- `contractVersion: "v2"` (literal string)
- `tool: name` (reuse this file's own existing `name` export)
- `kind: "control"` (per CYB-1F's ratified F-4: license-check is a catalog
  CONTROL, never a `cap.*` capability family — this is the one sibling where
  `kind` is NOT `"capability"`)
- `capabilityId: null` (not applicable)
- `controlRef` — grep
  `governance/security-controls/catalog.json` yourself for any control entry
  whose `verifierType` is `"license-check"` or whose `id` otherwise names
  license checking. **Report exactly what you find.** If NO such control
  entry exists in the live catalog today (this is plausible — F-4 ratifies
  the *principle* that license-check is a control, not that a concrete
  catalog entry for it already exists), set `controlRef: null` with an
  adjacent `controlRefNote: "no matching control entry exists in governance/security-controls/catalog.json today; F-4 ratifies the principle that license-check is a catalog control, not that a concrete entry currently exists"` —
  do NOT invent a `ctl.*` id that isn't actually in the live catalog file.
- `supportedEcosystems: null` (license-check operates on a project's own
  declared dependency list, `third-party-licenses.json`, not a scanned
  ecosystem)
- `toolVersionConstraint: null` (this adapter has NO external binary at all —
  "PURE NODE, NO BINARY" per its own header comment — so no tool-version
  concept applies)
- `networkBehavior: "offline"` (reads two local JSON files via `node:fs`
  only — confirm by reading the whole file, there is no `child_process`
  import here at all)
- `requiredInputs: ["config.allowlistPath", "config.declaredPath"]` (the two
  real inputs `run()` consumes — confirm against the actual function
  signature/body; both are resolved to absolute paths by the runner
  (`security-scan.mjs`), not by this file itself)
- `severityNormalization` — a plain data transcription of the REAL,
  already-documented fixed rule ("license-check violations → high", every
  finding severity fixed) — same transcription discipline as its siblings.
- `confidenceNormalization: null` (no confidence signal exists here).
- `coverageLimitations: string[]` — at least one factual, code-grounded entry
  (e.g. "only covers dependencies explicitly declared in the project's own
  `third-party-licenses.json` — an unlisted/undeclared dependency's license
  is invisible to this check entirely, it is not itself discovered from a
  lockfile or package manifest" — verify against the real behavior: does
  `run()` cross-reference any lockfile itself, or purely trust the declared
  file? Read the code to confirm before asserting this).
- `exitCodeMapping: null` with an adjacent
  `exitCodeMappingNote: "this adapter never spawns a child process (no external binary), so no OS exit-code contract applies; its result derivation is entirely in-process file-read + JSON-parse + comparison logic"` —
  do not force a `{"0": ..., "nonzero": ...}` shape onto a file that has no
  exit codes at all; the honest `null` + note is correct here, unlike its
  three binary-backed siblings.
- `timeoutContract: { defaultMs: null, cancellable: false, mechanism: "none — no child process is spawned, nothing to time out or cancel" }` —
  confirm this is accurate by checking there is genuinely no `timeoutMs`
  parameter or spawn call anywhere in this file.
- `evidenceFields: string[]` — read the real finding-construction code and
  transcribe the actual field names populated on each finding object; note
  in your report whether this shape matches its binary-backed siblings
  (`tool`/`severity`/`rule`/`path`/`line`/`msg`) or differs (e.g. dependency
  name/version/license-specific fields) — do not assume without checking.

This descriptor is a **transcription of existing, already-correct behavior**
— you are not inventing new tool behavior. If you find the header comment's
prose doesn't match the actual code (a real discrepancy), trust the CODE and
flag the mismatch in your report rather than silently picking one.

**Genuine design latitude:** the internal nested shape of
`severityNormalization` (must be complete/faithful), and — the one item with
real ambiguity here — precisely how you word `controlRefNote` and
`coverageLimitations` depending on what you actually find in the live
catalog (report your finding explicitly either way: entry found vs. no entry
found).

### 2. Context files

- `harness/scripts/security-adapters/license-check.mjs` (read fully) — the
  file you are additively extending. Read its header comment AND the real
  code of `run()`/`isInstalled()` — cross-check the comment against the
  code.
- `harness/scripts/security-scan.test.mjs` (read only the license-check-
  related test blocks — for existing test style precedent; you are NOT
  modifying this file).
- `governance/security-controls/catalog.json` (read fully, short) — to
  determine `controlRef` (grep for `"license"` and for
  `"verifierType": "license-check"` yourself).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` — grep
  for "F-4" / "license-check" to confirm the ratified "control not capability"
  principle and its exact wording.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-body-slicing.md` §1 row CYB-2D
  only. Do not read other rows.

### 3. DoD checks

- `license-check.mjs`'s existing exports (`name`, `isInstalled`, `run`) are
  byte-unchanged (confirm via `git diff` showing only additions).
- New file `harness/scripts/security-adapters/license-check.test.mjs` (does
  not exist yet — you are creating it) contains tests asserting: the
  descriptor exists, is frozen, `kind === "control"` (NOT `"capability"`),
  `capabilityId === null`, every fixed field above has its documented value,
  and `tool === name` (the real export, not a hardcoded duplicate).
- `kind` is never `"capability"` and `capabilityId` is never a `cap.*` string
  anywhere in the descriptor — assert this explicitly with a dedicated test,
  since this is the one sibling where getting `kind` wrong would silently
  violate CYB-1F's ratified F-4.
- Verify command:
  `node --test harness/scripts/security-adapters/license-check.test.mjs`
  must exit 0.
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

- Scope: edit ONLY `harness/scripts/security-adapters/license-check.mjs`
  (additive: one new frozen const export + a short top-of-file doc addition,
  no change to any existing function/export). Create ONLY
  `harness/scripts/security-adapters/license-check.test.mjs` (new file).
- Do NOT touch `gitleaks.mjs`, `osv-scanner.mjs`, `semgrep.mjs`,
  `security-scan.mjs`, `security-scan.test.mjs`, `guard-push.mjs`,
  `governance/security-controls/catalog.json`, or any CYB-1/CYB-2 file — the
  catalog file is READ-ONLY context for determining `controlRef`, never
  edited.
- Do NOT wire this descriptor into `security-scan.mjs`'s aggregation logic —
  that is CYB-2E's job, a later, separately-serialized wave.
- Do NOT invent a `ctl.*` control id for `controlRef` that does not
  genuinely exist in the live catalog file today.
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
  already-tested production file with a live consumer, and is the one
  sibling with a genuine F-4-compliance risk (`kind`/`capabilityId` must
  never drift into capability-shaped values) — a subtle mistake here would
  silently violate an already-ratified epic-level decision.
- **Worktree: YES** — isolated git worktree, per the body-slicing plan's
  explicit instruction for CYB-2D.
- Profile: standard.
- Tool budget: ≤30 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location, fields `taskId: "CYB-2D-license-check"`, `model`, `rulesetSha`,
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
confirmation), whether a matching `controlRef` catalog entry actually exists
today (report either finding explicitly), any field value you had to correct
from this briefing's assumed default, and confirm the commit SHA you produced
(or a clean stop with the reason, per field 5).
