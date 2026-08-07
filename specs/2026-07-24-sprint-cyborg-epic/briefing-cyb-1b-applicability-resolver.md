# Prepared Goldfish briefing — CYB-1b: L1 applicability resolver

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 2 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, commit `c31f4cc`, `plan-verifier` CONFIRMED-MATCH),
> unblocks CYB-1c/1d/1e/1g. Ruleset SHA `abe1d7c` (current HEAD at dispatch
> time). **Worktree: no** — run directly in the main checkout (same
> discipline established after CYB-1a's first dispatch attempt hit a stale
> isolated-worktree provisioning gap; do not use `isolation: "worktree"` for
> this dispatch).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset abe1d7c loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1b/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1b: `security-policy-resolver.mjs` — deterministic applicability resolution (AC2, AC3, AC4, AC10)

### 1. Goal

Implement the **L1 applicability resolver**: given a candidate's activated
modules, chosen assurance level, and available applicability inputs, compute
which controls from a supplied catalog apply — deterministically, with
missing-input failing to `unknown` (never a silent `not-applicable` or a
silent omission), and with module conflicts resolved by the CYB-1F §6 total
precedence order (never last-write-wins). The output must be **digest-bound**
(a stable content hash over the resolved result, not merely "some object").

This is new code (no existing module covers it) and depends on CYB-1a's
`control-catalog-schema.mjs` (closed, this branch) only for its exported
control shape as a type of input you may consume/validate against — you do
NOT need to call `validateControl()` internally (this task is about
resolution logic, not re-validating schema-conformance, though you may reuse
it for your own test fixtures' sanity if convenient).

**Genuine design latitude (read carefully, this is deliberate):** CYB-1F
freezes the *assurance-level enum* (§5: `baseline | elevated | critical`) and
the *module registry + precedence order* (§6), but explicitly does **not**
freeze how a control record expresses "which assurance level(s) include it"
or "which module(s) contribute it" — those are catalog-body/resolver-input
modeling decisions left to this package (spec.md, CYB-1F §1 "deliberately
leaves open: concrete control content... reference-catalog instance").
Concretely, you must design and document, in a top-of-file comment block
matching CYB-1a's style:

1. How a control declares its minimum/qualifying assurance level (e.g. an
   annotation alongside the control, not a new field forced into CYB-1a's
   closed schema — do not reopen or extend `control-catalog-schema.mjs`'s
   frozen field list to add this).
2. How controls are grouped by contributing module (universal/base controls
   vs. per-module control sets) so that when ≥2 activated modules both
   contribute or modify the same control ID, precedence (§6 order) — not
   input/array order — decides which version's data wins.
3. The exact resolver input/output shape (function name(s), parameter
   object shape, return shape). Keep it a **pure function** (no fs/network,
   no mutation of inputs) so it is unit-testable in isolation, matching
   CYB-1a's own purity contract.

Whatever shape you choose must satisfy the four ACs below literally and be
internally consistent — document the chosen mechanism clearly enough that
CYB-1c (receipt binding) and CYB-1e (reference catalog content) can build on
it without re-deriving your design from the diff alone.

### 2. Context files

- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §5
  (assurance-level enum: `baseline | elevated | critical`, composable —
  "a level selects a control subset; modules add controls") and §6 (module
  registry: `mod.web-api`, `mod.cli-lib`, `mod.container-deploy`,
  `mod.iac-cloud`, `mod.native-desktop`, `mod.ai-agent`,
  `mod.secrets-identity`, `mod.sensitive-data`, `mod.docs-only`; the RATIFIED
  total precedence order: `mod.ai-agent > mod.sensitive-data >
  mod.secrets-identity > mod.iac-cloud > mod.container-deploy > mod.web-api >
  mod.native-desktop > mod.cli-lib > mod.docs-only`; `mod.docs-only` is the
  lowest-precedence `not-applicable` path for non-software repos). Also skim
  §7 (control-result enum) for vocabulary only — your resolver's own
  `unknown`/applicable-or-not output should use compatible terms, but you are
  not required to emit the full seven-value enum, only what the ACs below
  require.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, rows AC2,
  AC3, AC4, AC10 only — the checkable-criterion wording this task must
  satisfy verbatim. Do not read other AC rows; they belong to other
  sub-packages.
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read fully, it is
  short) — CYB-1a's closed schema/lint module. Read its top-of-file comment
  block for the export-documentation style to match. You may import its
  exports if useful for constructing schema-valid test fixtures, but the
  resolver logic itself does not require calling into it.
- `plugins/pipeline-core/lib/control-catalog-schema.test.mjs` — for house
  fixture/test style (`node --test`, plain-object fixtures, one assertion
  focus per test).

### 3. DoD checks

- AC2 (determinism + composability): calling your resolver twice with the
  identical input (same catalog/controls, same assurance level, same
  modules, same applicability inputs) produces a byte-identical resolved
  control set AND identical digest across the two calls. Separately, a
  fixture proves `elevated`'s resolved control set is a superset of
  `baseline`'s resolved control set for the same modules/inputs (nothing
  present at `baseline` disappears at `elevated`).
