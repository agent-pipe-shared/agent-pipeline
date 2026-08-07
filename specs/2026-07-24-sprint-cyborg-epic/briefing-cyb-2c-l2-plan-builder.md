# Prepared Goldfish briefing — CYB-2C: L2 plan builder

> **Status: DISPATCHING NOW.** `planApproved` recorded (epic PRD gate) AND
> the CYB-2 body-slicing plan approved by the PO 2026-07-25 ("cyb 2 plan
> approved", as-is). This is part of **Wave 3** of that plan: depends on
> CYB-1b (closed, `0af00ee`) and CYB-2B (closed, commit `48d481b`,
> `plan-verifier` CONFIRMED-MATCH 19/19). Runs in parallel with CYB-2D/2G/2H
> — distinct new files, no shared write surface; do not touch any file a
> sibling Wave-3 dispatch might also create. Ruleset SHA `e82c5fb` (current
> HEAD at dispatch time). **Worktree: no** — new files only, run directly in
> the main checkout.

---

You are a **Goldfish** of the Agent-Pipeline: fresh context, exactly ONE task,
"follow the plan exactly". This briefing and the files listed in field 2 are
your ONLY input. You have no memory and use none; do not read handover/state
files or session history — this briefing replaces them.

First output line (compact bootstrap confirmation):

> Bootstrap check passed: ruleset e82c5fb loaded · Project agent-pipeline · Calibration .claude/pipeline.json · State briefing CYB-2C/2026-07-25

---

## Briefing CYB-2C: deterministic L2 required-capability plan builder

### 1. Goal

Build a **pure L2 plan builder**: a function that takes CYB-1b's
`resolveApplicableControls()` output (a `ResolvedPolicy` — see context files
for its exact shape) and produces a **capability-level plan** —
`{ required: string[], optional: string[] }` of `cap.*` capability-root ids
— consistent with the shape CYB-2A's fixtures and CYB-2B's evaluator/
aggregate function already consume (`plan.required`/`plan.optional` arrays
of capability ids, e.g. `"secrets"`, `"sca"`, `"sast"`, `"license"` in the
fixtures — read CYB-2A's file to see the concrete shape those short ids
take; your builder's real output should use the full `cap.*` root ids from
CYB-1F, e.g. `cap.secrets`/`cap.sca`/`cap.sast`, not the fixtures'
shortened illustrative labels).

The plan must also carry a **plan digest** joining it to the exact resolved
policy it was built from (spec.md §2 item 4's "plan digest joins candidate
evidence" requirement) — reuse CYB-1b's own canonical-digest approach
(`resolveApplicableControls()`'s `digest` field / its internal
`canonicalize()` pattern) rather than inventing a second digest scheme.

**Genuine design latitude (deliberate, read carefully):** CYB-1b's closed
catalog schema has **no field that directly marks a control "required" vs
"optional" at the capability-plan level** — the closest existing signal is
each control's `defaultFailureMode` (currently only `"block"` appears in the
live catalog; the schema does not enumerate other values anywhere in this
codebase yet). You must design and explicitly document a defensible mapping
from `resolveApplicableControls()`'s `resolvedControls[]` (each entry has
`control.capabilityRequirements: string[]` naming one or more `cap.*` roots,
plus `control.defaultFailureMode`) to your plan's `required`/`optional`
split. A reasonable starting design: a capability is **required** if it is
named by `capabilityRequirements` on at least one resolved control whose
`defaultFailureMode === "block"`; **optional** if it is only ever named by
controls with some other (non-`"block"`) failure mode, or if you find no
such controls exist in the live catalog and instead choose a different,
equally-defensible signal — your call, but state the rule precisely and
justify it. Do NOT invent a new field on the closed CYB-1a control schema to
carry this — derive it entirely from existing fields.

