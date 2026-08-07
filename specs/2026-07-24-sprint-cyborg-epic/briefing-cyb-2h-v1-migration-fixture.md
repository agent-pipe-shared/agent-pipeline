# Prepared Goldfish briefing — CYB-2H: v1→v2 migration fixture (AC11)

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND
> the CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3** of that plan: depends only on
> CYB-2B (closed, commit `48d481b`, `plan-verifier` CONFIRMED-MATCH 19/19).
> Runs in parallel with CYB-2C/2D/2G — distinct new files, no shared write
> surface; do not touch any file a sibling Wave-3 dispatch might also
> create. Ruleset SHA `5e20bc1` (current HEAD at dispatch time). **Worktree:
> no** — new file only, run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 5e20bc1 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2H/2026-07-25

---

## Briefing CYB-2H: v1 evidence evaluated under v2 policy is rejected, never silently accepted (AC11)

### 1. Goal

Per `cyb-2-feature-spec.md` AC11: prove that a **v1-shaped evidence record**
(the schema string `pipeline.security-evidence.v1`, as actually produced by
`harness/scripts/security-scan.mjs` today) **cannot silently satisfy** the
new v2 blocking-completeness policy. Concretely: write a fixture/test module
that constructs a realistic v1 evidence record and asserts that passing it
into CYB-2B's v2 schema validator (`validateSecurityEvidenceV2` or
equivalent — see context files for the exact exported name) is **rejected**
— never silently accepted as a complete/valid v2 record, and never coerced/
auto-upgraded into passing.

This is a **fixture/test-only task**: you are not writing a migration tool,
not writing an upgrade path, not changing `security-scan.mjs`'s real output.
You are proving, with a concrete constructed example plus assertions, that
the schema boundary between v1 and v2 is enforced rather than accidentally
permissive (e.g. because v2's validator happens to only check for the
presence of fields that v1 also happens to have, letting a v1 record slip
through unnoticed).

**Genuine design latitude (small, but real):** exactly how "realistic" your
v1 fixture is (a literal object literal shaped like `security-scan.mjs`'s
real output, or a minimal-but-representative subset) and whether you also
demonstrate a **second**, more subtle case — a v1 record that has been
naively relabeled with the v2 schema string but keeps its v1 field shape
underneath (i.e. someone changes only `schema: "pipeline.security-evidence.v1"`
to `schema: "pipeline.security-evidence.v2"` without actually restructuring
the record) — is your call. The second case is a stronger AC11 proof (it
shows the validator checks actual *shape*, not just the schema-string label)
and is recommended but not mandated; if you skip it, say why in your report.

### 2. Context files

- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` (read fully) —
  CYB-2B's closed v2 schema/evaluator module; read its exported schema
  validator function(s) and the v2 schema's exact required-field shape
  (identity fields, finding envelope, coverage record) — this is what your
  v1 fixture must fail against.
- `plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs` (read
  fully) — CYB-2B's own test fixtures, for style precedent (how a malformed-
  variant rejection test is structured there).
- `harness/scripts/security-scan.mjs` (read fully, read-only for context) —
  the real v1 aggregator; your v1 fixture's shape should be recognizably
  derived from what this file actually emits today (the real
  `pipeline.security-evidence.v1` envelope), not invented from nothing.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` §3 row AC11
  only, and §4's note ("investigation found no live v0 file in use — v1 is
  the actual current baseline being superseded") — read this note; it
  confirms your fixture should be v1, not a hypothetical v0, since v0 never
  existed as a real emitted format in this codebase.

### 3. DoD checks

- A v1-shaped evidence record (schema `pipeline.security-evidence.v1`, real
  v1 field shape) is rejected by CYB-2B's v2 schema validator — assert the
  rejection explicitly (a typed error, a `false`/invalid result, whatever
  CYB-2B's validator actually returns — read its real contract, don't guess).
- (Recommended, document if skipped) A v1-shaped record with only its
  `schema` string changed to the v2 string, but its underlying fields still
  v1-shaped, is ALSO rejected — proving shape enforcement, not just a label
  check.
- Test file makes clear, in comments/test names, WHY each assertion matters
  (this is AC11's whole point: no silent acceptance of stale evidence under
  new policy).
- No mutation, no fs/network access in the test/fixture module beyond
  standard `node:test`/`node:assert` usage.
- Verify command:
  `node --test plugins/pipeline-core/lib/security-evidence-v1-migration-fixture.test.mjs`
  must exit 0 (all assertions about REJECTION passing is success here — you
  are proving something is correctly rejected, not building something that
  passes acceptance).
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline is currently noisy for reasons unrelated to your work (confirmed
  `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/security-evidence-v1-migration-fixture.test.mjs`
  (new file). If you find you need a small shared v1-fixture-object helper,
  keep it inline in this one test file — do not create a second file for
  this task.
- Do NOT touch `security-evidence-evaluator.mjs`/`.test.mjs` (CYB-2B),
  `security-evidence-fixture-matrix.mjs`/`.test.mjs` (CYB-2A), any CYB-1
  file, `harness/scripts/security-scan.mjs`, or `governance/security-controls/catalog.json`
  — all closed/live, read-only for context.
- Do NOT build a real migration/upgrade tool — that is explicitly out of
  scope; this task only proves rejection.
- Do NOT touch or create any file a sibling Wave-3 dispatch (CYB-2C's plan
  builder, CYB-2D's four adapter files, CYB-2G's preflight extension) might
  also create.
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
- You find CYB-2B's v2 validator actually DOES accept a v1-shaped record
  (i.e. AC11 would genuinely fail against the real implementation) — stop
  and report this as a finding, do NOT weaken your fixture/assertions to
  make the test pass; this would be a real CYB-2B gap for the Elephant to
  triage, not something to paper over.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `5e20bc1` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-implementor` / medium. Rationale: clearly-briefed,
  narrow fixture/proof task against an already-closed, well-documented
  validator contract — no in-task design latitude beyond the small,
  optional "second case" choice named in field 1.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤25 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-2A/2B/2C precedent, fields `taskId:
  "CYB-2H"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist building a migration tool or touching
  `security-scan.mjs`.
- Fixtures stay in the suite: the v1 fixture object(s) and rejection
  assertions are permanent regression coverage, not scratch checks to remove
  after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, whether you included the recommended "relabeled
schema string" second case (and why, if skipped), and confirm the commit SHA
you produced (or a clean stop with the reason, per field 5).
