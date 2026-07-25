# Prepared Goldfish briefing — CYB-1g: migration fixture (no silent inherited "met")

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 3 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, `c31f4cc`) and CYB-1b (closed, `0af00ee`), both
> `plan-verifier` CONFIRMED-MATCH — NOT on CYB-1c (receipt), even though the
> AC's wording touches evaluation-result language; see field 1's note on why
> this package does not need CYB-1c's schema. Runs in PARALLEL with CYB-1c
> and CYB-1e — distinct new files, no shared write surface; do not touch any
> file another sibling package might also create (see field 4). Ruleset SHA
> `18685f8` (current HEAD at dispatch time). **Worktree: no** — run directly
> in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 18685f8 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1g/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1g: migration fixture — pre-catalog repository never inherits "met" (AC13)

### 1. Goal

Prove and encode, as a small typed function plus a regression fixture, the
guarantee that **adopting the catalog for the first time never silently
marks a repository's historical state as satisfied**: a repository with no
prior evaluation record must have every applicable control evaluate to
`unknown` or `not-met` — never a `met` inherited from the mere absence of
data. This guards against the natural implementation bug of "no record found
→ default to true/compliant".

Note on scope: AC13's own #41 wording is receipt/evaluation-result-flavored,
but the CYB-1 body-slicing plan deliberately scopes this package to depend
only on CYB-1a+CYB-1b (not CYB-1c, which is dispatched as a sibling in this
same wave and may not exist yet when you start). So model this at the level
CYB-1a/1b already give you: define a small, self-contained function that
takes CYB-1b's `resolveApplicableControls()` output (the applicability
result: which controls apply) plus an **optional prior-state input** (a
plain object/map you define the shape of — e.g. `priorEvaluations` keyed by
control ID, representing whatever a legacy/pre-catalog system might have
recorded, which may be absent entirely), and produces a per-control migration
status using the CYB-1F §7 control-result enum vocabulary (`met | not-met |
not-applicable | unavailable | waived | unknown | invalid`) under one hard
rule: **`met` may only appear for a control if the caller explicitly supplied
a qualifying, non-migration-flagged input for it — absence of prior data, or
any prior-data shape you cannot confidently interpret as a genuine fresh
evaluation, must default to `unknown` (if the control is `applicable`) or
stay consistent with CYB-1b's own non-`met`-producing applicability result
otherwise.** Do not attempt to guess or partially design CYB-1c's future
receipt shape — keep your "qualifying input" concept independent and
self-contained; document this explicitly in your top-of-file comment so
CYB-1c's later author can see this package's assumption and reconcile if
needed (that reconciliation is a later task, not yours).

### 2. Context files

- `plugins/pipeline-core/lib/security-policy-resolver.mjs` (read fully) —
  CYB-1b's closed resolver; your migration function's input is its output
  (`resolvedControls`, each entry's `applicability` value). Read the
  top-of-file design comment for the exact shape.
- `plugins/pipeline-core/lib/security-policy-resolver.test.mjs` — for
  fixture-construction style to reuse.
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (top-of-file
  comment only) — CYB-1a's typed-rejection style to match if your function
  needs to reject a malformed `priorEvaluations` input.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §7
  (control-result enum: `met | not-met | not-applicable | unavailable |
  waived | unknown | invalid` — the vocabulary your migration status output
  must use).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, row AC13
  only — the checkable-criterion wording this task must satisfy verbatim.
  Do not read other AC rows; they belong to other sub-packages.

### 3. DoD checks

- AC13: a fixture repository with **no prior evaluation data at all**
  (`priorEvaluations` absent/empty) resolves every applicable control to
  `unknown` (never `met`, never silently omitted).
- AC13: a fixture with a **prior-data shape that looks legacy/ambiguous**
  (e.g. a bare boolean `true`/a string `"ok"`/`"passed"` per control, not
  your function's own explicitly-defined qualifying shape) is still treated
  as non-qualifying and resolves to `unknown`/`not-met` — never `met`. This
  is the actual "silent inheritance" bug this AC guards against; make the
  fixture concrete (construct a plausible legacy record shape and prove it
  does NOT produce `met`).
- AC13: a fixture with an explicit, well-formed, current qualifying input
  for a control (your function's own defined "this is a genuine fresh
  evaluation" shape) DOES resolve that control to `met` — i.e. the function
  is not permanently `unknown`-locked, only closed against silent/implicit
  inheritance. Document exactly what makes an input "qualifying" in your
  top-of-file comment.
- AC: the function is pure (no fs/network access, no mutation of input
  arguments).
- AC: exported function name/signature documented at the top of the new
  module file, matching CYB-1a/CYB-1b's style, including the explicit
  "qualifying input" definition (see field 1).
- Verify command:
  `node --test plugins/pipeline-core/lib/control-catalog-migration.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` — the
  branch baseline is currently noisy for reasons unrelated to your work
  (confirmed `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/control-catalog-migration.mjs` (new file) and
  `plugins/pipeline-core/lib/control-catalog-migration.test.mjs` (new
  file). Do not touch `control-catalog-schema.mjs`, `.test.mjs`,
  `security-policy-resolver.mjs`, or `.test.mjs` — both closed and
  verified; read-only for context. Do not touch or create any
  `control-evaluation-receipt.*` file (CYB-1c, may be created concurrently
  by a sibling dispatch) or `governance/security-controls/catalog.json`/
  `reference-catalog.*` (CYB-1e, may be created concurrently).
- Do NOT design or partially implement CYB-1c's actual receipt schema —
  your "qualifying input" concept is deliberately your own, independent,
  narrower concept (see field 1).
- Do NOT weaken the "no qualifying input → never `met`" rule for
  convenience (e.g. do not make "any truthy prior value" qualifying) — the
  entire point of this AC is that the bar for `met` is deliberately high.
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
- Any test outside this new file's own suite starts failing — stop and
  report immediately.
- You find that a self-contained "qualifying input" concept genuinely cannot
  be defined without CYB-1c's actual receipt schema (i.e. field 1's approach
  turns out to be unworkable, not just unfamiliar) — stop and report; that
  would mean the body-slicing plan's dependency assignment for this
  sub-package needs revisiting, which is an Elephant-level call.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `18685f8` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in defining the "qualifying input" concept independently of CYB-1c
  (deliberate, per field 1), and the AC guards a security-relevant failure
  mode (silent compliance inheritance) where an under-specified fix would be
  a real regression risk.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-1g"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist adding a CLI wrapper or `verify.mjs`
  registry wiring.
- Fixtures stay in the suite: all constructed fixture prior-states are
  permanent regression coverage, not scratch checks to remove after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