Also design: how a capability named by multiple resolved controls with
mixed required/optional signals resolves (a capability should end up in
`required` if ANY contributing control marks it required — "required wins
ties" is the safe default, but document whichever choice you make).

You do NOT need to build the capability-plan's consumption by
`security-scan.mjs` or `guard-push.mjs` — that is CYB-2E/CYB-2F, later
waves. You are building the plan-construction function only.

### 2. Context files

- `plugins/pipeline-core/lib/security-policy-resolver.mjs` (read fully) —
  CYB-1b's closed L1 resolver; its top-of-file comment documents the exact
  `ResolvedPolicy` output shape (`resolvedControls[]` with `control`,
  `contributingModule`, `applicability`, `missingInputs`), the digest
  mechanism (`canonicalize()`), and the "never mutate input" purity
  discipline your new function must also follow.
- `plugins/pipeline-core/lib/security-policy-resolver.test.mjs` (read fully)
  — the 5 named fixtures (web-api, cli-lib, container-iac, ai-agent,
  docs-only) and how they call `resolveApplicableControls()`; reuse one or
  more of these as your builder's own test inputs rather than inventing
  unrelated fixtures from scratch.
- `plugins/pipeline-core/lib/security-evidence-fixture-matrix.mjs` (read its
  top-of-file comment + the `plan` field shape on a couple of fixtures only)
  — CYB-2A's closed fixture matrix, for the exact `{required, optional}`
  shape your plan must match structurally (array-of-string-ids each).
- `governance/security-controls/catalog.json` (read fully, short) — the live
  catalog content; note that every control currently has
  `defaultFailureMode: "block"` — factor this into your required/optional
  design (if literally every live control is `"block"`, your mapping's
  `optional` output may legitimately be empty against today's catalog; that
  is fine, document it, do not force an artificial optional example into the
  real catalog data).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` §5 ("L2 plan
  builder" one-line scope description) and §3 rows AC1/AC9 only (the two ACs
  the body-slicing table attributes to this sub-package). Do not read other
  AC rows.

### 3. DoD checks

- Given each of CYB-1b's 5 named fixture inputs (web-api, cli-lib,
  container-iac, ai-agent, docs-only), your builder produces a
  `{required, optional}` capability-id plan derived entirely from that
  fixture's `resolveApplicableControls()` output — no hand-authored plan
  bypassing the resolver.
- The required/optional mapping rule is applied consistently and is
  documented precisely enough that a reader could predict the output for a
  sixth, unseen `ResolvedPolicy` input.
- A capability named by two different resolved controls with different
  failure-mode signals ends up in `required` if any one of them is
  `"block"`-classified as required (or your equivalent design, applied
  consistently) — assert this with a fixture, not just prose (construct a
  fixture where two module-attributed entries for two different modules'
  active catalogs both name the same `cap.*` root but originate from
  differently-attributed controls, if the live catalog doesn't already
  produce this naturally — synthetic catalog entries in your own test file
  are fine, matching CYB-1b's own test-file precedent of building small
  synthetic `CatalogEntry` fixtures).
- Plan digest: identical resolved-policy input always yields an identical
  plan digest; changing which controls resolved (e.g. a different
  `activatedModules` set) changes the digest.
- Function is pure (no fs/network access, no mutation of its input
  `ResolvedPolicy` argument — test this explicitly, e.g. deep-freeze the
  input or assert `JSON.stringify` equality before/after).
- Top-of-file comment documents: the required/optional mapping rule and its
  rationale, the digest mechanism (reused from CYB-1b, not reinvented), and
  the exact output shape.
- Verify command:
  `node --test plugins/pipeline-core/lib/security-capability-plan-builder.test.mjs`
  must exit 0.
- Do NOT run the full `node harness/scripts/verify.mjs` — the branch
  baseline is currently noisy for reasons unrelated to your work (confirmed
  `security-scan.mjs` cross-branch gitleaks false-positive, see
  `backlog/items/2026-07-25-security-scan-cross-branch-gitleaks-findings.md`).
- Machine-written test output is your evidence artifact — never prose you
  compose.

### 4. Forbidden

- Scope: create/touch ONLY
  `plugins/pipeline-core/lib/security-capability-plan-builder.mjs` (new
  file) and
  `plugins/pipeline-core/lib/security-capability-plan-builder.test.mjs` (new
  file). Do not touch `security-policy-resolver.mjs`/`.test.mjs` (CYB-1b),
  any other CYB-1 file, `security-evidence-fixture-matrix.mjs`/`.test.mjs`
  (CYB-2A) or `security-evidence-evaluator.mjs`/`.test.mjs` (CYB-2B), or
  `governance/security-controls/catalog.json` — all closed, read-only for
  context. Do not touch or create any file a sibling Wave-3 dispatch
  (CYB-2D's four adapter files, CYB-2G's preflight extension, CYB-2H's
  migration fixture) might also create.
- Do NOT add a new field to `control-catalog-schema.mjs`'s closed §8 field
  set to carry required/optional metadata — derive it from existing fields
  only.
- Do NOT wire this into `security-scan.mjs` or `guard-push.mjs` — that is
  later waves, out of scope here.
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
- You find `resolveApplicableControls()`'s output genuinely insufficient to
  build a required/optional split at all (not just "ambiguous, needs a
  documented design choice" — that's expected latitude — but literally
  missing data) — stop and report the specific gap.
- Missing access/tool/permission.
- Tool budget reached or clearly about to be exceeded.

### 6. Dispatch metadata

- Ruleset SHA/version: `e82c5fb` (current HEAD at dispatch time, 2026-07-25).
- Model/effort: `goldfish-deep` / xhigh. Rationale: genuine design latitude
  in the required/optional mapping rule (deliberate, per field 1) — an
  under-specified fix here (e.g. everything silently required, or a rule
  that doesn't generalize) is a real regression risk for every downstream
  CYB-2 wave that consumes this plan.
- Worktree: no — run directly in the main checkout.
- Profile: standard.
- Tool budget: ≤35 tool uses.
- Dispatch record: write `dispatch-record.json` to your own scratchpad
  location (not the repo) per the CYB-2A/2B precedent, fields `taskId:
  "CYB-2C"`, `model`, `rulesetSha`, `dispatcher`, `outcome`.

---

## NEW-FEATURE module (applies per template — this is new code, not a bugfix)

- No incidental scope creep: resist wiring into `security-scan.mjs`,
  `guard-push.mjs`, or a CLI wrapper.
- Fixtures stay in the suite: all constructed plan/policy fixtures are
  permanent regression coverage, not scratch checks to remove after.

At the end, report back: the diff summary, the exact test command you ran and
its exit code/output, the required/optional mapping rule you designed
(stated precisely), and confirm the commit SHA you produced (or a clean stop
with the reason, per field 5).
