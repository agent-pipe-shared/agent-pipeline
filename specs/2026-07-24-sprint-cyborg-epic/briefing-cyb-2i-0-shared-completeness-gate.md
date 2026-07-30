# Briefing — CYB-2I-0: extract a shared, reusable security-completeness gate (Wave 6, foundation)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-0 (Sprint Cyborg epic, Wave 6,
  `cyb-2i-1h-body-slicing.md` §1 row 1 — foundation, first, isolated).
  Depends on CYB-2F (`guard-push.mjs` v2 wiring, CLOSED —
  `a54a060`/`8dd7839`/`79e04f8`/`b77b03f`).
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (confirm via `git log
  -1 --format=%H` at dispatch time — expect `c34de9c` or later in history).
  Working tree must be clean before you start; keep it clean; end with
  exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — justified: this touches
  `guard-push.mjs`, the highest-risk file in the whole epic (per
  `cyb-2-body-slicing.md`'s own CYB-2F row: "Highest-risk file in the whole
  package, push-gating-critical"); the exported function's parameter shape is
  a real, one-shot design decision that three future call sites (CYB-2I-1/2/3)
  will all depend on getting right; and it requires a full behavior-preserving
  regression proof, not just a passing test.
- **Profile:** epic, execution phase.
- **Why this exists (context, not yours to re-litigate):** AC8
  ("Push/PR/Close/Release consume the same completeness evaluator... no
  parallel duplicate evaluator") requires ONE reusable function. Today,
  `guard-push.mjs`'s `checkSecurityEvidenceV2` (lines ~1325-1443) is a
  **private, non-exported function** that closes over several outer-scope
  values (`sourceCommit`, a `readEvidence()` closure bound to
  `evidenceProjectDir`, hard-coded relative evidence-file paths) — nothing
  outside this file can call it. This task extracts that orchestration logic
  into a standalone, exported, parameterized module so CYB-2I-1 (PR),
  CYB-2I-2 (Close), and CYB-2I-3 (Release) can each import and call the exact
  same function later, instead of each hand-rolling their own copy.

## Field 1 — Goal

Create a new module, `plugins/pipeline-core/lib/security-completeness-gate.mjs`,
exporting one function (working name `checkSecurityCompleteness` — you may
rename if you find a clearer name, state why) that reproduces
`checkSecurityEvidenceV2`'s exact current logic (binding proof, per-capability
outcome reconciliation, the `{"invalid","execution-unavailable"}` tolerance,
missing-evidence fail-closed default — all of it, unchanged) but takes its
inputs as **explicit parameters instead of closed-over outer scope**:

```js
// working signature — adjust naming/shape if you find a cleaner one, justify in your report
function checkSecurityCompleteness({ projectDir, commit, tree, envelopePath, verdictPath }) {
  // envelopePath/verdictPath should default to "evidence/security-latest.v2.json" /
  // "evidence/security-latest.v2.verdict.json" so existing callers don't need to
  // repeat the literal, but must remain overridable (a future call site may bind to a
  // different candidate location, e.g. a PR's own detached-worktree candidate dir).
}
```

The function must:
1. Read the two evidence files relative to `projectDir` (own local
   read+JSON-parse helper — do not import or depend on anything from
   `guard-push.mjs`; this module must have zero import relationship with any
   hook file, only with `security-evidence-evaluator.mjs`'s existing exports
   `evaluateAllCapabilities`/`aggregateVerdict`/`validateSecurityEvidenceV2`).
2. Bind the envelope's `input.commit`/`input.tree` against the passed-in
   `commit`/`tree` parameters (exactly the same two checks currently inline
   at lines ~1351-1356) — no `git rev-parse` inside this module; resolving
   `tree` is the CALLER's job (mirrors today's `resolveSourceTree()` staying
   in `guard-push.mjs`, unchanged).
3. Reproduce the full schema validation, plan/verdict shape checks, the
   `evaluateAllCapabilities`/`aggregateVerdict` reconstruction, the
   per-capabilityId `outcomeMatches`/`AMBIGUOUS_ERROR_OUTCOMES` comparison,
   and the final `offendingCapabilities` failure-line generation — byte-for-byte
   equivalent output to today's function for every input shape, just sourced
   from parameters instead of module-level closures.
4. Return the exact same `string[]` shape (empty = pass) with the exact same
   failure-message text `checkSecurityEvidenceV2` produces today (a caller
   diffing old vs. new output must see zero change for any given input).

Then refactor `guard-push.mjs`'s call site (~line 1460,
`failures.push(...checkSecurityEvidenceV2(resolveSourceTree()))`) to import
and call the new shared function instead, passing
`{ projectDir: evidenceProjectDir, commit: sourceCommit, tree:
resolveSourceTree() }` (default `envelopePath`/`verdictPath`). Delete the
now-dead private `checkSecurityEvidenceV2` function from `guard-push.mjs`
entirely (do not leave a thin wrapper that just forwards — the whole point is
one real implementation, not two).

**This is a pure refactor — zero externally observable behavior change.**
`guard-push.test.mjs` and `guard-push-v2.test.mjs` must produce byte-identical
pass/fail counts and failure-message text before and after (98/99 and 9/9
respectively, same sole failing case `PG26a`).

## Field 2 — Context files (read first)

- `plugins/pipeline-core/hooks/guard-push.mjs` — study lines ~1237-1250
  (`resolveSourceTree`, stays here, unchanged), ~1282-1443 (the full
  `checkSecurityEvidenceV2` you are extracting, including its header comment —
  port the relevant parts of that comment into the new module, don't just
  delete the institutional knowledge it encodes), ~1189-1201 (`readEvidence`'s
  current shape, closing over `evidenceProjectDir` — your new module needs an
  equivalent that takes `projectDir` as a parameter instead), and the call
  site at ~1450-1461.
