# Prepared Goldfish briefing — CYB-2B: `security-evidence.v2` schema + L3 evaluator core

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND
> the CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is **Wave 2** of that plan: depends on CYB-2A
> (closed, commit `77d2b7d`, `plan-verifier` CONFIRMED-MATCH 10/10) and on
> CYB-1F's F-3 ratification (RATIFIED 2026-07-25, `cyb-1f-schema-boundary-draft.md`
> §7/§10 — the run-outcome → control-result projection). Every other Wave-3
> sub-package (CYB-2C/2D/2G/2H) depends on THIS package landing first — it is
> the second foundation layer. Ruleset SHA `5a60349` (current HEAD at dispatch
> time). **Worktree: no** — new files only, run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 5a60349 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2B/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2B: `security-evidence.v2` schema + pure L3 evaluator (AC1, AC2, AC4, AC5, AC6)

### 1. Goal

Build two things, in one new pair of files:

1. **The `pipeline.security-evidence.v2` schema** — a closed, versioned
   evidence-envelope schema (do NOT reuse or mutate the existing v1 schema
   string `pipeline.security-evidence.v1` used by
   `harness/scripts/security-scan.mjs` — that stays untouched, out of scope,
   a later wave's job). Per AC4/AC5/AC6 the v2 schema must:
   - Require non-empty identity fields for capability, tool, rule-pack/config,
     policy, input, and environment (AC4) — a record missing any one fails
     schema validation.
   - Define closed, normalized schemas for a **finding** envelope and a
     **coverage** record (AC5) — malformed variants must be rejected.
   - Require six always-present fields on the coverage record: exclusions,
     ignored, unsupported-scope, truncation, data-age, plus one more you judge
     necessary to make "exclusions/ignored/unsupported scope/
     truncation/data-age visible" (AC6) fully checkable — empty is valid,
     absent is not.
2. **The pure L3 evaluator function** — consumes a v2 candidate (shaped like
   CYB-2A's `FIXTURE_MATRIX` fixtures' `candidate`/`plan` — see context files)
   and produces, per capability, one of CYB-1F §7's frozen 10-state
   `RUN_OUTCOMES` values (`pass, findings, required-capability-missing,
   unsupported, execution-unavailable, partial-coverage, stale, invalid,
   not-applicable, waived`). This evaluator is what CYB-2A's fixtures are
   waiting for: **every one of the 14 fixtures in
   `security-evidence-fixture-matrix.mjs`'s `FIXTURE_MATRIX` must, when run
   through your real evaluator instead of the temporary
   `evaluateFixturePlaceholder` stub, produce exactly the fixture's own
   `expectedOutcome`.** This is your primary acceptance signal — not a
   separate hand-written test suite disconnected from CYB-2A's work.

Additionally (AC1, using the per-capability outcomes above): a **required
capability left at any non-`pass`/non-`findings`/non-`waived` outcome must
prevent an aggregate green (blocking) verdict** — implement a small,
separate, pure aggregate function that takes the per-capability outcome map
plus the `plan.required`/`plan.optional` split and produces a single
blocking/non-blocking verdict. Keep this aggregate function distinct from the
per-capability evaluator (different granularity, per CYB-1F §7's own note
that the run-outcome enum is explicitly "the **per-capability** run outcome
enum," not an aggregate-verdict enum) — do not conflate the two into one
function.

**Genuine design latitude (deliberate, read carefully):** the exact v2
schema's field names/shape beyond the AC4/AC5/AC6 hard requirements, the
exact per-capability classification logic (how a `status`/`classification`
pair like `{status: "ERROR", classification: "execution_environment"}` maps
to `execution-unavailable` vs `{status: "ERROR", classification:
"scanner_error"}` — both map to the SAME outcome (`execution-unavailable`)
per CYB-2A's own fixtures; confirm this by reading the fixture file's
classification strings directly, do not guess),
and the F-3 run-outcome→control-result projection function's exact shape
beyond the one ratified example (`required-capability-missing → not-met`
under a required policy vs `unavailable` under an optional one,
`cyb-1f-schema-boundary-draft.md` §7) are yours to design. Document every
choice in a top-of-file comment matching CYB-2A/CYB-1a's style. You do NOT
need to wire this into `security-scan.mjs`, `guard-push.mjs`, or the four
real adapters — that is CYB-2E/CYB-2D, separate later waves.

### 2. Context files

- `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` (read
  fully) — CYB-2A's closed fixture matrix. This is your PRIMARY spec: every
  fixture's `candidate`/`plan`/`focusCapabilityId`/`expectedOutcome` is a
  concrete input/output pair your evaluator must satisfy. Read its top-of-file
  comment fully for the design rationale (v1-faithful `candidate.capabilities[]`
  shape, the separate `plan` field, the enum-sharing notes).
- `plugins/pipeline-core/lib/security-evidence-fixture-matrix.test.mjs` (read
  fully) — the negative-gate test harness; you will be replacing what it
  imports from the stub, not this file itself (out of scope to edit, see
  field 4).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §7
  (control-result enum + the run-outcome→control-result projection, F-3
  ratified) and §8 (closed control-catalog field boundary, for
  `evidenceContract` field naming precedent) — read these two sections only.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` §3 rows AC1,
  AC2, AC4, AC5, AC6 only, and §6 (non-goals). Do not read other AC rows.
- `harness/scripts/security-scan.mjs` (read fully, read-only for context) —
  the current v1 aggregator, so your v2 schema's identity/coverage fields are
  recognizably descended from real fields already in use
  (`policy.configurationSha256`, `coverage: {subject, exclusions}`,
  candidate `commit`/`tree`/`inputSha256`), not invented from nothing.
- `plugins/pipeline-core/lib/control-evaluation-receipt.mjs` (read its
  top-of-file comment + exported function signatures only) — CYB-1c's closed
  receipt; your control-result projection's output vocabulary must use
  CYB-1F §7's `met | not-met | not-applicable | unavailable | waived |
  unknown | invalid` enum exactly, for eventual compatibility (you do not
  need to actually call into this module).

### 3. DoD checks

- **Primary acceptance signal:** running all 14 of CYB-2A's `FIXTURE_MATRIX`
  fixtures through your real evaluator (not the stub) produces exactly each
  fixture's own `expectedOutcome`, per `focusCapabilityId` where set (and for
  `focusCapabilityId: null` fixtures — `all-pass`, `changed candidate after
  planning` — your evaluator's per-capability outcomes plus your aggregate
  function together produce the fixture's documented overall expectation:
  `all-pass` → every capability `pass`; `changed candidate after planning` →
  `invalid`, since the candidate-binding mismatch itself is the fault, not
  any individual capability's own tool result — read the fixture's
  `candidateBinding` field and decide how your evaluator surfaces this, and
  document the choice).
- AC1: a required capability at any outcome other than `pass`/`findings`/
  `waived` (i.e. `required-capability-missing`, `unsupported`,
  `execution-unavailable`, `partial-coverage`, `stale`, `invalid`) causes the
  separate aggregate function to report non-green/blocking; a fixture with
  all-required-pass and only-optional-non-pass reports green (mirrors
  `optional-skipped`'s fixture intent).
- AC2: `all-skipped` and `one-required-skipped` produce distinct, stable,
  typed diagnostic detail (not merely the same bare enum value with no
  further distinguishing data) — assert your evaluator's output includes
  enough detail (e.g. which capability, why) to tell the two apart
  programmatically, not just by reading source.
- AC4: a v2 schema-validation function rejects a candidate missing any one of
  the required identity fields (capability, tool, rule-pack/config, policy,
  input, environment) — fixture: mutate a valid candidate to drop one field,
  assert rejection, for at least 2 different fields dropped independently.
- AC5: schema-validation fixtures for a full finding envelope and a full
  coverage record, each with at least one deliberately malformed variant
  rejected.
- AC6: a coverage-record fixture asserts the six required-present fields
  (exclusions/ignored/unsupported-scope/truncation/data-age plus your judged
  addition) are always present even when empty; a record missing one
  entirely (not just empty) is rejected.
- The F-3 projection function: fixture proving the one ratified example
  concretely (`required-capability-missing` run-outcome projects to
  `not-met` when the capability was required by the plan, but to
  `unavailable` when it was optional) using CYB-2A's own
  `one-required-skipped` vs `optional-skipped` fixtures as the two inputs.
- All exported functions are pure (no fs/network access; consuming an
  in-memory candidate object is fine and expected).
- Top-of-file comment documents: the v2 schema's field set and how it
  extends/differs from v1 (never silently reusing the v1 schema string),
  the per-capability classification logic's design choices, the separate
  aggregate-verdict function's existence and why it's kept apart from the
  per-capability evaluator, and the F-3 projection's design choices beyond
  the one ratified example.
- Verify command:
  `node --test plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs`
  must exit 0. Additionally, as a SEPARATE evidence point in your report (not
  a file you're allowed to edit, see field 4): re-run
  `node --test plugins/pipeline-core/lib/security-evidence-fixture-matrix.test.mjs`
  as-is (still importing the OLD stub) — it should still exit 1 exactly as
  before, since you are not touching that file; then, in your own new test
  file, import `FIXTURE_MATRIX` directly and assert your REAL evaluator
  produces the right `expectedOutcome` for all 14 — this is how you prove
  the "flips green one at a time" claim without editing CYB-2A's closed
  files.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline is currently noisy for reasons unrelated to your work (confirmed
  `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` (new file) and
  `plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs` (new
  file).
- Do NOT touch `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs`
  or `.test.mjs` (CYB-2A, closed) — import from them, never edit them. Do NOT
  remove or replace `evaluateFixturePlaceholder`/`NOT_YET_IMPLEMENTED_OUTCOME`
  in that file; they stay until a later, separate cleanup task explicitly
  scoped to do so.
- Do NOT touch any CYB-1 file (`control-catalog-schema.mjs`,
  `control-evaluation-receipt.mjs`, `control-catalog-migration.mjs`,
  `reference-catalog.mjs`, `reference-catalog-views.mjs`,
  `control-waiver-lifecycle.mjs`, or their `.test.mjs` siblings, or
  `governance/security-controls/catalog.json`) — read-only for context.
- Do NOT touch `harness/scripts/security-scan.mjs`, any file under
  `harness/scripts/security-adapters/`, or
  `plugins/pipeline-core/hooks/guard-push.mjs` — read-only for context;
  wiring this evaluator into them is CYB-2E/CYB-2F, separate later waves.
- Do NOT invent a v2 schema string that collides with or silently mutates
  `pipeline.security-evidence.v1` — v2 is additive/new, v1 stays exactly as
  it is.
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
  report immediately (this includes CYB-2A's own test file, which must keep
  exiting 1 unchanged — if your work somehow makes it exit 0 without you
  editing it, something is wrong; stop and report).
- You find that one or more of CYB-2A's 14 fixtures genuinely cannot resolve
  to their documented `expectedOutcome` under any reasonable evaluator design
  (i.e. the fixture itself looks wrong, not your logic) — stop and report the
  specific fixture and discrepancy; do NOT edit CYB-2A's fixture file
  yourself to make it fit.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `5a60349` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in the v2 schema shape, per-capability classification logic, and the F-3
  projection's undrafted remainder (deliberate, per field 1); this is the
  second foundation layer every later CYB-2 wave depends on — highest-stakes
  sub-package in the epic so far after CYB-1F itself.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤40 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-2A precedent, fields `taskId:
  "CYB-2B"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist wiring into `security-scan.mjs`,
  `guard-push.mjs`, or the real adapters — that is later waves.
- Fixtures/tests stay in the suite: every schema-validation and
  projection fixture you write is permanent regression coverage, not a
  scratch check to remove after.

At the end, report back: the diff summary, the exact test command(s) you ran
and their exit codes/output (both your new suite AND the confirmation that
CYB-2A's own suite still exits 1 unchanged), and confirm the commit SHA you
produced (or a clean stop with the reason, per field 5).