- AC3 (precedence, not last-write-wins): a fixture activates ≥2 modules that
  each contribute a conflicting version of the same control (e.g. differing
  `severity` or `boundary` for the same control `id`), in an activation
  order that would give the WRONG answer under naive last-write-wins, and
  asserts the resolved version matches the §6 precedence order's
  higher-precedence module exactly.
- AC4 (missing input → unknown): a fixture control declares a required
  applicability input (via `applicability.requiredInputs`, the field already
  named in CYB-1F §8) that the supplied `applicabilityInputs` does not
  include; the resolved result for that control is `unknown` — not absent
  from the result set, not `not-applicable`.
- AC10 (baseline-minimal, no irrelevant tooling): a fixture with
  `assuranceLevel: 'baseline'` and zero optional modules activated (i.e. no
  `mod.container-deploy`/`mod.iac-cloud`/`mod.ai-agent`) resolves a control
  set that contains NO control contributed by those three modules, even
  though the input catalog/module-control-sets include controls for them.
- AC: the resolver is a pure function — no filesystem/network access, no
  mutation of any input argument (assert this the same way CYB-1a's tests
  do: deep-freeze or deep-equality-after-call check on inputs).
- AC: exported function name(s)/signature(s) are documented at the top of
  the new module file in a short comment block, one line per export plus a
  short paragraph explaining your chosen assurance-level/module-conflict
  modeling (per field 1's design-latitude requirement) — this is what
  CYB-1c/CYB-1e will read to build on your work.
- Verify command:
  `node --test plugins/pipeline-core/lib/security-policy-resolver.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` for this
  task — the branch baseline is currently noisy for reasons unrelated to
  your work (confirmed `security-scan.mjs` cross-branch gitleaks
  false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`,
  plus pre-existing unrelated suite reds); reconciling that is the Elephant's
  job after your dispatch.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/security-policy-resolver.mjs` (new file) and
  `plugins/pipeline-core/lib/security-policy-resolver.test.mjs` (new file).
  Do not edit `control-catalog-schema.mjs`/`.test.mjs` (CYB-1a is closed and
  verified; if you believe it needs a change, STOP and report — do not edit
  it yourself). Do not create `governance/security-controls/catalog.json` —
  that is CYB-1e's deliverable.
- Do NOT implement receipt binding/digesting for cross-package consumption
  (CYB-1c), waiver logic (CYB-1d), the reference catalog content (CYB-1e), or
  views (CYB-1f) — out of scope even if adjacent.
- Do NOT add a new field to `control-catalog-schema.mjs`'s closed schema to
  carry assurance-level/module metadata — model that separately (field 1,
  design-latitude point 1), keeping CYB-1a's frozen schema untouched.
- Do NOT weaken the "missing input → `unknown`" contract into a default
  applicable/not-applicable guess — AC4's entire point is a typed, honest
  `unknown`, never an inferred value.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The task requires touching a file outside field 4's scope (especially
  `control-catalog-schema.mjs`) — stop and report; that would mean CYB-1a's
  frozen surface is insufficient and needs an Elephant-level decision, not a
  Goldfish edit.
- Any test outside this new file's own suite starts failing — stop and
  report immediately.
- The assurance-level/module-conflict modeling choice (field 1) turns out to
  require information CYB-1F does not freeze and this briefing does not
  supply (beyond the genuine, expected design latitude already granted) —
  stop and report the specific gap rather than inventing catalog semantics
  that later sub-packages would be locked into.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `abe1d7c` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: this task carries the
  most genuine in-task design latitude of the CYB-1 slice so far (the
  assurance-level/module-conflict data model is deliberately unfrozen by
  CYB-1F) and its output is consumed by three downstream sub-packages
  (1c, 1e, 1g) — an under-specified or inconsistent model here propagates
  broadly, matching the WIN-PGA-2/WIN-PSM-1/CYB-1a precedent for
  foundational-contract code with real design latitude.
- Worktree: no — run directly in the main checkout (see status callout).
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` next to the evidence
  artifact per the standard template fields (`taskId: "CYB-1b"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`).

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- Design-latitude note (repeated for emphasis): the exact data model for
  assurance-level composability and module-scoped control contribution is
  yours to design within field 1's constraints — document it thoroughly.
- No incidental scope creep: resist adding receipt digesting beyond what
  AC2's "digest-bound output" strictly requires (a stable hash of the
  resolved-control-set result is enough; a full cross-consumer receipt
  schema is CYB-1c's job), a CLI wrapper, or `verify.mjs` registry wiring.
- Fixtures stay in the suite: all constructed fixture controls/modules are
  permanent regression coverage in the test file, not scratch checks to
  remove after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
