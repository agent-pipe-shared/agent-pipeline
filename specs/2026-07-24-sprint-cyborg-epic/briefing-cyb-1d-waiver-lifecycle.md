# Prepared Goldfish briefing — CYB-1d: waiver lifecycle (PO-waived-direct-implementation class)

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 4 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, `c31f4cc`) and CYB-1c (closed, `cdc86ce`), both
> `plan-verifier` CONFIRMED-MATCH. Runs in PARALLEL with CYB-1f — distinct new
> files, no shared write surface; do not touch any file the CYB-1f sibling
> package might also create (see field 4). Ruleset SHA `1fec4e3` (current HEAD
> at dispatch time). **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 1fec4e3 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1d/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1d: waiver lifecycle + `po-waived-direct-implementation` class (AC7)

### 1. Goal

Implement the **waiver lifecycle**: a pure function/module that evaluates a
control's `waiver` field (CYB-1a's already-validated shape: `null`, or an
object with non-empty `authority`, `reason`, `expiry`, `revalidationTrigger`
strings — see context files) against a caller-supplied "now" instant, and
produces a lifecycle verdict that:

1. **Fails closed on expiry** (AC7): an expired waiver (its `expiry` has
   passed relative to the supplied "now") must NEVER be treated as an active
   waiver at a protected boundary — the control's effective status must fall
   back to non-waived (i.e. whatever its underlying evaluation/migration
   status would otherwise be, never silently `waived`).
2. **Never mutates raw verifier evidence** (AC7): your evaluation function
   must not mutate its inputs — construct a fixture that passes a raw
   "evidence" object alongside the waiver evaluation and asserts its bytes
   (deep-equality / `JSON.stringify` before-and-after, or a deep-freeze) are
   unchanged after your function runs.
3. **Defines a typed `waiverClass` taxonomy**, including a distinct
   `po-waived-direct-implementation` value (per
   `cyb-1-feature-spec.md` §4) with these checkable properties enforced by
   your module, not left as prose:
   - **Mandatory expiry:** a waiver record with `waiverClass:
     "po-waived-direct-implementation"` MUST have a non-empty `expiry` (this
     is already required by CYB-1a's generic waiver shape, but re-assert it
     specifically for this class since the feature-spec calls it out as a
     hard requirement, not an accidental side effect of the generic rule).
   - **Mandatory follow-up flag:** the waiver record for this class must
     carry an explicit, typed field (you design its name/shape) recording
     that a fresh-context Critic review is a required follow-up — not
     merely implied by convention. Your module must be able to report
     whether that follow-up requirement is still outstanding.
   - **Self-clearing transition:** your module exposes a way to transition
     an outstanding `po-waived-direct-implementation` waiver to a
     closed/satisfied state once the follow-up evidence reference (e.g. a
     Critic review's evidence pointer) is supplied — model this as a pure
     transformation (old waiver record + evidence reference → new waiver
     record), not an in-place mutation.

**Genuine design latitude (deliberate, read carefully):** CYB-1a's schema
freezes the waiver *field validation rules* (§8) but does not freeze the
lifecycle-evaluation function's shape, the `waiverClass` enum's other members
(only `po-waived-direct-implementation` is named by the feature-spec; you may
add other class values only if you need them for a sensible closed enum, but
do not invent unrelated scope), or how the mandatory-follow-up/self-clearing
state is represented. Design and document this in a top-of-file comment
block matching CYB-1a/1b's style. Keep your output shape consistent with
CYB-1c's single-schema consumption contract (AC11): do NOT invent a second
parallel receipt/policy schema — your waiver-lifecycle verdict is a value
that could plausibly be embedded inside a `resolvedControls` entry or
consumed alongside a CYB-1c receipt, not a competing top-level schema. You do
not need to actually wire it into `control-evaluation-receipt.mjs` (that
integration is out of scope, a later task) — just avoid a design that would
make such integration impossible.

### 2. Context files

- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read fully) —
  CYB-1a's closed schema/lint module; read the `waiver` field validation
  block (`validateControl`, the `hasOwn(control, "waiver")` branch) for the
  exact required shape (`authority`, `reason`, `expiry`,
  `revalidationTrigger`, all non-empty strings) your lifecycle function must
  accept as input.
- `plugins/pipeline-core/lib/control-evaluation-receipt.mjs` (read fully) —
  CYB-1c's closed receipt module; read its top-of-file single-schema
  consumption-contract comment. Your waiver verdict shape must not
  contradict this contract.
