# Critic review — R1 implementation (`986b540`, `b0ca256`), round 1

**Review object:** the two R1 implementation commits. Full first-pass review;
guardrail class, higher-capability review model at max.

**Verdict: PASS, with one minor finding (F1) and one briefing violation observed
against the dispatch.**

**Transcription note.** Persisted by the Elephant from the dispatch's returned
report. Verbatim apart from this header and the transcription of machine-specific
absolute paths to repo-relative form. The reviewer confirmed the reviewed content
itself carries no absolute paths.

---

Route: claude-opus-5 at max, as requested. Effective model identity: **unknown** —
no direct same-dispatch evidence observed the effective route; I do not infer it
from a selector or host label.

T1 assurance: `functional-equivalent-read-only; OS isolation not asserted`.
Write-capable host, disclosed residual; no write tool or mutating command invoked,
no delegation. I created no scratchpad subdirectory (nothing needed writing); I
found no pre-existing scratch state.

Auto-injected context disclosed: project `CLAUDE.md`, user auto-memory, user email,
current date, and a parent-session-start git status/commit-log snapshot. Per the
snapshot ban I used none of it as a freshness reference.

Both checks named in the resume completed, and both files were already pinned at
the reviewed revision — `git grep … b0ca256 -- <path>` was used for
`guard-lifecycle-ready.mjs`, `guard-gate-strength.mjs` and
`guard-maintenance-window.mjs` throughout, never the working tree. The 0.5.3 merge
that landed after the review object therefore touches no claim below.

## 1. Findings

### F1 — The new module's two cross-references to the caller point past the end of that file (minor)

**Gap.** `plugins/pipeline-core/lib/self-application-attestation-gate.mjs:102` and
`:116` both cite the caller's `status` ternary at `pipeline-start-preflight.mjs`
`:294-298`, hedged as "at the time of writing". At the time of writing — the same
commit `986b540` — that file is **286 lines long** and its `status` ternary begins
at **`:214`**. Lines 294-298 do not exist. The "at the time of writing" hedge
disclaims later drift; it does not cover being out of file bounds on arrival.

**Risk (minor).** A reader following either pointer lands past EOF and has to
re-find the target by hand. The aggravating factor is cost of repair, not severity:
once GS-9 binds after the next plugin refresh, this module is not agent-writable at
all in a governed checkout (design §I.1.3 residual 3), so a one-token comment fix
becomes a PO hand-edit outside an agent session. The cheapest moment to fix it is
before that refresh. Not caught by any gate: `check-doc-contracts.mjs` does not read
`.mjs` comments.

**Evidence.** `plugins/pipeline-core/lib/self-application-attestation-gate.mjs:102`,
`:116`; `plugins/pipeline-core/scripts/pipeline-start-preflight.mjs:214` and its
286-line length, both measured at `b0ca256`.

**Spec-ref.** Design §I.1.5, caller row: the two forward references "must name their
target instead of pointing at it … carried over unchanged they refer to nothing."
The implementor performed half the instruction (named the file) and carried the
pre-change line numbers over unchanged, so the citations still refer to nothing —
the condition the instruction exists to prevent.

**Stated in fairness:** the design's own example string in that row literally
contains `:294-298`, so the implementor followed the example verbatim. That example
was written against the pre-change file, where the range was correct.

No other candidate survived the evidence gate. No blocker, no major.

## 2. Deliberately not flagged

**Behavioural equivalences re-derived independently** (reading `git show d93e9b3:…`
against `git show b0ca256:…` in full, not the submitted proof):

- Predicate `pluginRootHasSelfApplicationGit` — character-identical, doc comment included.
- The attestation block — character-identical modulo indentation and the two
  `attempted` statements: observer-default expression, the `version &&`
  short-circuit (an unreadable manifest still skips the observer), the
  self-referential `observe({ sourcePluginRoot, installedPluginRoot }, {})` call
  shape, the `PUBLIC_SELF_APPLICATION_ORIGINS.has(observation.candidate?.repository)`
  comparison, all six fields of the `normalizeRulesetSource` object with both
  identities drawn from the same `contentSha256`, and
  `attestationFailed = !originAllowlisted || normalized?.status !== "ready"`.
- Evaluation order: `resolvedObserve` is computed unconditionally at the identical
  execution point in both; moving it into callee scope is unobservable.
- Absent/malformed inputs: `existsSync` never throws; the three optional-chaining
  guards are unchanged; `observation.plugin.name` is an unguarded access in **both**
  versions, so a `ready` observation lacking `plugin` throws in both — pre-existing,
  not introduced.
- Error escape: an exception from the observer propagates out in both; no new catch,
  nothing swallowed, no different caller reached.
- Caller consumption: pre-change read the local `attestationFailed`, post-change
  reads `.failed` of the returned pair — same value; `attempted` is unused by the
  caller and is the `{ attempted, failed }` shape §I.1.3 specifies.
