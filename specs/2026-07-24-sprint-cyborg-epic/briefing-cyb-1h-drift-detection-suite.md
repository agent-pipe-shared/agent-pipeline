# Briefing — CYB-1h: drift-detection verify suite (deferred from CYB-1, Wave 6)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-1h (deferred from CYB-1 Phase I; delivered in Wave 6
  per `cyb-2i-1h-body-slicing.md` §1 row 6, since it needed CYB-2's own
  verify-registration precedent to exist first). Satisfies CYB-1's AC14
  (`cyb-1-feature-spec.md` row AC14, `cyb-1-body-slicing.md` §"The AC14
  note"). Independent of CYB-2I-0/1/2/3/4 — no code dependency, grouped into
  this wave only for scheduling convenience.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` — expect `961243c` or later, plus whatever CYB-2I-1/2/4
  land ahead of you; disjoint files, no conflict expected, but confirm clean
  working tree before starting regardless). End with exactly one atomic
  commit.
- **Model / effort:** `goldfish-deep` / xhigh — REAL design latitude: this
  task requires you to read four existing production modules and decide,
  yourself, exactly which of their structural properties constitute "drift"
  worth locking down — the Elephant is deliberately NOT pre-specifying the
  exact snapshot fields (unlike CYB-2I-1/2/4, where the design was resolved
  in the briefing itself). This is test-suite authorship over guardrail-
  adjacent policy modules (catalog schema, precedence, receipt binding,
  waiver lifecycle) — squarely goldfish-deep's reserved territory.
- **Profile:** epic, execution phase.
- **Why this exists:** CYB-1's AC14: "Full Verify detects schema/precedence/
  applicability/evidence-binding drift... fails when catalog schema, module
  precedence, or receipt binding is edited without a matching fixture
  update." CYB-1a through CYB-1g already shipped BEHAVIORAL regression
  suites for their own respective modules (schema/lint validation rules,
  resolver correctness, receipt binding, waiver lifecycle, catalog content,
  views) — this task is NOT a duplicate of those. It is a STRUCTURAL
  snapshot layer one level up: it locks the exact SHAPE of the frozen
  constants/enums/precedence orders/required-field sets these modules
  export, so that an edit changing that shape (even one that happens to keep
  all of CYB-1a-g's own behavioral assertions passing, e.g. adding a new
  enum member nobody wrote a fixture against yet) is caught explicitly,
  rather than silently passing because no existing fixture happened to
  exercise the new/changed shape.
- **Registration decision — RESOLVED (PO, 2026-07-30):** register this new
  suite as a plain `TEST_SUITES` entry in `harness/scripts/verify.mjs` (same
  pattern as `guard-push-v2-tests`, `pr-contributor-gate-tests`, etc.) — NOT
  via `plugins/pipeline-core/lib/scoped-verify-registration.mjs` (that
  mechanism is hard sha256-pinned to a DIFFERENT epic's PRD, the Sentinel
  epic, with a frozen 3-entry allowlist unrelated to CYB-1/CYB-2 — see
  `cyb-2i-1h-body-slicing.md` §3 item 3 for the full disposition). Do not
  import from, extend, or otherwise touch `scoped-verify-registration.mjs`.

## Field 1 — Goal

1. Read the four named modules in full (Field 2) and identify, for EACH, the
   concrete exported structural surface that "drift" means for that module —
   at minimum: `security-policy-resolver.mjs`'s `MODULE_PRECEDENCE_ORDER`
   frozen array (its exact member list AND order — reordering these two
   modules relative to each other is exactly the kind of silent drift AC14
   names); `control-waiver-lifecycle.mjs`'s `WAIVER_CLASSES` frozen array;
   `control-catalog-schema.mjs`'s `validateControl`'s exact set of
   required/optional fields and their type constraints (read the function
   body — there is no separately-exported schema constant, the shape lives
   inside the validator itself); `control-evaluation-receipt.mjs`'s
   `createEvaluationReceipt`/`validateEvaluationReceipt`'s exact required-
   field set and the exact binding fields (`candidateId`/`policyDigest` per
   CYB-1c's own AC6, confirm the precise field names by reading the code, do
   not assume from this prose). State your own enumeration explicitly in
   your report — this enumeration IS the design decision this task exists to
   make, own it and justify it, don't just mechanically dump every exported
   symbol without judgment about which properties are genuinely
   drift-sensitive vs. incidental.
2. Author ONE new test file (e.g.
   `plugins/pipeline-core/lib/control-catalog-drift.test.mjs`, or a name you
   judge clearer — state why if you rename) containing snapshot/golden-style
   assertions against each enumerated surface from step 1 — e.g.
   `assert.deepEqual(MODULE_PRECEDENCE_ORDER, [...exact current array...])`,
   not a looser "contains these members" check; the whole point is that ANY
   change (add/remove/reorder/rename) breaks this test, forcing a conscious,
   visible update rather than silent pass-through.
3. Register the new test file as a new plain `TEST_SUITES` entry in
   `harness/scripts/verify.mjs` (e.g. `catalog-drift-detection-tests` or
   similar — your naming judgment, follow the existing entry-naming
   convention in that array), per the resolved registration decision above.
   This DOES require a `verify.mjs` edit (TP-3-protected). **You are granted
   a scoped test-path lift for this ONE addition only** — make the minimal
   single-entry addition, run the full suite yourself to confirm it registers
   and passes, and confirm via `git diff -- harness/scripts/verify.mjs` that
   your change is exactly the one new entry, nothing else touched.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/lib/security-policy-resolver.mjs` — full file;
  `MODULE_PRECEDENCE_ORDER` (~line 125) and `resolveApplicableControls`
  (~line 168) for how precedence is actually consumed (so your snapshot
  targets the thing that, if it drifted, would silently change resolution
  behavior — not an arbitrary unrelated constant in the same file).
- `plugins/pipeline-core/lib/control-catalog-schema.mjs` — full file;
  `validateControl` (~line 98) is the schema-shape source of truth.
- `plugins/pipeline-core/lib/control-evaluation-receipt.mjs` — full file;
  `createEvaluationReceipt` (~line 112) and `validateEvaluationReceipt`
  (~line 157).
- `plugins/pipeline-core/lib/control-waiver-lifecycle.mjs` — full file;
  `WAIVER_CLASSES` (~line 164) and `evaluateWaiverLifecycle` (~line 297).
- Each of the above modules' OWN existing `.test.mjs` sibling (CYB-1a-g's
  behavioral suites) — read these to confirm you are NOT duplicating
  existing coverage; your new file's job is the structural-snapshot layer
  those files do not already provide.
