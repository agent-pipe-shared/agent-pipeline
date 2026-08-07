# Prepared Goldfish briefing — CYB-1a: control-catalog schema + catalog-content lint

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open (PO
> confirmed 2026-07-25: "1. ich hatte das doch schon gemacht oder? ... 2. ja"
> — (2) is the go-ahead to continue toward CYB-1 briefings). This is Wave 1 of
> the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): first sub-package,
> zero dependencies, unblocks CYB-1b/1c/1d/1e/1f/1g. Ruleset SHA
> `1b1d6e6b7994eb0a91162379b012925da72a9c62` (current HEAD; the 4 commits
> ahead of `origin/feat/sprint-cyborg-claude` are locally verified and pending
> a PO-run `po-guarded-push.mjs`, not yet on remote — this dispatch does not
> depend on that push landing first).

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 1b1d6e6b7994eb0a91162379b012925da72a9c62 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1a/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1a: control-catalog schema validator + catalog-content lint (AC1, AC5, AC8)

### 1. Goal

Implement the **L0 layer's schema boundary as executable code**: a validator
that accepts/rejects a single control record against the CYB-1F §8 frozen
field set, plus two catalog-wide lint passes over a list of control records.
This is new code — no existing module covers this. It is the foundation every
later CYB-1 sub-package (1b resolver, 1c receipt, 1d waivers, 1e reference
catalog, 1f views, 1g migration) will import and depend on, so correctness and
a stable, documented export surface matter more than usual.

Concretely, produce a new module exporting three functions:

1. **`validateControl(control)`** (AC1) — given one control record (a plain
   object), return a typed result: either `{ valid: true }` or
   `{ valid: false, errors: [...] }` where each error names the missing/
   malformed field. A control missing any required CYB-1F §8 field, or with a
   field of the wrong shape (e.g. `class` not one of `base|stack|risk`,
   `capabilityRequirements` not an array of `cap.*`-prefixed strings), must be
   rejected with a typed error identifying which field failed — never a
   silent accept, never a generic unlabelled throw.
2. **`lintCatalogContent(controls)`** (AC5) — given an array of control
   records (all already schema-valid per function 1), assert that every
   *applicable* control names all four of: `verifierType`,
   `evidenceContract`, `boundary`, `defaultFailureMode` (the "verifier +
   evidence contract + boundary + failure policy" AC5 language maps onto
   these four CYB-1F §8 field names exactly — see field 2). Missing any one
   on any control fails catalog validation with a typed, control-ID-scoped
   error.
3. **`lintStandardMappingsAndClaims(controls, catalogText)`** (AC8) — two
   checks: (a) every entry in every control's `standardMappings` carries a
   version field (reject if any mapping entry lacks one); (b) scan the
   supplied catalog text (title/objective/threat/remediation prose fields
   across all controls, plus an optional separate doc-text string parameter
   for narrative catalog documentation) for the literal words "certified" or
   "compliant" NOT immediately followed by a qualifying disclaimer phrase —
   flag any bare use. Keep the disclaimer-detection heuristic simple and
   documented (e.g. a fixed allowlist phrase like "informatively mapped to"
   or "not a certification claim" appearing in the same sentence) rather than
   inventing NLP; this is a lint, not a claims-classifier.

### 2. Context files

- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §8
  (read this section only) — the RATIFIED closed field list you are encoding:
  `id`, `revision`, `status`, `title`, `objective`, `threat`, `class`,
  `applicability` (expression + required inputs), `phase`, `boundary`,
  `owner`, `approvalAuthority`, `verifierType`, `capabilityRequirements`
  (list of `cap.*` roots), `evidenceContract` (schema ref + freshness/binding
  rule), `severity`, `defaultFailureMode`, `remediation`, `waiver`
  (authority/reason/expiry/revalidationTrigger), `supersedes`/
  `supersededBy`, `standardMappings` (informative, versioned). Also read §3
  (capability-ID grammar, the frozen `cap.*` roots — needed to validate
  `capabilityRequirements` entries), §4 (control-ID grammar: `ctl.<class>.
  <domain>.<slug>`, `class` enum `base|stack|risk`), and §7 (control-result
  enum: `met | not-met | not-applicable | unavailable | waived | unknown |
  invalid` — needed if you validate a `status`/result-shaped field; only
  the schema fields listed in §8 are in scope, this is background only).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, rows AC1,
  AC5, AC8 only — the checkable-criterion wording this task must satisfy
  verbatim. Do not read other AC rows; they belong to later sub-packages.
- Existing sibling modules for house style (read both fully, they are short):
  `plugins/pipeline-core/lib/control-execution-exchange.mjs` and its test
  file `plugins/pipeline-core/lib/control-execution-exchange.test.mjs` —
  match this repo's existing conventions for typed-result shape, JSDoc-free
  plain-object returns, and the existing `node --test` fixture style (do NOT
  import from or depend on this module; it is a different, unrelated `pipeline.control-execution-exchange` concern — style reference only).
- `governance/examples/README.md` (skim only, for the general
  advisory-vs-enforcing framing) — NOT required reading in depth; this task
  does not touch the governance policy layer itself, only the schema/lint
  functions consumed by it later.