- Export-surface change: repo-wide grep at `b0ca256` shows
  `pluginRootHasSelfApplicationGit`'s only definition and only call site are inside
  the new module; no test and no script imports it.
- Dropped imports: zero remaining references to `existsSync`,
  `PUBLIC_SELF_APPLICATION_ORIGINS`, `normalizeRulesetSource`/`RULESET_SOURCE_SCHEMA`
  in the caller (AC-R1-3 satisfied); `readFileSync` and `resolve` still used. Exactly
  one blank line remains at the seam.
- Guard entry: frozen-object shape and field set identical to GS-1..GS-8;
  `gateStrengthRuleFor` lowercases both sides and the path is already lowercase, so
  it matches; the named path is the path the module actually occupies; no duplicate
  or shadowing entry; `id` appended after GS-8 with GS-1..GS-8 unrenumbered.
- **Guard reachability:** at `b0ca256`, `guard-lifecycle-ready.mjs:30` imports the
  table and `:206` derives `needles = GATE_STRENGTH_PATHS.map((rule) => basename(rule.path))`
  — GS-9 is picked up automatically on the shell lane; nothing about the entry is
  inert. GST17/GST01 iterate the table, so both lanes are asserted without editing a
  test.
- Factual claims inside the new module's blind-spot block, each verified at
  `b0ca256`: the write lane's inline marker literal has exactly five entries;
  `GOVERNANCE_MARKERS` is six literals plus the runtime-projection targets, deduped —
  a longer and differently-composed list; `NEVER_LIFTABLE_KERNEL_PATHS` contains
  neither the new module nor GS-8's module; GS-6 is evaluated first and independently,
  with the path table reached only `if (matched === null)`, so the enforcing copy
  matches GS-6 and not GS-9 exactly as residual 3 states.
- Packaging: `plugins/pipeline-core/.claude-plugin/plugin.json` carries no `files`
  allowlist, so the new lib module ships with the plugin — no "module missing from the
  installed copy" failure.
- Dependency reality: all five imported symbols exist under exactly those names. No
  new external package, action or image. SPDX header matches its three sibling lib
  modules exactly.
- Security/secrets: no machine-specific absolute path, no credential or private
  identifier in any committed line of the three files. Trust boundary neither widened
  nor relocated: the exported evaluator is pure, the caller still owns the decision,
  and the predicate was already exported before the move.

**Behavioural equivalences NOT re-derived** (read-only mandate): no test suite,
no `verify.mjs`, and the submitted equivalence proof was not re-executed.
GST01/GST17 behaviour against the new entry was traced statically through the guard
source, not exercised. The internals of `public-core-observation.mjs` and
`ruleset-source.mjs` (outside the diff) were not inspected, and no real
marketplace-install topology was tested.

**Candidates examined and dropped:**

- *Missing `self-application-attestation-gate.test.mjs`.* Listed as a new file in
  §I.1.5 and specified in §I.1.6, absent at `b0ca256`. Dropped: `guardrails/quality-gates.md:63`
  (QG-04) states an implementation Goldfish **MUST NOT create** the tests that
  validate its own implementation. Creating it here would have been the violation. It
  belongs to a separate briefed test-change task alongside AC-R1-7.
- *Verify gate not run.* Recorded as `"result": "not run"`, `"substitute": "none"` —
  an honest non-substitution rather than a faked green.
- *TP-6's reason string in the neutral-tier guard configuration still says
  "GS-1..GS-7"* while the table now ends at GS-9. Pre-existing drift (GS-8 predates
  this diff), the file is GS-4-protected, and no spec row asks this diff to touch it.
- *The `ruleset-source.test.mjs` verify-registration gap* — §I.1.3 measures it and
  explicitly assigns it elsewhere.
- *QG-06 test.* The module's "WHAT GS-9 DOES NOT COVER" block is a QG-05 blind-spot
  statement whose four residuals are each stated and bounded in §I.1.3. Specified
  scope, not a TODO-without-owner dodge. Each of the four was checked against source
  and found accurate, not softened, and not overstated.
- *Language assignment.* New module, comments and both commit messages are
  English-canonical. Correct for agent-facing Public-Core code.

**R1 completeness, stated explicitly because AC-R1-8 requires it:** this diff does
not complete R1. Outstanding by design — AC-R1-5 (verify green with the new suite
actually run), AC-R1-7 (`harness/scripts/verify.mjs` registration; confirmed absent
at `b0ca256`, while the GS-8 analogue sits at `:330`), AC-R1-8 (the protected-test-path
row; confirmed absent — that list ends at TP-11), and the export-set assertion half
of AC-R1-1. AC-R1-6 and AC-R1-9 are report criteria; the implementation report is
inadmissible input for a Critic, so **not verifiable** is returned on both rather
than a judgement.

## 3. Trajectory check

**Consistent**, with three observations resolved rather than accepted.

