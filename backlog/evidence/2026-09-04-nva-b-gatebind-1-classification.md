# NVA-B-GATEBIND-1 — classification of the four 2026-09-04 observations against `pipeline.every-gate-binds-the-whole-tree-so-any-later-commit-voids-it`

Dispatch `NVA-B-GATEBIND-1` (goldfish-deep). No code fix made. This records the
classification and the bounded probe backing it.

## Item's own direction (quoted, `scratch/strip-gate-binding.md`)

> Each gate declares the paths it reads. The binding envelope of a gate result
> is the union of its declared inputs. A following commit whose diff touches
> nothing in that envelope preserves the binding; one that touches it voids
> the result, exactly as today.

## Classification

1. **Full run stopped mid-flight to commit, ~11 min discarded.** Two
   sub-cases exist and the item conflates them:
   - Same-candidate restart (no commit lands before re-running): already
     solved today — `planVerifyResume` reuses every already-receipted suite
     regardless of Tier, proven by the passing test
     `same complete bindings reuse terminal PASS receipts`
     (`plugins/pipeline-core/lib/verify-resume.test.mjs:41`).
   - Restart after the commit the operator needed to make: this is
     **prevention, not granularity** — nothing stops the commit from landing
     while a run is bound. This is the exact scenario the sibling item
     (`2026-09-01-concurrent-dispatches-...md`) already recorded and ranked
     as its own "Option 2, a verify-in-progress marker" (2026-09-04 Triage
     decision: "this session bound a verify run to a HEAD, needed to commit,
     stopped the run... the gap is prevention, not blindness... costs a
     signature [TP-3]"). **Classification: covered by the sibling item's
     proposal 2.** Not duplicated here.

2. **Completed run's binding voided by a docs-only commit minutes later.**
   This is the item's own core scenario (granularity: which suites actually
   needed to re-run). The mechanism that would answer it — per-suite
   declared-input receipts, reused across an unrelated candidate change — is
   **already accepted and partially built**: ADR-0065
   (`docs/adr/0065-a-voided-gate-is-re-earned-from-declared-inputs.md`),
   Tier A/Tier B suite classification and `allowCrossCandidateReuse` in
   `verify-resume.mjs`/`verify-journal.mjs`. It is a live, ongoing series
   (candidate (c), suite-by-suite promotion) explicitly not something this
   dispatch is briefed to extend, and doing so on my own judgement is exactly
   what my Forbidden clause rules out ("If the answer is that the binding
   should be narrower — per-suite rather than whole-tree — that is a finding
   to report, not an edit to make on your own judgement").
   **Additional, decisive finding beyond what the item itself states:** even
   where a suite has already been promoted to Tier B, the mechanism is
   currently **inert in production** — `harness/scripts/verify.mjs`'s one
   production call to `runVerifyJournal` never passes
   `allowCrossCandidateReuse: true` (grep-confirmed; no caller anywhere in
   the repo passes `true`, `review-retry-planner.mjs` explicitly opts out).
   Since that call site is TP-3-protected with no active Guard Maintenance
   Window, no dispatch can flip it. Today, a docs-only commit voids a
   completed run's binding for Tier A **and** Tier B suites alike; ADR-0065's
   own Follow-up names this exact activation as **Decision 8, still open,
   reserved for the PO** ("push/release-bound Verify runs force full
   re-execution (`--no-reuse`)" is the accepted conservative default).
   **Classification: granularity gap, already has an accepted design
   (ADR-0065), blocked on a TP-3-protected wire-up and an explicit open PO
   decision (Decision 8). Not mine to implement.**

3. **Scratch-not-backlog/evidence workaround, to dodge the binding.** Not a
   defect to fix in itself — it is corroborating evidence that (1)/(2) are
   real and currently unaddressed by any mechanism, exactly matching the
   sibling item's own line: "Discipline covered it today; a marker would
   make the discipline unnecessary." **Classification: evidence for the
   prevention gap in observation 1, not a separate gap.**

4. **`VERIFY-CANDIDATE-DRIFT` already detects post-hoc drift.** Confirmed by
   direct reading of `harness/scripts/verify.mjs` (candidate stability check,
   start vs. finish `commit`/`tree` comparison, ~line 878-905) and
   `checkEvidenceFreshness` in `push-prepare.mjs` (`commit === headCommit`,
   line 158-168). **Classification: detection is not the gap; out of scope
   by the item's own framing.**

## Bounded probe (not a full gate run)

`node --test plugins/pipeline-core/lib/verify-resume.test.mjs` — 15/15 pass,
0 fail, exit 0. Relevant existing assertions (not new — already-landed
coverage, cited rather than duplicated):

- `same complete bindings reuse terminal PASS receipts` (line 41) — proves
  the no-intervening-commit case already avoids waste.
- `ADR-0065: candidate-drift no longer gates the content checks, but stays
  exactly as strict` (line 72) — proves a tree change (the docs-only-commit
  shape) still invalidates a Tier-A suite today, exactly as the item states.
- `ADR-0065 candidate (b) fix ...WHEN the caller explicitly opts in via
  allowCrossCandidateReuse` (line 96) — proves the granularity mechanism
  works when enabled.
- `NVA-ADR65TIERFIX-2: WITHOUT allowCrossCandidateReuse (the default,
  matching harness/scripts/verify.mjs's real unmodified call shape)...` (line
  117) — proves it is NOT enabled in production today.

## Conclusion

No implementation made. Both named remedy paths for the four observations —
prevention (sibling item's Option 2, TP-3) and granularity (ADR-0065
Decision 8, TP-3 + open PO decision) — are already identified, already
ranked/accepted elsewhere, and both require either a protected-path change or
a PO-level decision this dispatch cannot make. This item's own premise
("every gate binds the whole tree") still holds in production exactly as
written; what has changed since the item was filed is that the fix's shape is
no longer a design gap — it is a wiring/activation gap, gated on machinery
this dispatch cannot touch.
