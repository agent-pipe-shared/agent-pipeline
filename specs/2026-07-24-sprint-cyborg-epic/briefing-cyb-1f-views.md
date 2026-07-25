# Prepared Goldfish briefing — CYB-1f: operator/developer/auditor views

> **Status: DISPATCHING NOW.** `planApproved` recorded; gate open. This is
> Wave 4 of the CYB-1 body-slicing plan (`cyb-1-body-slicing.md`): depends on
> CYB-1a (closed, `c31f4cc`) and CYB-1e (closed, `fe9e7a8`), both
> `plan-verifier` CONFIRMED-MATCH. Runs in PARALLEL with CYB-1d — distinct new
> files, no shared write surface; do not touch any file the CYB-1d sibling
> package might also create (see field 4). Ruleset SHA `1fec4e3` (current HEAD
> at dispatch time). **Worktree: no** — run directly in the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset 1fec4e3 loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-1f/2026-07-25 · Role Goldfish (deep)

---

## Briefing CYB-1f: three generated-or-validated views over one catalog (AC12)

### 1. Goal

Per `cyb-1-feature-spec.md` §5 and AC12: implement three views over the
single reference catalog (`governance/security-controls/catalog.json`,
CYB-1e, closed) — **not three independently maintained documents**. Each
view must be either (a) mechanically generated from the catalog file, or (b)
a separately-authored artifact with an automated validation check that fails
if the artifact drifts from the catalog. Both are acceptable per AC12's own
wording ("generated from or validated against"); you choose per-view which
strategy fits, and must document the choice.

The three views (feature-spec §5, do not reinterpret their intent):