The claimed checks were run and the artifacts are machine-written. Baseline
`21:32:15→21:32:17.660Z`, commits `21:38:17Z` / `21:38:25Z`, final checks
`21:38:33.090→21:38:35.767Z`, equivalence proof `21:39:06Z`, dispatch record
`21:40:10Z`; artifact mtimes match those timestamps to the second. Exit codes and
command strings match the dispatch record, and the captured tails show
`32 pass / 0 fail` and `19 passed, 0 failed`.

- **The equivalence artifact is genuinely derived, not hand-written to agree.**
  Re-derived rather than accepted: the generator pins
  `BASE_REV = "d93e9b31701ed73403c02c821894bd506eea6726"` with the comment "Pinned
  rather than `HEAD` so the proof stays reproducible after the commit", extracts by
  `git show ${BASE_REV}:…` and slices on literal anchors. The emitted reference
  matches `d93e9b3` exactly. The one disclosed departure — `attempted = true`
  inserted as the first statement of the `if` — is declared in the dispatch record's
  `deviations`, is write-only in the reference, and cannot affect the `failed` value
  the caller consumes.
- **Two stale self-labels in that generator**: its header comment and the string it
  writes into the generated file both say "from git HEAD", contradicting the pinned
  `BASE_REV` three lines below and the `referenceBuiltFrom` field it records.
  Substance verified independently, so this is a labelling inaccuracy in an
  uncommitted artifact, not a repo-content defect — but the artifact is **not
  self-verifying** and should not be trusted on its own provenance claim.
- **Baseline was taken one commit early.** It ran at 23:32:17 local; the declared
  `baseRevision` `d93e9b3` was committed at 23:33:33, so HEAD at baseline was
  `67663c9`. `d93e9b3` is docs-only, so the code baseline is unaffected.
- **The 498→499 markdown delta between baseline and final** is fully accounted for by
  `df28570`, which landed between the reviewed commits and the final check run.
  Docs-only, so the two suites are unaffected.

**Authorship (EL-01/EL-16): clean.** Both production commits carry the trailer
`Dispatch: PHX-R1-IMPL (goldfish)`; the dispatch record names role `goldfish (deep
tier)`, dispatcher `elephant`, and enumerates exactly the two SHAs and exactly the
three files measured independently. No orchestrator-authored production diff. No
prohibited provider/model co-author trailer, session URL/ID or account identifier.

**Scope: clean.** Files touched are exactly the three §I.1.5 rows available to an
implementation dispatch. No test file modified, skipped, weakened or newly
tolerated; no unlisted file touched.

## 4. Briefing violations observed

**One.** The dispatch embeds a look-here list, contrary to `CLAUDE.md` ("Dispatch
from the template, never freehand … the template already forbids what a
hand-written briefing reliably smuggles in — a claims-to-verify list, a hunt list")
and `templates/prompts/critic-review.md` §2. Specifically: "Look specifically at:
the observer default and whether it is still selected the same way, evaluation order
and short-circuiting, what happens when each input is absent or malformed, whether
any thrown error now escapes to a different caller, and whether the caller consumes
the same value it did before", and the parallel list for the guard entry. Reported
because the rule is unconditional, not because it worked: it did not narrow the
search, and the only surviving finding — the out-of-bounds line citations — lies
outside the supplied list.

Two items judged **not** violations, recorded for transparency: the numbered "Hunt
in this order: 1..10" enumeration reproduces the Critic's own contractual search
surface rather than substituting the Elephant's hypotheses for it; and the "bare
facts" about the post-`b0ca256` merge are scoping information needed to construct
the view correctly, carrying no rationale or expected conclusion. The aside "a
residual it states explicitly is specified behaviour, not a defect of the diff" is a
correct statement of the spec-as-contract rule, but it does pre-frame a whole
candidate class — each of the four residuals was tested against source independently
rather than taken.

No completion-report prose, summary, chat history, implementor reasoning or prior
verdict reached the reviewer.

## 5. Verdict

**PASS**, with one minor finding.

The behaviour-preserving half holds: the extraction was re-derived against `d93e9b3`
independently and is textually identical apart from the specified
`{ attempted, failed }` wrapper, with evaluation order, short-circuiting, failure
paths, error escape and the caller's consumed value all unchanged. The guard half
holds: the GS-9 entry is well-formed, matches its siblings, names a path that exists,
is reachable on the write lane by path and on the shell lane by derived needle, and
is not inert or bypassable beyond the four residuals the design states and bounds.

Two things the Elephant should act on:

1. Fix F1 (`self-application-attestation-gate.mjs:102`, `:116` → `:214`) **before**
   the plugin refresh that makes GS-9 enforcing. Afterwards it is a PO hand-edit.
2. Do not record R1 as complete. AC-R1-5, AC-R1-7, AC-R1-8 and the export-set
   assertion half of AC-R1-1 remain open, and AC-R1-6/AC-R1-9 are report criteria
   that cannot be verified by a Critic.