- `plugins/pipeline-core/lib/security-evidence-evaluator.mjs` — READ ONLY, do
  not edit. Confirms the exact exported signatures of
  `evaluateAllCapabilities`, `aggregateVerdict`, `validateSecurityEvidenceV2`
  your new module continues to import unchanged.
- `plugins/pipeline-core/hooks/guard-push-v2.test.mjs` — the existing 9-case
  regression suite for the v2 logic (`PGV2-01`..`PGV2-09`). These tests
  currently exercise `checkSecurityEvidenceV2` indirectly by running the whole
  `guard-push.mjs` CLI as a subprocess (confirm this by reading the test
  harness's `run()`/fixture pattern) — after your refactor they must continue
  to pass unmodified, since they test observable CLI behavior, not the
  internal function shape. Do not edit this file's test cases; if your
  refactor requires ANY change to this file, STOP and report why (it is
  TP-5-protected; you have no test-path lift for this dispatch).
- `plugins/pipeline-core/hooks/guard-push.test.mjs` — same protection status
  (TP-5) and same expectation: full regression, zero edits.
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2i-1h-body-slicing.md` — §1 row
  CYB-2I-0, §3 open item 1 (this task's own design-decision framing).
- `specs/2026-07-24-sprint-cyborg-epic/cyb-2-feature-spec.md` — AC8, the
  requirement this extraction exists to satisfy.

## Field 3 — Definition of Done (checks)

1. New file `plugins/pipeline-core/lib/security-completeness-gate.mjs`
   exporting the extracted function (parameterized per Field 1), with its own
   local evidence-read helper, importing only from
   `security-evidence-evaluator.mjs` — no import from any `hooks/*.mjs` file,
   no import of anything `guard-push.mjs`-specific.
2. `guard-push.mjs`'s private `checkSecurityEvidenceV2` function is deleted;
   its call site now imports and calls the new shared function with the
   parameter shape from Field 1; `resolveSourceTree()` stays in
   `guard-push.mjs` unchanged (still shared with `checkSecurityEvidenceBinding`,
   Finding 5's fix from CYB-2F is not undone).
3. New unit tests for the extracted module itself (new file, e.g.
   `plugins/pipeline-core/lib/security-completeness-gate.test.mjs`) covering
   at minimum: fresh+bound+non-blocking pass, fresh+bound+blocking failure
   lines, missing envelope/verdict fail-closed, mismatched commit/tree
   binding failure, the `{"invalid","execution-unavailable"}` tolerance case,
   and one genuine non-tolerated outcome mismatch (mirror `PGV2-08`/`PGV2-09`'s
   intent at the unit level, one layer below the CLI-subprocess tests).
4. **Behavior-preservation proof (mandatory):** `guard-push.test.mjs` 98/99
   (same `PG26a` sole failure) and `guard-push-v2.test.mjs` 9/9, BOTH
   unmodified, both run before-and-after your change (report exact case
   counts and confirm identical failure-message text for the intentionally
   failing case).
5. `node --check` on every file you touch or add.
6. Report includes: final exported function name/signature (if you renamed
   it from the working name, why), confirmation no `hooks/*.mjs` import
   exists in the new module, the before/after regression counts for both
   existing suites, and the new unit-test count/results.

(Full aggregate `node harness/scripts/verify.mjs` + independent Critic + PO
gate remain the Elephant's post-dispatch responsibility, not yours.)

## Field 4 — Prohibitions

- MUST NOT change any observable behavior of `guard-push.mjs`: same triggers,
  same failure messages, same exit codes, for every existing test case.
- MUST NOT edit `guard-push.test.mjs` or `guard-push-v2.test.mjs`
  (TP-5-protected; no test-path lift granted for this dispatch). If passing
  either requires an edit to either file, STOP and report — do not request or
  attempt a guard-config lift yourself.
- MUST NOT edit `security-evidence-evaluator.mjs`, `security-scan.mjs`, or
  any `security-adapters/*.mjs` — import their exports only.
- MUST NOT touch `harness/scripts/verify.mjs`, `.claude/pipeline-state.json`,
  or `.claude/guard-config.json`.
- Leave a thin re-exporting wrapper in `guard-push.mjs` ONLY if you find a
  concrete reason the call site cannot cleanly import the new module directly
  (state the reason); otherwise call the new module directly, no wrapper.
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line; NO
  `Co-Authored-By` / `Claude-Session` trailers (GIT-03). Do not push. One
  atomic commit.
- Do not weaken, skip, or platform-gate away a genuine test failure to make
  things green.

## Field 5 — Stop conditions (return to Elephant, clean, no partial commit)

- Achieving byte-identical behavior would require any change to
  `guard-push.test.mjs`/`guard-push-v2.test.mjs` → STOP and report the exact
  gap; do not edit either file.
- The existing `guard-push.test.mjs`/`guard-push-v2.test.mjs` baseline cannot
  be reproduced (failures beyond the known clean baseline: 98/99 with only
  `PG26a`, and 9/9) before you change anything → STOP (environment problem,
  not your diff).
- You find the current `checkSecurityEvidenceV2` behavior is itself
  ambiguous or inconsistent in a way that makes "preserve it exactly" an
  ill-posed goal (e.g. you discover a genuine bug while porting it) → STOP
  and report the specific case rather than silently fixing or silently
  reproducing a bug into the new module.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + a condensed report covering DoD 1-6: final
function name/signature, the before/after regression counts for both
existing suites (byte-identical failure-message confirmation for `PG26a`),
new unit-test results, and confirmation of zero `hooks/*.mjs` imports in the
new module.
