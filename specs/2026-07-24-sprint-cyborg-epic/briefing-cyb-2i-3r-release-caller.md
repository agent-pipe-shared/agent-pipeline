# Briefing — CYB-2I-3R: give the Release AC8 leg a real caller (Critic F5, major)

> Dispatch briefing for one `goldfish-deep` (effort xhigh) task. Fresh context.
> Deliver a diff + condensed evidence-backed report, or a clean stop.

## Field 0 — Dispatch metadata

- **Sub-package:** CYB-2I-3R (Sprint Cyborg epic, Wave 6 remediation). Fixes
  Critic finding F5 (major) from the bundled Wave 6 review recorded in
  `docs/state.md`'s top session-summary section: `checkReleaseVersionPlanSecurityCompleteness`
  (CYB-2I-3, `plugins/pipeline-core/scripts/release-version-plan.mjs:527`) is
  exported and unit-tested but has **zero callers anywhere in the repo**. AC8
  requires each of the four call sites to *consume* the shared evaluator via
  an integration test that asserts the call site invokes it — what exists
  today is a unit test of an uncalled function, not a consuming call site.
- **Candidate base:** `feat/sprint-cyborg-claude` @ HEAD (commit `d167788` or
  later). Working tree must be clean before you start; keep it clean; end
  with exactly one atomic commit.
- **Model / effort:** `goldfish-deep` / xhigh — REAL design latitude: the
  exact shape of the new orchestrating function (naming, error code, whether
  the recovery/replay path also re-checks) is your call within the
  Elephant-fixed constraints below.
- **Profile:** epic, execution phase.
- **Why this exists:** AC8 (`cyb-2-feature-spec.md`) — Push/PR/Close/Release
  all consume the same completeness evaluator. Push (`guard-push.mjs`), PR
  (`check-pr-contributor-gates.mjs`), and Close
  (`check-close-security-completeness.mjs`) each have a real operational
  entry point that calls the gate. Release has no equivalent entry point yet
  — this sub-package builds the minimal one, not a full release-orchestration
  CLI (out of scope, see Field 4).

## Field 1 — Goal

1. **Do not touch `createReleaseVersionPlan()`.** It is intentionally pure
   (zero fs/git access) — this is a hard, already-verified constraint from
   CYB-2I-3 and MUST remain true. Do not add the security check inside it.
2. **Do not modify `storeReleaseVersionPlan()`'s existing behavior.** It is
   idempotent/replay-safe (used for both first-write and recovery-replay of
   an already-sealed plan) — gating it directly would block legitimate replay
   of a plan that already passed the gate once. Read
   `storeReleaseVersionPlan()` and `recoverReleaseVersionPlan()` in full to
   understand why this distinction matters before designing your fix.
3. **Add ONE new orchestrating function** (your own naming, e.g.
   `sealAndStoreReleaseVersionPlan` — justify whatever name you pick against
   this module's existing naming conventions) that sequences, in order: (a)
   accept an already-created, sealed `plan` (the caller is responsible for
   having called `createReleaseVersionPlan()` first — do not fold plan
   creation into this function, keep responsibilities separated exactly as
   they are today), (b) call
   `checkReleaseVersionPlanSecurityCompleteness(plan, { projectDir,
   envelopePath, verdictPath })`, (c) if `failures.length > 0`, fail closed
   (raise via this module's existing `fail(code, message)` helper — pick a
   new, clearly-named error code following the module's `RVP-*` convention,
   e.g. `RVP-SECURITY-INCOMPLETE`, and include the failure reasons in the
   message) WITHOUT calling `storeReleaseVersionPlan()`, (d) if
   `failures.length === 0`, call `storeReleaseVersionPlan({ gitCommonDir,
   repoFingerprint, plan, decision }, { nowMs })` and return its result. This
   new function IS the AC8 call site: its own integration test must assert
   it invokes `checkReleaseVersionPlanSecurityCompleteness` (spy/observe via
   the same evidence-fixture technique the existing unit tests already use —
   do not weaken to a mock that never touches the real function) and that a
   blocking verdict prevents `storeReleaseVersionPlan()` from ever being
   reached (e.g. assert no record/journal file gets written on the failure
   path).
4. **Recovery path:** state explicitly in your report whether
   `recoverReleaseVersionPlan()` (used to replay/repair state for an
   already-journaled plan) needs to go through the new gate too, or whether
   it's correctly exempt because the plan it recovers already passed the
   gate at original seal time. Make a call and justify it — this is exactly
   the kind of judgment call this dispatch's design latitude covers.

## Field 2 — Context files (read first)

- `plugins/pipeline-core/scripts/release-version-plan.mjs` — full file,
  especially `createReleaseVersionPlan` (line ~435), `checkReleaseVersionPlanSecurityCompleteness`
  (line ~527), `storeReleaseVersionPlan` (line ~672), `recoverReleaseVersionPlan`
  (line ~651), `createReleaseVersionPlanJournal` (line ~619), and this
  module's `fail()` helper + existing `RVP-*` error codes (grep `fail("RVP`
  to see the full existing set before picking a new one).
