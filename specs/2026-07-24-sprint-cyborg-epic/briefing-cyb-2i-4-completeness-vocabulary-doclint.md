# Briefing — CYB-2I-4: six-term completeness vocabulary + doc-lint (Wave 6, AC13)

> Dispatch briefing for one `goldfish-implementor` (effort medium) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-4 (Sprint Cyborg epic, Wave 6, `cyb-2i-1h-body-slicing.md`
  §1 row 5). No dependency on CYB-2I-0/1/2/3 — genuinely independent, but the
  TAXONOMY ITSELF is fully specified below by the Elephant (not left to you)
  because it requires reconciling three existing, only-partially-overlapping
  vocabularies already live in this codebase — that reconciliation is exactly
  the kind of judgment call that belongs to design, not implementation.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` — expect `961243c` or later). Working tree must be clean
  before you start; keep it clean; end with exactly one atomic commit.
- **Model / effort:** `goldfish-implementor` / medium — the taxonomy content
  is fixed in this briefing; your job is authoring it into the doc precisely
  as specified and writing a mechanical lint check, not inventing definitions.
- **Profile:** epic, execution phase.
- **Why this exists:** AC13 (`cyb-2-feature-spec.md`) requires a doc-lint
  enforcing that no project doc conflates `unavailable` with `not-applicable`
  (the two terms most likely to be used interchangeably by a careless writer,
  despite meaning materially different things — see the taxonomy below). No
  doc in this repo currently defines this vocabulary at all.

## Field 1 — The taxonomy (fixed content, author verbatim — do not redesign)

This repo currently has THREE partially-overlapping vocabularies live in
code, none of which is a human-facing glossary:

- **v1** (`security-scan.mjs`, `checkSecurityEvidenceBinding` in
  `guard-push.mjs`): a loose, severity-based `candidate.status === "clean"`
  meaning "no blocking-severity finding" — says nothing about whether every
  required capability actually ran.
- **v2 `RUN_OUTCOMES`** (`plugins/pipeline-core/lib/security-evidence-evaluator.mjs`,
  10 members): the per-capability, execution-level classification (`pass`,
  `findings`, `required-capability-missing`, `unsupported`,
  `execution-unavailable`, `partial-coverage`, `stale`, `invalid`,
  `not-applicable`, `waived`).
- **v2 `CONTROL_RESULTS`** (same file, 7 members): the catalog-level
  projection target (`met`, `not-met`, `not-applicable`, `unavailable`,
  `waived`, `unknown`, `invalid`) — `RUN_OUTCOMES` values are projected onto
  this smaller set via `projectRunOutcomeToControlResult` (e.g. both
  `unsupported` and the true `not-applicable` run-outcome project onto the
  SAME `not-applicable` control-result — a deliberate, documented
  many-to-one collapse for POLICY purposes, per that function's own header
  comment).

AC13's six human-facing terms are a DIFFERENT, coarser layer on top —
**doc/report-facing language, not a fourth machine enum** — and must be
defined so that a reader never conflates the two terms the AC names
explicitly (`unavailable` vs. `not-applicable`), even though the machine
layer beneath them sometimes legitimately collapses distinctions humans still
need to keep separate in prose. Definitions (author these six, verbatim in
substance, your own wording is fine as long as the meaning and the
distinctions below survive):

1. **clean** — the v1, severity-based reading: the scan ran and found no
   blocking-severity finding. Says NOTHING about whether every required
   capability was actually exercised — a scan can be `clean` and still
   `incomplete` (a skipped required capability produces no findings to be
   unclean about, yet the plan is not satisfied). This is precisely why v2
   was added as ADDITIVE, never replacing v1 (CYB-2F).
2. **complete** — the v2, policy-based reading: `aggregateVerdict().blocking
   === false` — every capability the plan required reached an accepted
   outcome (`pass`, `findings`, or `waived` per `ACCEPTED_AGGREGATE_
   OUTCOMES`). A scan can be `complete` yet NOT `clean` (a `findings` outcome
   is accepted as "complete" — the capability ran and reported — while the
   underlying finding may still separately block via v1's severity check).
   `clean` and `complete` are independent axes, not synonyms and not a
   strict ordering.
3. **unavailable** — a capability that SHOULD apply (it is in-scope for this
   project/module) but could not be verified right now — the tool wasn't
   installed, execution errored out, or coverage was cut short. This is a
   TEMPORARY/environmental gap, not a statement about relevance. Maps to
   `RUN_OUTCOMES`' `execution-unavailable`/`partial-coverage`/`stale` (and,
   when the capability was REQUIRED, `required-capability-missing` too — see
   the F-3 ratified projection: required+missing → `not-met`, i.e. treated as
   a hard failure at the policy layer even though the human-facing word here
   is still "unavailable," not "not-applicable").
4. **unsupported** — a capability that does not and CANNOT apply to this
   ecosystem/environment at all (e.g. a JVM-dependency scanner against a
   pure-JS repo) — a STRUCTURAL fact about the project, not a transient gap.
   Maps to `RUN_OUTCOMES`' `unsupported`. **This is the term AC13 requires
   staying distinct from `not-applicable` at the prose level**, even though
   both project onto the SAME `CONTROL_RESULTS` value
   (`not-applicable`) — the machine layer's collapse is a deliberate policy
   simplification (both mean "does not block"), but a human reading a report
   still needs to know WHICH of the two is true (an unsupported scanner is a
   standing environmental fact worth noting once; a not-applicable control is
   a per-resolution scoping decision) — conflating them in prose hides which
   one it actually was.
5. **waived** — an explicit, authorized, time-bounded exception was granted
   (CYB-1d's waiver lifecycle) — the capability was NOT run/passed on its own
   merits, a human explicitly accepted the gap. Maps 1:1 to `RUN_OUTCOMES`'/
   `CONTROL_RESULTS`' `waived`. Never silently equivalent to `complete` in
   prose — always name that a waiver, not a genuine pass, is in effect.
6. **not-applicable** — the capability was never in scope for this
   resolution to begin with, independent of whether it COULD have run
   (CYB-1's L1 applicability resolver decided this control doesn't apply
   here at all — a SCOPING fact, decided once per policy resolution, not an
   execution-time observation). Maps to `RUN_OUTCOMES`'s own `not-applicable`
   member (the SKIPPED+optional branch) AND is the same projection target as
   `unsupported` (see #4) — but the PROSE distinction from `unsupported`
   still matters (see #4's own explanation) and the PROSE distinction from
   `unavailable` is the one AC13 names explicitly: `not-applicable` means
   "never relevant"; `unavailable` means "relevant but not verifiable right
   now." These are opposite claims, not degrees of the same thing — a doc
   that uses them interchangeably is actively misleading (an `unavailable`
   required capability blocks the policy; a `not-applicable` one never did).

## Field 2 — Goal (mechanics — where your own work starts)

1. Add a new section to `guardrails/security.md` (new rule `SEC-09`, following
   the file's existing `SEC-xx` format exactly — MUST/MUST NOT bullets, Why,
   Verification) titled something like "Six-term completeness vocabulary is
   closed and non-conflating," containing the six definitions from Field 1
   (your own prose wording, but preserving every distinction stated there,
   especially the `unavailable` vs. `not-applicable` and `clean` vs.
   `complete` pairs) plus one small table cross-referencing each term to its
   `RUN_OUTCOMES`/`CONTROL_RESULTS` machine-layer mapping (a compact table is
   fine, does not need to restate the full reasoning already in
   `security-evidence-evaluator.mjs`'s header comment — link to that file
   instead of duplicating its design notes).
2. Write a new lint script, `plugins/pipeline-core/scripts/check-completeness-vocabulary-doclint.mjs`,
   no CLI args beyond an optional `--root` (default `process.env.
   CLAUDE_PROJECT_DIR || process.cwd()`), plain exit-code contract (0 = pass,
   2 = fail), that scans a defined SET of project docs (start with
   `guardrails/security.md`, `guardrails/quality-gates.md`, and
   `docs/operating-model.md` — state your chosen file list explicitly in your
   report; do not silently scan the whole repo tree, that would catch this
   very briefing file's own necessarily-repetitive prose as a false
   positive) for the specific conflation pattern AC13 names: a doc sentence
   that uses `unavailable` and `not-applicable` as if interchangeable (e.g.
   an explicit phrase like "unavailable (not applicable)" or "not-applicable,
   i.e. unavailable" or similar direct-equivalence phrasing — you decide the
   precise detection heuristic, since natural-language conflation detection
   inherently needs some designed pattern; state your chosen heuristic and
   its known false-positive/negative limits honestly in your report rather
   than overclaiming perfect detection).
3. Register the new lint script as a new plain `TEST_SUITES` entry in
   `harness/scripts/verify.mjs` (same pattern as the neighboring
   `spec-retention-check`/`doc-contract-check` entries — a script-execution
   entry, not necessarily a `.test.mjs` file, since this is a direct lint
   check rather than a unit-tested module; but DO also write a small
   `.test.mjs` for the lint script itself, proving it correctly flags a
   deliberately-conflating fixture string and passes on non-conflating
   prose — the lint script needs its own regression coverage like any other
   check script in this repo).

## Field 3 — Definition of Done (checks)

1. `guardrails/security.md` gains `SEC-09` with all six terms defined,
   preserving every distinction named in Field 1, plus the machine-mapping
   table.
2. New lint script + its own small test file, both `node --check` clean.
3. Lint script's own test file proves: (a) a fixture doc containing an
   explicit unavailable/not-applicable conflation phrase → exit 2 with a
   clear reason naming the offending file/line; (b) the CURRENT real content
   of the three scanned docs (as of your dispatch) → exit 0 (i.e. running
   your finished lint against the real repo docs, including your own new
   `SEC-09` section, must pass — if your own new prose accidentally trips
   your own lint, fix the prose, not the lint).
4. New `TEST_SUITES` entry/entries added to `verify.mjs` — confirm via `git
   diff -- harness/scripts/verify.mjs` that this is the ONLY change to that
   file (one or two new array entries, nothing else).
5. Report includes: your exact scanned-file list, your conflation-detection
   heuristic in plain language plus its known limits, and confirmation the
   lint passes clean against the real repo state after your own doc edit.

## Field 4 — Prohibitions

- MUST NOT change the machine-layer vocabularies themselves
  (`RUN_OUTCOMES`/`CONTROL_RESULTS` in `security-evidence-evaluator.mjs`, or
  any `guard-push.mjs`/`security-completeness-gate.mjs` logic) — this task is
  documentation + a lint script only.
- MUST NOT redefine or soften any of the six Field-1 distinctions to make
  your own lint or doc pass more easily — if your own prose trips your lint,
  fix the prose's wording, never the definitions' substance.
- `verify.mjs` edit scoped to the new lint entry/entries only — no other line
  may change.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.

## Field 5 — Stop conditions

- You find an EXISTING doc (in your scanned set or otherwise) already
  contains a genuine `unavailable`/`not-applicable` conflation predating this
  task → do not silently rewrite unrelated existing prose; report it as a
  finding for the Elephant instead (fixing it may be its own small follow-up,
  not silently bundled here without visibility).
- The six-term reconciliation in Field 1 turns out to be internally
  inconsistent against the actual current code (e.g. you find
  `security-evidence-evaluator.mjs` has changed since this briefing was
  written in a way that breaks a stated mapping) → STOP and report the exact
  discrepancy rather than silently adjusting the taxonomy yourself.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-5.