Note what this task deliberately does NOT need: there is no reference catalog
file yet (`governance/security-controls/catalog.json` does not exist — that
is CYB-1e's deliverable, which depends on this task). Your fixtures/tests use
small synthetic control-record objects you construct inline, not a real
catalog file.

### 3. DoD checks

- AC: `validateControl()` accepts a fixture control record containing every
  CYB-1F §8 field with correct types/shapes, and rejects (with a field-naming
  typed error) at least one fixture per: a missing required field, a `class`
  value outside `base|stack|risk`, and a `capabilityRequirements` entry not
  matching the `cap.<family>[.<technique>]` grammar (§3).
- AC: `lintCatalogContent()` accepts a fixture catalog (array of ≥2 valid
  controls) where all four fields (`verifierType`, `evidenceContract`,
  `boundary`, `defaultFailureMode`) are non-empty on every control, and
  rejects a fixture where exactly one control is missing exactly one of the
  four, with the typed error naming both the control's `id` and the missing
  field.
- AC: `lintStandardMappingsAndClaims()` accepts a fixture where every
  `standardMappings` entry has a `version` and no bare "certified"/
  "compliant" appears without your chosen disclaimer marker, and rejects two
  separate negative fixtures: one with a version-less mapping entry, one with
  a bare unqualified "certified" or "compliant" occurrence in supplied text.
- AC: all three functions are pure (no filesystem/network access, no mutation
  of their input arguments) and independently unit-testable without any of
  the other two.
- AC: exported function names and signatures are stable and documented at
  the top of the new module file in a short comment block (one line per
  export) — downstream CYB-1b/1c/1d/1e/1f/1g sub-packages will import from
  this exact module path.
- Verify command:
  `node --test plugins/pipeline-core/lib/control-catalog-schema.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` for this
  task — this branch's baseline is currently noisy for reasons unrelated to
  your work (a confirmed `security-scan.mjs` cross-branch gitleaks
  false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`,
  plus pre-existing unrelated suite reds); reconciling that is the Elephant's
  job after your dispatch, same as the WIN-PGA-2/WIN-PSM-1 precedent.
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/control-catalog-schema.mjs` (new file) and
  `plugins/pipeline-core/lib/control-catalog-schema.test.mjs` (new file). Do
  not create `governance/security-controls/catalog.json` or any other data
  file — that belongs to CYB-1e, a later, dependent sub-package.
- Do NOT implement the applicability resolver, receipt binding, waiver
  lifecycle, views, or migration logic — those are CYB-1b/1c/1d/1f/1g, out of
  scope for this briefing even if the temptation to "just also handle X"
  arises.
- Do NOT invent new fields beyond CYB-1F §8's closed list, and do NOT rename,
  drop, or reinterpret any of those fields — the freeze is ratified and
  binding (spec.md §6 re-approval rule governs any change, not this task).
- Do NOT weaken the "missing required field → reject" contract into a
  warning-only or best-effort pass — AC1's whole point is a typed rejection,
  not silent tolerance.
- No-go paths: `.claude/**`, `plugins/pipeline-core/hooks/**`.
- Project denies apply (committed `.claude/settings.json` / git-guard).
- **Commit discipline:** never `git add -A` / a bare `git commit` — only
  `git commit -- <own paths>`; new files need `git add -- <path>` (pathspec)
  before the commit, same paths in both.

### 5. Stop conditions

- More than 2 failed attempts at the same problem — report the failure
  state.
- The fix/implementation requires touching a file outside field 4's scope —
  stop and report; that would mean the task is bigger than currently scoped.
- Any test outside this new file's own suite starts failing because of this
  change — stop and report immediately (should be structurally impossible
  since this is a new, standalone module, but report if it happens).
- Genuine ambiguity about how a CYB-1F §8 field's shape should be validated
  that this briefing and `cyb-1f-schema-boundary-draft.md` §8 do not resolve
  — stop and report rather than guessing a shape that later sub-packages
  would then have to work around.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `1b1d6e6b7994eb0a91162379b012925da72a9c62` (current
  HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: this is the root schema
  contract every other CYB-1 sub-package (1b through 1g) imports and depends
  on — a defect or an under-specified shape here propagates into six
  downstream dispatches rather than staying contained, and there is genuine
  design latitude in exactly how strict/typed the validation errors are
  shaped (not fully pre-decided by this briefing on purpose, matching the
  WIN-PGA-2/WIN-PSM-1 precedent for foundational-contract code).
- Worktree: no — two new files, no parallel-dispatch conflict expected
  (confirm against calibration `.claude/pipeline.json` `"worktree":
  "optional"` at actual dispatch time; CYB-1b cannot start until this closes
  anyway, per the body-slicing dependency graph, so no concurrent sibling
  dispatch exists yet to conflict with).
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` next to the evidence
  artifact per the standard template fields (`taskId: "CYB-1a"`, `model`,
  `rulesetSha`, `dispatcher`, `outcome`).

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- Design-latitude note: the exact internal helper structure (e.g. one
  combined validator function vs. per-field checkers) is your call within
  the exported three-function contract in field 1 — the export names/
  signatures are what is fixed, not the internals.
- No incidental scope creep: resist adding a fourth export, a CLI wrapper, or
  wiring into `harness/scripts/verify.mjs`'s suite registry — this task ends
  at the two files in field 4; registration/wiring is a later package's
  concern (CYB-1h explicitly, for the drift-detection suite).
- Fixtures stay in the suite: all constructed fixture control records are
  permanent regression coverage in the test file, not scratch checks to
  remove after.
