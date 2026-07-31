# Briefing — CYB-2I-4R: minor vocabulary/wording fixes (Critic F6, F7, F9)

> Dispatch briefing for one `goldfish-implementor` (effort medium) task.
> Fresh context. Deliver a diff + condensed evidence-backed report, or a
> clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-4R (Sprint Cyborg epic, Wave 6 remediation). Fixes
  three `minor`-severity findings from the bundled Wave 6 Critic review
  recorded in `docs/state.md`'s top session-summary section (commit
  `51e2161`). All three are correctness/precision fixes to existing prose or
  a doc-lint's coverage, not new features or architecture changes.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (commit `f7e8b2b` or
  later). Working tree must be clean before you start; keep it clean; end
  with exactly one atomic commit covering all three fixes (they are small
  and thematically related — "vocabulary/wording accuracy" — one commit is
  correct here, not three).
- **Model / effort:** `goldfish-implementor` / medium — each of the three
  fixes below is fully specified; no open design latitude beyond the exact
  wording choices called out as yours to make.
- **Profile:** epic, execution phase.

## Field 1 — Goal

### 1. F9 — fix SEC-09's mapping table (`guardrails/security.md`)

Two problems in the "Machine-layer mapping" table under `## SEC-09`:

**(a) The `invalid` `RUN_OUTCOMES`/`CONTROL_RESULTS` member has no row.**
`security-evidence-evaluator.mjs`'s `RUN_OUTCOMES` enum includes `"invalid"`
(schema-invalid/tampered evidence), which projects to `CONTROL_RESULTS`
`"invalid"`. SEC-09's six terms (clean, complete, unavailable, unsupported,
waived, not-applicable) do not cover this case, and the rule text says a doc
"MUST use exactly these six terms" — leaving a writer with no sanctioned
term for `invalid` evidence, and "unavailable" as the tempting-but-wrong
fallback (exactly the conflation SEC-09 exists to prevent). **Fix:** add an
explicit note (not an eighth prose term — the six-term vocabulary stays
closed) stating that `invalid` falls OUTSIDE the six-term vocabulary
entirely and MUST NOT be described using any of the six terms, least of all
`unavailable` — it is reported as a data-integrity finding through whatever
mechanism this repo already uses for schema/tamper failures (check
`security-completeness-gate.mjs`'s own failure-reason strings for existing
precedent language to point to, e.g. its "envelope schema is invalid"
failure line — cross-reference that, don't invent new terminology).

**(b) The `unavailable` row's parenthetical reads backwards.** Current text:
`` `execution-unavailable`, `partial-coverage`, `stale` (and
`required-capability-missing` **when required**) `` in the `RUN_OUTCOMES`
column, paired with `` `unavailable` / `not-met` when required `` in the
`CONTROL_RESULTS` column. Read `security-evidence-evaluator.mjs`'s
`projectRunOutcomeToControlResult` function (search
`case "required-capability-missing":`): all FOUR run-outcomes
(`execution-unavailable`, `partial-coverage`, `stale`,
`required-capability-missing`) share IDENTICAL projection logic —
unconditionally, none is conditionally grouped. What actually varies by
`required` is the CONTROL_RESULTS projection (`not-met` if required,
`unavailable` if not), not which RUN_OUTCOMES members count as the human
term "unavailable". **Fix:** rewrite the row so the `RUN_OUTCOMES` column
lists all four members unconditionally (no parenthetical implying
`required-capability-missing` is special-cased), and the `CONTROL_RESULTS`
column states the actual conditional correctly: `not-met` when the
capability was required, `unavailable` when it was not.

### 2. F7 — stop saying "the pushed source" at call sites where nothing is pushed

`plugins/pipeline-core/lib/security-completeness-gate.mjs`'s
`checkSecurityCompleteness` produces two failure strings (search `does not
match the pushed source`, two occurrences) that were carried over verbatim
from `guard-push.mjs`. These now surface at the Close, PR, and Release call
sites too, where "the pushed source" is inaccurate and misleading for
debugging (an operator investigating a blocked `/close` or a failed PR gate
gets sent looking for a push that isn't part of that context).

**Fix:** add a new optional parameter to `checkSecurityCompleteness`, e.g.
`subjectLabel = "the pushed source"` (default preserves `guard-push.mjs`'s
exact existing message text and test expectations — confirm this by running
`security-completeness-gate.test.mjs` and `guard-push.test.mjs`/whatever
covers `guard-push.mjs`'s push-gate tests before and after, unchanged count).
Use `subjectLabel` in place of the hard-coded phrase in both failure strings.
Update the three non-push call sites to pass an accurate label:
- `check-close-security-completeness.mjs` → something like `"the sealed
  HEAD commit"` or equivalent accurate-for-Close wording (your exact
  phrasing, keep it short and accurate).
- `check-pr-contributor-gates.mjs` → something like `"the reviewed PR head"`.
- `release-version-plan.mjs`'s `checkReleaseVersionPlanSecurityCompleteness`
  → something like `"the sealed plan's private candidate"`.
`guard-push.mjs`'s own call site does not need to change (the default already
matches its existing accurate wording).

### 3. F6 — doc-lint doesn't verify all six SEC-09 terms are actually present

`plugins/pipeline-core/scripts/check-completeness-vocabulary-doclint.mjs`
currently only scans for `unavailable`/`not-applicable` conflation phrasing
(`CONFLATION_PATTERNS`) — it never asserts the six terms are actually
defined anywhere. Deleting the entire `SEC-09` section from
`guardrails/security.md` would leave the lint at exit 0 (the file still
exists and contains no conflation phrasing, so nothing fires). AC13's full
evidence requirement is "all six terms defined distinctly" — only the
non-conflation half is enforced today.

**Fix:** add a new check to `check-completeness-vocabulary-doclint.mjs`
(alongside, not replacing, the existing conflation check) that verifies
`guardrails/security.md` specifically (the canonical SEC-09 definition
source — do not require the other two scanned files to redefine the
vocabulary, they only need to avoid conflating it) contains a distinct
definition anchor for each of the six terms: `clean`, `complete`,
`unavailable`, `unsupported`, `waived`, `not-applicable`. Match against the
existing prose convention (each term is introduced as a bold list item, e.g.
`` - **clean** — ``) rather than a bare substring search (a bare substring
match on "waived" would false-positive against unrelated prose mentioning
waivers elsewhere in the doc). Missing any one of the six anchors is a lint
failure with a message naming exactly which term(s) are missing.

## Field 2 — Context files (read first)

- `guardrails/security.md` — the full `## SEC-09` section (currently around
  lines 67-145; may have shifted).
- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` — `RUN_OUTCOMES`,
  `CONTROL_RESULTS`, and `projectRunOutcomeToControlResult` (search
  `function projectRunOutcomeToControlResult`).
- `plugins/pipeline-core/lib/security-completeness-gate.mjs` — full file;
  the two failure-string call sites (search `does not match the pushed
  source`) and the function's JSDoc header (update it to document the new
  `subjectLabel` parameter).
- `plugins/pipeline-core/lib/security-completeness-gate.test.mjs` — full
  file; confirm your `subjectLabel` default preserves every existing
  assertion on the exact failure-string text unmodified.
- `plugins/pipeline-core/hooks/guard-push.mjs`,
  `plugins/pipeline-core/scripts/check-close-security-completeness.mjs`,
  `harness/scripts/check-pr-contributor-gates.mjs`,
  `plugins/pipeline-core/scripts/release-version-plan.mjs` — the four
  `checkSecurityCompleteness(...)`/`checkReleaseVersionPlanSecurityCompleteness(...)`
  call sites (grep `checkSecurityCompleteness(` across the repo to find all
  four precisely).
- `plugins/pipeline-core/scripts/check-completeness-vocabulary-doclint.mjs` +
  `.test.mjs` — full files.

## Field 3 — Definition of Done (checks)

1. SEC-09 table: `invalid` note added (not an eighth term); `unavailable`
   row's four-member grouping and required/not-required conditional
   corrected per Field 1.1.
2. `checkSecurityCompleteness`'s two failure strings use a `subjectLabel`
   parameter; `guard-push.mjs`'s existing behavior/tests unchanged; the
   three other call sites pass accurate per-context labels.
3. `check-completeness-vocabulary-doclint.mjs` gains a six-term-presence
   check against `guardrails/security.md` specifically, with a test proving:
   today's real `guardrails/security.md` passes (all six present); removing
   any one of the six from a test fixture fails with a message naming that
   term.
4. All pre-existing tests in `security-completeness-gate.test.mjs`,
   `check-completeness-vocabulary-doclint.test.mjs`, and every test file
   covering the four call sites (`guard-push`'s own tests,
   `check-close-security-completeness.test.mjs`,
   `check-pr-contributor-gates.test.mjs`, `release-version-plan.test.mjs`)
   still pass unmodified. Report before/after counts for each.
5. `node --check` on every file touched.
6. Report states the exact `subjectLabel` wording you chose for each of the
   three non-push call sites and your reasoning if any deviates from this
   briefing's suggested phrasing.

## Field 4 — Prohibitions

- MUST NOT add a seventh/eighth term to SEC-09's closed six-term vocabulary
  — the `invalid` case is documented as explicitly OUTSIDE that vocabulary,
  never folded into it.
- MUST NOT change `guard-push.mjs`'s own observable behavior or test
  expectations — only the shared gate function's new optional parameter and
  the three non-push callers change.
- MUST NOT weaken, relax, or delete any pre-existing test assertion in any
  of the five test files listed in DoD item 4 — only add new ones.
- MUST NOT touch `harness/scripts/verify.mjs` or `.claude/guard-config.json`
  — all touched test files are already registered.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line pointing to
  this briefing; NO `Co-Authored-By` / `Claude-Session` trailers (GIT-03).
  Do not push. One atomic commit.

## Field 5 — Stop conditions

- If changing `checkSecurityCompleteness`'s signature to add `subjectLabel`
  would require touching more than the four known call sites (i.e. you find
  a fifth caller this briefing didn't anticipate) → STOP and report it
  rather than silently updating an undisclosed fifth site.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
