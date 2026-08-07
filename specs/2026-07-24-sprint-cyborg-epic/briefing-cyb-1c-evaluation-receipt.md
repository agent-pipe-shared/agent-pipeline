# Prepared Goldfish briefing — CYB-1c: evaluation receipt + cross-consumer contract

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 3 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, `c31f4cc`) and CYB-1b (closed, `0af00ee`), both
> `plan-verifier` CONFIRMED-MATCH. Runs in PARALLEL with CYB-1e and CYB-1g —
> distinct new files, no shared write surface; do not touch any file another
> sibling package might also create (see field 4). Ruleset SHA `18685f8`
> (current HEAD at dispatch time). **Worktree: no** — run directly in the
> main checkout; scope is limited to this package's own new files so no
> conflict is expected even with siblings running concurrently.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 18685f8 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1c/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1c: control evaluation receipt schema + single consumption contract (AC6, AC11)

### 1. Goal

Implement the **evaluation receipt**: a schema binding one resolved policy
(CYB-1b's `resolveApplicableControls()` output) to an exact candidate, such
that two evaluations of different candidates against the identical policy
produce different receipt digests (AC6), and document this as the **sole**
consumption contract for downstream packages (#5/#6/#9/Release) — no second
parallel policy schema may exist (AC11).

Concretely, produce a new module exporting:

1. **`createEvaluationReceipt({ candidateId, policyDigest, resolvedControls, evaluatedAt })`**
   (AC6) — returns a receipt object binding `candidateId` and `policyDigest`
   (both required, typed-rejected if missing/malformed — a receipt without
   either is meaningless per #41 §5) plus a `receiptDigest` (a stable content
   hash over `{candidateId, policyDigest, resolvedControls}`). Two calls with
   different `candidateId` (same `policyDigest`/`resolvedControls`) MUST
   produce different `receiptDigest` values; two calls with identical inputs
   MUST produce identical `receiptDigest` values (determinism, matching
   CYB-1b's own digest discipline).
2. **`validateEvaluationReceipt(receipt)`** — typed accept/reject of a receipt
   object's shape (mirrors CYB-1a's `validateControl` typed-rejection style):
   rejects a receipt missing `candidateId`, `policyDigest`, `receiptDigest`,
   or `resolvedControls`, with a field-naming typed error.
3. A short **consumption-contract statement**, written as a top-of-file
   comment block (not a separate doc file — keep this in one place per AC11
   "single documented consumption contract"): state plainly that
   `pipeline.control-catalog.v1` resolution → this receipt shape is the ONE
   schema #5/#6/#9/Release consume, and that no package may define a second,
   parallel policy/result schema. This is a documentation requirement, not a
   runtime enforcement mechanism — you are not wiring #5/#6/#9/Release here,
   only stating the contract they must follow.

`policyDigest` here is the caller-supplied digest string from CYB-1b's
resolver output (its own `digest` field) — you do not recompute or
second-guess it; you bind it into the receipt as-is. This keeps CYB-1c a thin
binding layer over CYB-1b's output, not a second resolution mechanism.

### 2. Context files

- `plugins/pipeline-core/lib/security-policy-resolver.mjs` (read fully) —
  CYB-1b's closed resolver. Read its top-of-file design comment for the
  exact shape of its return value (the `digest` field name and
  `resolvedControls` array shape) — your receipt's `policyDigest` parameter
  is exactly that resolver's `digest` output, and `resolvedControls` is
  exactly that resolver's `resolvedControls` output, passed through
  unchanged (do not recompute or transform them).
- `plugins/pipeline-core/lib/security-policy-resolver.test.mjs` — for house
  fixture/test style.
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read its
  top-of-file comment only) — CYB-1a's typed-rejection style
  (`{valid:false, errors:[...]}` shape) to match for your own
  `validateEvaluationReceipt`.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, rows AC6
  and AC11 only — the checkable-criterion wording this task must satisfy
  verbatim. Do not read other AC rows; they belong to other sub-packages.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §8,
  last paragraph only (the one sentence describing the receipt as
  `pipeline.control-catalog.v1` resolution → receipt, "not a second policy
  authority") — grounding for the AC11 consumption-contract statement.

### 3. DoD checks

- AC6: a fixture calls `createEvaluationReceipt()` twice with two different
  `candidateId` values (same `policyDigest`/`resolvedControls`) and asserts
  the two `receiptDigest` values differ. A companion fixture calls it twice
  with fully identical inputs and asserts identical `receiptDigest` (and
  identical full receipt object via deep-equality) — determinism, matching
  CYB-1b's own AC2 discipline.
- AC6: a fixture asserts `createEvaluationReceipt()` rejects (typed error)
  when `candidateId` or `policyDigest` is missing.
- AC11: a fixture round-trips a valid receipt through
  `validateEvaluationReceipt()` and asserts acceptance; a companion fixture
  asserts rejection of a receipt missing one of the four required fields,
  with a field-naming typed error.
- AC11: the top-of-file comment explicitly states the single-schema
  consumption contract (see field 1, point 3) — this is a textual DoD check,
  confirm the sentence is present and unambiguous, not merely implied.
- AC: both exported functions are pure (no fs/network access, no mutation of
  input arguments).
- AC: exported function names/signatures documented at the top of the new
  module file, matching CYB-1a/CYB-1b's style.
- Verify command:
  `node --test plugins/pipeline-core/lib/control-evaluation-receipt.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` — the
  branch baseline is currently noisy for reasons unrelated to your work
  (confirmed `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- As a non-DoD sanity check (not required to pass/fail your task, purely
  informational), you may re-run
  `node --test plugins/pipeline-core/lib/security-policy-resolver.test.mjs`
  and `node --test plugins/pipeline-core/lib/control-catalog-schema.test.mjs`
  to confirm you did not accidentally regress either sibling package (you
  should not have touched them at all).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/control-evaluation-receipt.mjs` (new file) and
  `plugins/pipeline-core/lib/control-evaluation-receipt.test.mjs` (new
  file). Do not touch `control-catalog-schema.mjs`, `.test.mjs`,
  `security-policy-resolver.mjs`, or `.test.mjs` — all three are closed and
  verified; read-only for context. Do not create
  `governance/security-controls/catalog.json` (CYB-1e's file, may be created
  concurrently by a sibling dispatch — do not touch it even if it appears
  mid-task) or any waiver/migration/view file (CYB-1d/1g/1f).
- Do NOT re-implement or second-guess CYB-1b's `digest` computation — treat
  it as an opaque string you bind into the receipt, never recompute.
- Do NOT wire #5/#6/#9/Release consumption in code — AC11 is satisfied by
  the documented contract statement, not by touching those packages (which
  do not exist as dispatched CYB-1 sub-packages anyway).
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
  report immediately (should be impossible; this is a new, standalone
  module that only reads, never modifies, its two dependencies).
- Genuine ambiguity about the receipt shape this briefing and CYB-1F §8's
  last paragraph do not resolve — stop and report rather than inventing a
  shape CYB-1c's consumers would be locked into.
- Ruleset SHA mismatch at start (`git rev-parse HEAD` must equal `18685f8`
  or a descendant of it that does not touch this package's files, per
  parallel-dispatch expectations — if the sibling CYB-1e/1g dispatches have
  already landed commits by the time you start, that is expected and fine,
  just confirm none of them touched your own scope).
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `18685f8` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: this is a cross-consumer
  contract package (AC11 explicitly: "no package defines a second parallel
  policy schema") — getting the binding/documentation wrong here creates a
  systemic risk across every future consumer package, matching the
  foundational-contract precedent from CYB-1a/1b.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-1c"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist adding a CLI wrapper, `verify.mjs`
  registry wiring, or any actual #5/#6/#9/Release integration code.
- Fixtures stay in the suite: all constructed fixture receipts/policies are
  permanent regression coverage in the test file.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
