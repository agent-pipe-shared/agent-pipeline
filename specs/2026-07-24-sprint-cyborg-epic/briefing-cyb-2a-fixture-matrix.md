# Prepared Goldfish briefing — CYB-2A: 15-fixture failure-class matrix (foundation)

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND
> the CYB-2 body-slicing plan itself approved by the PO 2026-07-25 ("cyb 2
> plan approved", as-is, no deviations) — see
> `cyb-2-body-slicing.md` status line. This is **Wave 1** of that plan: the
> foundation, nothing else in CYB-2 starts before this exists, analogous to
> CYB-1a. Depends only on CYB-1F's frozen vocabulary (closed, ratified).
> Ruleset SHA `589fbcc` (current HEAD at dispatch time). **Worktree: no** —
> new files only, run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 589fbcc loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2A/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-2A: fixture matrix for the 15 failure/compatibility classes (AC12, scaffolds AC1-3,6,7,9-11)

### 1. Goal

Per `cyb-2-feature-spec.md` §4 and spec.md §5's explicit "negative gates
first" instruction: build the **fixture matrix** — one named fixture per
failure/compatibility class below — that must exist and **fail
meaningfully** now, before any real evaluator exists, then flip green one at
a time as CYB-2B (a separate, later sub-package) builds the evaluator. You
are NOT building the evaluator. You are building the fixtures and a
deliberately-not-yet-passing test harness around them.

The 15 classes, verbatim from the feature-spec (do not rename, merge, or
drop any):

1. all-pass
2. blocking+non-blocking findings
3. all-skipped
4. one-required-skipped
5. optional-skipped
6. empty/stale rule pack
7. unsupported language
8. environment execution failure
9. timeout/cancellation
10. partial/truncated coverage
11. malformed output
12. version/config/policy drift
13. changed candidate after planning
14. cross-platform tool resolution

(Yes — the feature-spec's own prose lists fourteen comma-separated items
under a "fifteen fixtures" claim. Do not silently resolve this by inventing
a fifteenth or by relabeling one item as two. Count the prose items exactly
as written, and if your count is 14 not 15, **report this discrepancy
explicitly in your final report** — do not silently pick a resolution. This
is a genuine spec-precision gap for the Elephant to reconcile, not yours to
paper over.)

**Genuine design latitude:** each fixture is a plain data object shaped like
a raw adapter/aggregator input (a "candidate" — an evidence-shaped record
consistent with the *existing* v1 shape you'll find in
`harness/scripts/security-scan.mjs` and the four adapters, since v2 does not
exist yet) representing that failure class, PLUS an "expected outcome"
annotation using the CYB-1F-ratified 10-state run-outcome enum (`pass,
findings, required-capability-missing, unsupported, execution-unavailable,
partial-coverage, stale, invalid, not-applicable, waived`) that a future
evaluator should eventually produce for it. You choose:
- the exact fixture object shape (keep it plausible relative to the real
  adapters' `{status, classification, findings, raw, reason}` v1 shape —
  don't invent unrelated fields),
- how the test proves "fails meaningfully now": the cleanest approach is a
  small **stub/placeholder evaluator function you write in this same
  package** (e.g. `evaluateFixturePlaceholder()`) that deliberately always
  returns a fixed non-matching status (or throws a typed
  `NOT_YET_IMPLEMENTED` error) — NOT a real evaluator, just enough scaffolding
  that each fixture's test assertion against its "expected outcome" fails
  today in an intentional, readable way (a clear assertion mismatch/typed
  error), rather than a generic import-crash. Document this choice at the
  top of the file.
- You do NOT design the real evaluator's logic, capability-plan matching, or
  schema validation — that is CYB-2B's job, dispatched later as its own
  briefing. Your stub must be trivially replaceable/removable when CYB-2B's
  real evaluator lands (keep it in one clearly-marked function, not spread
  across the file).

### 2. Context files

- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` §3 (AC1-12
  rows only, for what each fixture class needs to eventually prove), §4 (the
  fixture-class list, quoted above — read the source for exact wording) and
  §6 (non-goals) in full. Do not read other sections.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §7
  (the ratified 10-state run-outcome enum) — read this section only, for the
  exact enum member spellings your "expected outcome" annotations must use.
- `harness/scripts/security-scan.mjs` (read fully) — the current v1
  aggregator; your fixtures' "candidate" shape should be recognizably
  derived from what this file actually consumes/produces today (do not
  invent a shape unrelated to the real adapters).
- `harness/scripts/security-adapters/gitleaks.mjs` (read fully, shortest of
  the four) — the current v1 per-adapter result shape
  (`{status, classification, findings, raw, reason?}`), for fixture
  plausibility.
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read its
  top-of-file comment only) — for this repo's established
  documentation-style precedent (top-of-file design-choice comment), which
  your new file must follow.

### 3. DoD checks

- All 15 (or, if your literal count is 14, all counted-and-reported) fixture
  classes from §4 exist as distinct, named fixture objects — no class
  merged into another, none silently dropped.
- Each fixture has: (a) a plausible input shape derived from the real v1
  adapter/aggregator shape, (b) an explicit "expected outcome" annotation
  using an exact CYB-1F §7 enum member spelling.
- Running the test file now (before any real evaluator exists) produces
  **meaningful, readable failures** — not passes, not a generic
  module-not-found crash. Each fixture's failure output should make clear
  *which* fixture and *why* it doesn't yet resolve to its expected outcome.
- Your stub/placeholder evaluator function is isolated in one clearly-marked
  location (e.g. top of file, clearly commented "REPLACE WHEN CYB-2B LANDS")
  — not scattered.
- All exported functions/fixtures are pure (no fs/network access beyond
  reading nothing at all — these are in-memory literals, no file I/O
  needed).
- Top-of-file comment documents: the fixture-shape design choice, the
  stub-evaluator mechanism and why it's temporary, and a note for the next
  reader that CYB-2B's real evaluator replaces the stub and should make
  these tests pass one at a time, never all at once by accident.
- Verify command:
  `node --test plugins/pipeline-core/lib/security-evidence-fixture-matrix.test.mjs`
  must exit **non-zero** right now (this is the point — negative gates
  first) with clear per-fixture failure messages. Confirm this exit code
  explicitly in your report; a zero exit here would mean you built
  something that already (accidentally) satisfies the evaluator, which
  would defeat the entire purpose of this sub-package.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline is currently noisy for reasons unrelated to your work (confirmed
  `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output (including the intentional failure output) is
  your evidence artifact — never prose you compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` (new
  file) and
  `plugins/pipeline-core/lib/security-evidence-fixture-matrix.test.mjs` (new
  file). Do not touch any existing CYB-1 file
  (`control-catalog-schema.mjs`, `control-evaluation-receipt.mjs`,
  `control-catalog-migration.mjs`, `reference-catalog.mjs`,
  `reference-catalog-views.mjs`, `control-waiver-lifecycle.mjs`, or any of
  their `.test.mjs` siblings, or `governance/security-controls/catalog.json`)
  — all closed, read-only for context only.
- Do NOT touch `harness/scripts/security-scan.mjs`, any file under
  `harness/scripts/security-adapters/`, or
  `plugins/pipeline-core/hooks/guard-push.mjs` — read-only for context;
  migrating/wiring these is later CYB-2 waves (2D/2E/2F), not this task.
- Do NOT build a real evaluator, capability-resolution logic, or
  `security-evidence.v2` schema — that is CYB-2B, a separate later briefing.
  Your stub exists ONLY to make the negative-gate fixtures fail meaningfully
  today; keep it minimal and clearly marked as a placeholder.
- Do NOT silently resolve the "14 vs 15" fixture-count discrepancy in §4 by
  inventing content — report it.
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
  report immediately (there should be none, since nothing existing is
  touched).
- You find the fixture matrix genuinely cannot be built without first
  knowing the real evaluator's shape (i.e., the "expected outcome" concept
  from CYB-1F §7 turns out to be insufficient to annotate a fixture) — stop
  and report the specific gap; that is an Elephant-level call.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `589fbcc` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in fixture shape and the stub-evaluator mechanism (deliberate, per field
  1), and this is the foundational Wave-1 sub-package every later CYB-2
  wave depends on — matching the CYB-1a foundational-contract precedent.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-2A"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist building any part of the real evaluator,
  a CLI wrapper, or `verify.mjs` registry wiring.
- Fixtures stay in the suite: all 15 (or 14, per your honest count) fixture
  objects and their expected-outcome annotations are permanent regression
  material that CYB-2B will later flip green one at a time — never delete or
  simplify them after this task.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output (must be non-zero, with readable per-fixture failure
messages), the honest 14-vs-15 fixture-count finding, and confirm the commit
SHA you produced (or a clean stop with the reason, per field 5).