- `plugins/pipeline-core/scripts/release-version-plan.test.mjs` — full file;
  your new integration test(s) go alongside the existing "release plan
  completeness gate (CYB-2I-3)" cases without touching any of the 20
  pre-existing cases.
- `plugins/pipeline-core/hooks/guard-push.mjs` — read the gate-activation +
  call-site block (search `checkSecurityCompleteness`) as a reference for
  how a REAL call site (not a unit test) invokes the shared evaluator and
  fails closed — the shape you're building for Release is analogous, minus
  the push-specific mechanics.
- `plugins/pipeline-core/scripts/check-close-security-completeness.mjs` —
  read in full as a second reference call-site shape.
- `docs/state.md` — top session-summary section only (F5's exact wording,
  commit `51e2161`); do not read further into the file.

## Field 3 — Definition of Done (checks)

1. New orchestrating function added, clearly named and documented (its own
   doc comment states the exact sequencing contract: plan already sealed →
   gate check → store-or-fail-closed).
2. `createReleaseVersionPlan()` and `storeReleaseVersionPlan()` themselves
   remain byte-identical to their pre-diff state (confirm via `git diff`
   showing no hunk inside either function's body).
3. New integration test(s) prove: (a) a blocking security verdict prevents
   `storeReleaseVersionPlan()` from running (no record/journal file written);
   (b) a fresh, bound, non-blocking verdict allows storage to proceed and
   returns the same result `storeReleaseVersionPlan()` itself would; (c)
   missing evidence fails closed the same way the existing unit test for
   `checkReleaseVersionPlanSecurityCompleteness` already proves, but observed
   THROUGH the new orchestrating function this time, not by calling the gate
   function directly.
4. All 20 pre-existing cases in `release-version-plan.test.mjs` still pass
   unmodified. Run the full file; report the before/after count.
5. `node --check` on every file touched.
6. Report states your recovery-path decision (Field 1 step 4) with reasoning.

## Field 4 — Prohibitions

- MUST NOT build a full release-orchestration CLI, a new script file, or any
  new user-facing entry point — the new function is a library-level
  orchestrator only, called by tests in this sub-package (a future actual
  release ritual/CLI wiring it in is separately out of scope, same as CYB-2I-3
  itself already documented).
- MUST NOT modify `createReleaseVersionPlan()`'s body (purity constraint) or
  change `storeReleaseVersionPlan()`'s/`recoverReleaseVersionPlan()`'s
  existing signatures or behavior for already-passing callers.
- MUST NOT touch `security-completeness-gate.mjs` or its test file.
- MUST NOT touch `harness/scripts/verify.mjs` or `.claude/guard-config.json`
  — not needed here (this module's test file is already registered).
- No new runtime dependencies.
- Commit trailers: `AI-Assisted: true` and a `Dispatch:` line pointing to
  this briefing; NO `Co-Authored-By` / `Claude-Session` trailers (GIT-03).
  Do not push. One atomic commit.

## Field 5 — Stop conditions

- If you find `storeReleaseVersionPlan()`'s idempotent-replay design cannot
  cleanly compose with a pre-storage gate check without changing its own
  behavior (e.g. some existing test relies on `storeReleaseVersionPlan()`
  being callable in a context where no `checkReleaseVersionPlanSecurityCompleteness`
  result exists yet) → STOP and report the conflict precisely rather than
  changing `storeReleaseVersionPlan()`'s contract to work around it.

## Field 6 — Evidence to return

Diff (or clean-stop reason) + condensed report covering DoD 1-6.