- `plugins/pipeline-core/lib/control-catalog-migration.mjs` (read its
  top-of-file comment only) — CYB-1g's self-contained "qualifying input"
  precedent, for style/precedent on how a sibling package models its own
  narrow, independent concept without depending on unimplemented future work.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §4 (waiver
  lifecycle — PO-waived-direct-implementation class) in full — the
  checkable requirements this task must satisfy, quoted in field 1 above but
  read the source section for full context.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, row AC7
  only — the checkable-criterion wording. Do not read other AC rows; they
  belong to other sub-packages.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §7
  (control-result enum, for vocabulary consistency: your "non-waived
  fallback status" should be expressible in this vocabulary, e.g. `unknown`
  or `not-met`, not an invented term).

### 3. DoD checks

- AC7: fixture — an expired waiver (`expiry` in the past relative to a
  supplied "now") on a control resolves to a non-waived effective status
  (never `waived`) at the point your lifecycle function is asked to
  evaluate it "at a protected boundary".
- AC7: fixture — a currently-valid (non-expired) waiver resolves to an
  active/waived effective status.
- AC7: fixture — the evaluation function does not mutate a passed-in raw
  evidence object (deep-freeze the evidence fixture and/or assert
  `JSON.stringify` equality before/after the call).
- `po-waived-direct-implementation` fixture: a waiver record of this class
  missing `expiry` is rejected (typed error) even before your lifecycle
  logic runs (re-assert, do not just rely on CYB-1a's schema catching it
  elsewhere).
- `po-waived-direct-implementation` fixture: a fresh record of this class
  reports its mandatory follow-up as outstanding; after your
  transition/clearing function is called with an evidence reference, the
  resulting record reports the follow-up as satisfied — and the transition
  function does not mutate the original input record (same purity
  discipline).
- AC: all exported functions are pure (no fs/network access, no mutation of
  input arguments).
- AC: exported function name(s)/signature(s) plus the `waiverClass` taxonomy
  and mandatory-follow-up/self-clearing design are documented at the top of
  the new module file, matching CYB-1a/1b/1g's style.
- Verify command:
  `node --test plugins/pipeline-core/lib/control-waiver-lifecycle.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` — the
  branch baseline is currently noisy for reasons unrelated to your work
  (confirmed `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/control-waiver-lifecycle.mjs` (new file) and
  `plugins/pipeline-core/lib/control-waiver-lifecycle.test.mjs` (new file).
  Do not touch `control-catalog-schema.mjs`, `.test.mjs`,
  `security-policy-resolver.mjs`, `.test.mjs`,
  `control-evaluation-receipt.mjs`, `.test.mjs`,
  `control-catalog-migration.mjs`, `.test.mjs`, `reference-catalog.mjs`,
  `.test.mjs`, or `governance/security-controls/catalog.json` — all closed
  and verified; read-only for context. Do not touch or create any view file
  (CYB-1f, may be created concurrently by a sibling dispatch — do not touch
  it even if it appears mid-task).
- Do NOT wire this into `control-evaluation-receipt.mjs` or
  `security-policy-resolver.mjs` — integration is a later task, out of
  scope here.
- Do NOT weaken the fail-closed-on-expiry rule for convenience — the entire
  point of AC7 is that an expired waiver never silently protects a control.
- Do NOT invent a second parallel receipt/policy schema (AC11 discipline,
  see field 1's design-latitude note).
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
- You find that a self-contained waiver-lifecycle design genuinely cannot
  satisfy AC7 plus the feature-spec §4 requirements without changing
  CYB-1a's closed schema or CYB-1c's closed receipt shape — stop and report;
  that would be an Elephant-level call, not a Goldfish workaround.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `1fec4e3` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in the `waiverClass` taxonomy and mandatory-follow-up/self-clearing state
  shape (deliberate, per field 1), and the AC guards a security-relevant
  failure mode (a waiver silently outliving its authorization) where an
  under-specified fix is a real regression risk — matching the CYB-1a/1b/1g
  foundational-contract precedent.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-1d"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist adding a CLI wrapper, `verify.mjs`
  registry wiring, or actual receipt/resolver integration code.
- Fixtures stay in the suite: all constructed fixture waivers/evidence
  objects are permanent regression coverage, not scratch checks to remove
  after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
