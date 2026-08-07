# Prepared Goldfish briefing — CYB-1e: reference catalog content + 5 stack fixtures

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 3 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, `c31f4cc`) and CYB-1b (closed, `0af00ee`), both
> `plan-verifier` CONFIRMED-MATCH. Runs in PARALLEL with CYB-1c and CYB-1g —
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

> Bootstrap check passed: ruleset 18685f8 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1e/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1e: reference catalog content + 5 stack fixtures (AC9)

### 1. Goal

Author the first real **reference catalog content**: a small, versioned,
reviewable JSON data file of schema-valid controls (per CYB-1a's
`validateControl`/`lintCatalogContent`/`lintStandardMappingsAndClaims`),
plus 5 named fixture repositories/module-activation sets — one per `mod.*`
cluster named in CYB-1F §6 — each producing a genuinely distinct resolved
control set through CYB-1b's `resolveApplicableControls()`. This is the
first consumer of both CYB-1a and CYB-1b's exported contracts; treat any
friction you hit using them as signal, not something to silently work
around (see stop conditions).

Concretely:

1. **`governance/security-controls/catalog.json`** — a small reference
   catalog: enough controls to make the 5 fixtures below genuinely
   distinguishable (a handful of universal/base controls plus a few
   module-specific controls per relevant `mod.*` cluster is enough; this is
   explicitly NOT meant to be an exhaustive real-world catalog — "small
   enough to review/version/diff" per #41 §7). Every control MUST pass
   CYB-1a's `validateControl()` and the catalog as a whole must pass
   `lintCatalogContent()` and `lintStandardMappingsAndClaims()` — wire these
   as an assertion in your own test file (field 3), not as a separate
   registered verify suite (that is CYB-1h's job, out of scope here).
2. **`plugins/pipeline-core/lib/reference-catalog.test.mjs`** — the 5 named
   fixtures (AC9), one per cluster: web API (`mod.web-api`), CLI/library
   (`mod.cli-lib`), container/IaC (`mod.container-deploy` +/or
   `mod.iac-cloud` — your call whether to combine or split, CYB-1F §6 lists
   them as separate module IDs but #41 §9 groups "container/IaC" as one
   fixture category; document your choice), AI/agent (`mod.ai-agent`),
   docs-only (`mod.docs-only`). Each fixture: load `catalog.json`, call
   `resolveApplicableControls()` (CYB-1b) with that fixture's
   `activatedModules` set and a representative `assuranceLevel`/
   `applicabilityInputs`, and assert the resolved control set differs from
   at least one other fixture's resolved set (genuinely distinct, not
   coincidentally identical).

### 2. Context files

- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read fully) —
  CYB-1a's closed schema/lint exports (`validateControl`,
  `lintCatalogContent`, `lintStandardMappingsAndClaims`) and its top-of-file
  comment for the exact CYB-1F §8 field set your catalog entries must
  satisfy.
- `plugins/pipeline-core/lib/security-policy-resolver.mjs` (read fully) —
  CYB-1b's closed resolver, `resolveApplicableControls()`. Read its
  top-of-file design comment carefully: it documents its own
  `CatalogEntry` wrapper shape (per-`(control.id, module)` attribution,
  `minAssuranceLevel` threshold) — your `catalog.json` controls need to be
  wrapped into that `CatalogEntry` shape (or whatever the resolver actually
  expects as its `catalogEntries` input — read the resolver's own JSDoc/
  parameter shape, do not guess) when you call it from your fixtures.
