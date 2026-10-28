# Recon: baseline-red test files, family A (partial, interim)

Candidate 2045ea7e3586fa9585257e84e6cce79cfeb18960, scratch clone (git clone --shared, detached at the candidate).
Each file run once with `node <file>` in the clone; logs were written by the driver. No patch delivered (notes only).
Tool budget ended at call 32 of 40: this note is INTERIM. Items marked NOT REACHED were not analysed.

## 1. plugins/pipeline-core/lib/critic-generic-batch.test.mjs

| Item | Finding |
|---|---|
| Failing names | CGB002, CGB003 (only these two; everything else green) |
| Error | `SessionCriticFinalizerError` code `SCF-ORIGINAL-SOURCE-UNAVAILABLE`, thrown at `scripts/session-critic-finalizer.mjs` line 105 inside `originGate` (line 98), called from `finalizeSessionCriticReview` line 546; test frame `critic-generic-batch.test.mjs:48` (`review()` helper) |
| Class | FIXTURE (stale against the later "Cut A" origin gate; not machine dependent) |
| Evidence | `originGate` (lines 98-106) returns only when `deps.readOriginalSourceReturnFn` yields a record, or `options.allowCallerAuthoredFallback === true` (line 102); otherwise it fails. The default reader `unavailableOriginalSourceReader` (line 97) always fails. The test helper `review()` (test lines 38-52) builds `options` (line 42-44) and `deps = {preflightCriticDispatchFn, modelRoleEnvironment}` (line 45) with neither. `session-critic-finalizer.test.mjs` lines 683-685 shows the sanctioned opt-in: `allowCallerAuthoredFallback: true` in the request options, strictly `=== true`. |
| Smallest fix | Test-only, 1 line: in `review()` add `allowCallerAuthoredFallback:true` to `options` (line 42-44; `finalizeSessionCriticReview({...options,verdict},deps)` forwards it). Alternative: pass `readOriginalSourceReturnFn` in `deps`. File is NOT in the protected list (TP-1..TP-13). |
| Verified green in clone | NOT REACHED (fix not applied or run); expected to move CGB002 and CGB003 only, since both go through `review()`. Possible follow-on: the receipt/`independence` marker becomes "caller-authored-fallback"; the `assert.deepEqual(consumed.receipt, final.receipt)` at line 50 compares the same object so should hold, unverified. |
| Confidence | High on cause, medium on "one line suffices" |

## 2. plugins/pipeline-core/hooks/guard-dispatch.test.mjs

| Item | Finding |
|---|---|
| Failing names (24 in this run) | GD12, GD13, GD14, GD22, GD23, GD27, GD33, GD34, GD36, GD38, GD39, GD41, GD42, GD43, GD58-GD65. (Earlier notes say 22; this run lists 24 names, count them again before slicing.) |
| Error | e.g. GD12: `exit 2 (expected 0) -- BLOCKED (guard-dispatch): DISPATCH-WRITE-CARRIER-REQUIRED: a write-capable dispatch requires a pipeline-core Goldfish or Critic carrier; repair: select a shipped pipeline-core:goldfish-* or pipeline-c...` |
| Class | Most likely FIXTURE (tests send Plan / general-purpose / Explore / unrelated-subagent packets that the later carrier policy now treats as write-capable); could also be ENVIRONMENT (the guard reads the installed plugin/hooks.json at the user's marketplace, GD65 mentions hooks.json) |
| Evidence | Only the first message of the log was read (log lines 88-133). Production site NOT located; no assertion read. |
| Smallest fix | NOT REACHED. Hypothesis: fixtures need a read-only classification for those packets or a carrier; or the production carrier check is too broad for read-only agent types (would be PRODUCTION). Check where `DISPATCH-WRITE-CARRIER-REQUIRED` is raised in `hooks/guard-dispatch.mjs` and how it decides "write-capable". Note: guard-dispatch.mjs is a hook (protected/custody for the Critic). |
| Confidence | Low |

## 3. plugins/pipeline-core/scripts/pipeline-state.test.mjs (the briefing said `scripts/pipeline-state.test.mjs`; `harness/scripts/pipeline-state.test.mjs` also exists and is TP-5 protected; this is the plugin one)

| Item | Finding |
|---|---|
| Failing names | Whole file aborts (uncaught `ERR_ASSERTION`, process exit 1, no per-test names) |
| Error | `assert.deepEqual(decisionSummary.areas, [], "... must not invent an effective decision for the unowned planned path")` at test line 2218, case label `neutral-only` (first loop item, lines 2180-2221). actual: `[{area:'application', status:'ready', decisions:[], findingCount:0}]`, expected `[]` |
| Class | FIXTURE or PRODUCTION, undecided. `unresolvedPaths` assertion on line 2219 was not reached |
| Evidence | The summary is produced by `lib/architecture-entry-readiness.mjs` (schema at line 253); the fixture is `prepareCalibrationArchitectureFixture` (test line 47) and `prepareApprovedItemCourseFixture`. A later production change appears to emit one "application" area entry with status `ready` for the planned path `src/change.mjs`, where the test expects no area. Production code at lines ~230-260 of `architecture-entry-readiness.mjs` NOT read. |
| Smallest fix | NOT REACHED. Either update the expectation (if "ready application area with zero decisions" is the intended new contract; check `architecture-entry-readiness.test.mjs` line 423 for the current expected shape) or fix the production emission. Decide by reading that sibling test. |
| Confidence | Low |

## 4. lib/guard/sanctioned-args-scripts.test.mjs

CONTRADICTION WITH THE BRIEFING: this file does not exist at the candidate. Only `plugins/pipeline-core/lib/guard/sanctioned-args-scripts.mjs` exists (no test of that name anywhere under plugins/ or harness/; `harness/verify-suites.json` has no match for "sanctioned-args"). Files that import it: `hooks/design-approval-command-admission.test.mjs`, `lib/guard/audit-pack-command-admission.test.mjs`, and the pins `catalogue-admit-prescribed-lifecycle-verbs`, `denial-names-a-diagnosis-it-refuses`, `lifecycle-coordination-commands-refused-as-implementation-writes`, `preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt`. The "sanctioned-args-scripts" red in the composed verify note probably names one of these. NOT RUN. Needs a corrected briefing naming the actual red file.

## 5. plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs

Run launched in the clone (log `cx.codex-pretool-guard.test.mjs.log` in the scratch driver directory) but the result was not read. NOT REACHED.

## Not reached, overall

Sections 2, 3 (decision), 4, 5; no fix was applied or verified green in the clone; no patch and no clone2 apply check. No test file was edited (the write-scope test file `windows-private-dacl-...test.mjs` was untouched; it has no relation to these reds).

## Recommended slice order

1. CGB002/CGB003: test-only one-liner in `critic-generic-batch.test.mjs` (clear cause, smallest).
2. pipeline-state: read `architecture-entry-readiness.test.mjs` near line 423 to decide fixture versus production, then slice.
3. guard-dispatch: locate `DISPATCH-WRITE-CARRIER-REQUIRED`; this is a hook (Critic custody), so recon it before any slice.
4. sanctioned-args and codex-pretool-guard: re-brief with the real file names after a fresh run.