1. **Operator view** — helps someone selecting an assurance level and
   modules for a NEW repository; decision-tree framing (a "what am I picking
   and why" walk-through), not a field-by-field schema dump of every catalog
   field.
2. **Developer view** — only the controls applicable to a resolved module
   set (use CYB-1b's `resolveApplicableControls()` against the catalog, same
   as CYB-1e's fixtures do), with remediation guidance surfaced — this is
   the "no irrelevant tooling" idea (AC10) made human-readable. You may reuse
   one or more of CYB-1e's 5 named fixtures' `activatedModules` sets as a
   concrete example resolution to render this view against, or accept an
   arbitrary resolved-control-set input — your call, document it.
3. **Auditor view** — the full field set per control, including
   `standardMappings` and `evidenceContract` references, explicitly framed as
   traceability (which control maps to which standard/evidence), never as a
   certification claim (AC8's non-goal: "treating one framework mapping as
   certification" — do not phrase this view as "this repo is certified
   compliant with X").

**Genuine design latitude:** the exact artifact format (Markdown text
generated at test time and asserted against a golden string, a small
generator function returning a structured object, an HTML/JSON output — your
call), the exact drift-check mechanism, and the file layout are yours to
design, provided every view: (a) is demonstrably tied to the catalog file
(not hand-typed content that could silently diverge), and (b) has a test
that would fail if someone edited `catalog.json` in a way that changes the
resolved content without updating the view. Document your chosen mechanism
in a top-of-file comment, matching CYB-1a/1b/1e's style.

### 2. Context files

- `governance/security-controls/catalog.json` (read fully) — CYB-1e's
  closed reference catalog; your views render/validate against this file's
  actual content.
- `plugins/pipeline-core/lib/reference-catalog.mjs` (read fully, short) —
  CYB-1e's thin loader (`loadReferenceCatalog()`); reuse it rather than
  re-implementing catalog loading.
- `plugins/pipeline-core/lib/reference-catalog.test.mjs` (read fully) —
  CYB-1e's 5 named fixtures and how they call
  `resolveApplicableControls()`; reuse this pattern for the developer view's
  example resolution.
- `plugins/pipeline-core/lib/security-policy-resolver.mjs` (read its
  top-of-file comment + exported function signatures only) — CYB-1b's
  closed resolver, needed for the developer view.
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` (read its
  top-of-file comment only) — CYB-1a's closed schema/lint module, for the
  22-field list the auditor view must be able to surface in full.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §5 (Views —
  operator/developer/auditor) in full, and §3 row AC12 only. Do not read
  other AC rows; they belong to other sub-packages.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` §6 (non-goals)
  — specifically "treating one framework mapping as certification", which
  the auditor view must not violate in its framing/wording.

### 3. DoD checks

- AC12: three distinct views exist (operator, developer, auditor), each
  demonstrably generated-from-or-validated-against
  `governance/security-controls/catalog.json` — not three hand-authored
  documents with no automated tie to the catalog.
- AC12: a fixture/test proves drift-detection works for at least one view
  using the generated-or-validated strategy you chose (e.g., mutate an
  in-memory copy of the catalog data, or regenerate the view from current
  catalog content and diff, and assert a mismatch would be caught — you do
  not need to literally edit the checked-in `catalog.json` to prove this,
  an in-test simulated drift is sufficient).
- Operator view: framed as a decision-tree/selection walkthrough, not a raw
  field dump — assert this structurally (e.g. it groups by decision point,
  not by raw control ID list) in a test, not just by eyeballing prose.
- Developer view: contains only controls from a resolved module set (via
  `resolveApplicableControls()`), each with its `remediation` field
  surfaced; assert a control excluded from the resolved set does NOT appear
  in the rendered developer view.
- Auditor view: contains full field sets (including `standardMappings` and
  `evidenceContract`) for every control; assert the view's wording does not
  contain a certification claim (e.g. a test asserting the rendered text
  does not match a naive "certified"/"compliant"-without-caveat pattern,
  consistent with CYB-1a's own `lintStandardMappingsAndClaims` precedent —
  you may import and reuse that lint function directly here if useful,
  rather than re-implementing the check).
- AC: any exported generation/validation functions are pure (no
  network access; reading `catalog.json` via the existing
  `loadReferenceCatalog()` loader is fine and expected, not a purity
  violation).
- AC: exported function name(s)/signature(s) and the per-view
  generated-vs-validated strategy are documented at the top of the new
  module file, matching CYB-1a/1b/1e's style.
- Verify command:
  `node --test plugins/pipeline-core/lib/reference-catalog-views.test.mjs`
  must exit 0. Do NOT run the full `node harness/scripts/verify.mjs` — the
  branch baseline is currently noisy for reasons unrelated to your work
  (confirmed `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/reference-catalog-views.mjs` (new file) and
  `plugins/pipeline-core/lib/reference-catalog-views.test.mjs` (new file).
  Do not touch `control-catalog-schema.mjs`, `.test.mjs`,
  `security-policy-resolver.mjs`, `.test.mjs`,
  `control-evaluation-receipt.mjs`, `.test.mjs`,
  `control-catalog-migration.mjs`, `.test.mjs`, `reference-catalog.mjs`,
  `.test.mjs`, or `governance/security-controls/catalog.json` — all closed
  and verified; read-only for context. Do not touch or create any waiver
  lifecycle file (CYB-1d, may be created concurrently by a sibling
  dispatch — do not touch it even if it appears mid-task).
- Do NOT phrase the auditor view as a certification/compliance claim — this
  is an explicit non-goal (feature-spec §6).
- Do NOT hand-author view content that has no automated tie back to
  `catalog.json` — that would defeat AC12's entire point (three
  independently-drifting documents is exactly what AC12 forbids).
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
- `reference-catalog.mjs`'s loader or `security-policy-resolver.mjs`'s
  exports turn out to be insufficient for building a real view (e.g.
  missing data needed for the developer/auditor view) — stop and report the
  specific gap rather than reaching into a closed file to patch it yourself.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `1fec4e3` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in the artifact format and drift-check mechanism (deliberate, per field
  1), and this is a second real consumer of CYB-1a/1b/1e's contracts —
  friction here is signal for any later consumer, matching the CYB-1e
  precedent.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-1b precedent, fields `taskId:
  "CYB-1f"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist adding a CLI wrapper, `verify.mjs`
  registry wiring, or a docs-site/HTML build pipeline.
- Fixtures stay in the suite: all constructed view fixtures and drift-check
  scenarios are permanent regression coverage, not scratch checks to remove
  after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, and confirm the commit SHA you produced (or a clean
stop with the reason, per field 5).