- `plugins/pipeline-core/lib/security-policy-resolver.test.mjs` — for the
  exact fixture-construction pattern (`CatalogEntry`-shaped test data) to
  reuse for your own fixtures.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1f-schema-boundary-draft.md` §3
  (thirteen `cap.*` family roots), §6 (module registry:
  `mod.web-api`, `mod.cli-lib`, `mod.container-deploy`, `mod.iac-cloud`,
  `mod.native-desktop`, `mod.ai-agent`, `mod.secrets-identity`,
  `mod.sensitive-data`, `mod.docs-only`), §4 (control-ID grammar).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §3, row AC9
  only — the checkable-criterion wording this task must satisfy verbatim.
  Do not read other AC rows; they belong to other sub-packages.

### 3. DoD checks

- AC9: exactly 5 named fixtures exist (web API, CLI/library, container/IaC,
  AI/agent, docs-only), each with its own `activatedModules` set drawn from
  CYB-1F §6's registry.
- AC9: each fixture's resolved control set (via
  `resolveApplicableControls()` against `catalog.json`) is asserted to
  differ from at least one sibling fixture's resolved set — genuine
  distinctness, not a vacuous "same catalog every time" result. Prefer a
  pairwise or set-based assertion (e.g. compare resolved control-ID sets)
  over a single "not deep-equal to fixture #1" check, so a coincidental
  partial overlap doesn't hide a real bug.
- AC: `catalog.json` passes `validateControl()` for every entry,
  `lintCatalogContent()`, and `lintStandardMappingsAndClaims()` — assert all
  three in your test file as a precondition before the 5 fixtures run (a
  malformed reference catalog should fail loudly here, not surface as a
  confusing fixture failure downstream).
- AC: `docs-only`'s fixture activates only `mod.docs-only` and resolves the
  lowest-precedence/`not-applicable`-path behavior CYB-1F §6 describes for
  non-software repositories (confirm against the resolver's actual
  behavior for an all-`docs-only` activation — do not assume, read and
  test what the resolver actually returns).
- Verify command:
  `node --test plugins/pipeline-core/lib/reference-catalog.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` — the
  branch baseline is currently noisy for reasons unrelated to your work
  (confirmed `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY `governance/security-controls/catalog.json` (new
  file) and `plugins/pipeline-core/lib/reference-catalog.test.mjs` (new
  file). If you find you need a small loader helper, you may add
  `plugins/pipeline-core/lib/reference-catalog.mjs` (new file, e.g. a
  `loadReferenceCatalog()` that reads and JSON-parses `catalog.json`) — but
  keep it a thin loader, not new resolution/validation logic (that already
  exists in CYB-1a/1b).
- Do NOT touch `control-catalog-schema.mjs`, `.test.mjs`,
  `security-policy-resolver.mjs`, or `.test.mjs` — both are closed and
  verified; read-only for context. Do not create or touch any
  `control-evaluation-receipt.*` file (CYB-1c, may be created concurrently
  by a sibling dispatch) or any waiver/migration/view file (CYB-1d/1g/1f).
- Do NOT invent new catalog fields beyond CYB-1F §8's closed list.
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
- CYB-1a's or CYB-1b's exported functions turn out to be insufficient,
  ambiguous, or unusable as documented for building a real catalog fixture
  (e.g. the resolver's expected `catalogEntries` input shape is unclear from
  its own file) — stop and report the specific friction; this is exactly the
  kind of "first real consumer surfaces a contract gap" signal the
  dispatching Elephant needs, not something to paper over with a workaround.
- Genuine ambiguity about whether container/IaC should be one fixture or two
  that this briefing's field 1 point 2 does not sufficiently resolve for you
  — make and document a reasonable call per the instruction there; only stop
  if truly blocked.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `18685f8` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: this is the first real
  consumer of both CYB-1a and CYB-1b's contracts — friction here is early
  warning for every later consumer (CYB-1f views, CYB-1d waivers), and there
  is a genuine judgment call (container/IaC fixture grouping) not fully
  pre-decided by this briefing.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-1e"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist adding a CLI wrapper, `verify.mjs`
  registry wiring for `catalog.json`'s lint (CYB-1h's job), or view
  generation (CYB-1f's job).
- Fixtures stay in the suite: the 5 stack fixtures are permanent regression
  coverage, not scratch checks to remove after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