- `harness/scripts/verify.mjs` — the `TEST_SUITES` array's existing entry
  shape/naming convention (read enough entries to match the convention, do
  not read the whole file if not needed).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-1-feature-spec.md` row AC14;
  `cyb-1-body-slicing.md` §"The AC14 note"; `cyb-2i-1h-body-slicing.md` §1
  row CYB-1h and §3 item 3 (the registration-mechanism disposition).

## Field 3 — Definition of Done (checks)

1. New test file authored per Field 1, with your own stated enumeration of
   what counts as "drift" for each of the four modules, justified in your
   report (not just a mechanical dump).
2. Snapshot assertions are EXACT (deepEqual against literal recorded values),
   not loose containment/subset checks — verify this yourself before
   reporting done.
3. New `TEST_SUITES` entry added to `verify.mjs`; `git diff` confirms it is
   the only change to that file.
4. Full `node harness/scripts/verify.mjs` run (or at minimum your new suite
   run standalone plus confirmation it's correctly wired into the array) —
   report the new suite's own pass count.
5. `node --check` on every file you touch or add.
6. Report includes: your four-module drift-surface enumeration and
   rationale, confirmation this does not duplicate CYB-1a-g's existing
   fixture coverage, and the new suite's pass count.

## Field 4 — Prohibitions

- MUST NOT edit `security-policy-resolver.mjs`, `control-catalog-schema.mjs`,
  `control-evaluation-receipt.mjs`, `control-waiver-lifecycle.mjs`, or any of
  their existing `.test.mjs` siblings (read only — this task adds a new,
  separate file, it does not modify existing production or test code).
- MUST NOT touch `plugins/pipeline-core/lib/scoped-verify-registration.mjs`
  in any way (import, extend, or edit) — see Field 0's resolved disposition.
- `verify.mjs` edit scoped to exactly the one new entry — no other line may
  change.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken a genuine drift-sensitive assertion into a loose check just
  to make authoring easier — that defeats AC14's entire purpose.

## Field 5 — Stop conditions

- You judge that NONE of the four modules' exported surfaces constitute a
  meaningful "drift" risk beyond what CYB-1a-g's existing suites already lock
  down (i.e. you conclude this task is a near-empty no-op) → STOP and report
  this assessment explicitly rather than authoring a trivial/padding test
  file just to have something to commit.
- You find the `scoped-verify-registration.mjs` disposition in Field 0 is
  itself stale (e.g. its sha256 pin or allowlist has since changed in a way
  that would actually accommodate this suite) → STOP and report rather than
  silently deciding to use it anyway or silently ignoring the discrepancy.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
