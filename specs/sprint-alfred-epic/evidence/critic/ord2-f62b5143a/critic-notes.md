# Critic notes — ordinal 2 correction review, e6fec04a0..f62b5143a

Phase A material only (candidates — not findings) until the Phase B section is written.

- candidate — not a finding: 8ed2def1f, 40c74a01e, 455b4af21 (after 00ef3108d landed `Dispatch: D<n> (elephant-exception)`) still declare `Dispatch: stage-0 (elephant)` for multi-file production changes (D55 Q12 "Commits use it once that change lands"; stage-0 criteria at most 2 files / ~25 lines).
- candidate — not a finding: plugins/pipeline-core/scripts/close-coordinator.mjs:492 discards the `authorship` value returned by assertCourseCriticEvidence; lib/close-authorship-record.mjs:17 says `unrecorded` slices are reported by the close.
- candidate — not a finding: lib/close-authorship-record.mjs:18-20 substitutes the audit-route receipt for the "orchestrator's counted run" named in D55 Q1; Commit-Act: orchestrator presence possibly unchecked.
- candidate — not a finding: scripts/close-coordinator-audit-lifecycle.test.mjs:10 two import statements on one line (style).
- candidate — not a finding: all 25 commits carry `Dispatch: stage-0 (elephant)` + `Commit-Act: orchestrator` (grep `^Dispatch: D` = 0 rows); verifier bound is only ELEPHANT_STAGE0_MAX_PATHS = 10 (dispatch-authorship-verify.mjs:153,393), so 1c3b2b09 (10 paths), 6bee0e8c (10), 62a8e271 (9), 00ef3108 (9), 8ed2def1 (7), 4dd82e71 (7) all PASS as elephant-direct-declared.
- candidate — not a finding: D56 (2) "the guard-override log moves under .git/agent-pipeline/ and leaves the tree" — lib/project-authority.mjs:38,43 still `project/guard-override.log.jsonl` / `.claude/guard-override.log.jsonl`; lib/pipeline-owned-files.mjs:12,16 makes them commit targets; human-guard-override.mjs delta is comments only.
- candidate — not a finding: scripts/commit-pipeline-owned.mjs:20-25 hardcodes `AI-Assisted: true` + `Dispatch: stage-0 (elephant)` although the script states it runs from the PO's terminal (line 9).
- candidate — not a finding: architecture-boundary-check.mjs possibly not registered in Verify (harness/verify-suites.json TP-13; 6bee0e8c defers to ceremony C14) — D56 (1) "a generic Verify check".
- candidate — not a finding: evidence covers 6 test files; fullVerify not-run / pending (D54 (2) names Full Verify); guard-dispatch.test, native-goldfish-host-state.test, human-guard-override.test, push-prepare.test, session-cleanup-binding.test, pipeline-start-scratch-lifecycle.test, dispatch-briefing.test, dispatch-authorship-verify.test not in the run.
- candidate — not a finding: lib/session-authority-registry.mjs retireLock (diff lines ~62-75): rename/link-back gap lets a third process create a lock while a second's live lock sits aside (3-process interleaving).
- candidate — not a finding: feedback-03-triage.md:12-17 status column still says open / in progress for rows the delta builds.
- candidate — not a finding: architecture/boundary-policy.json:52,303-663,687,698 accepts 11 forbidden-dependency + 3 unowned-path violations (D56 (1) names an exception list for the size bound only).
- candidate — not a finding: scripts/push-prepare.test.mjs PF-36 test pins `AI-Assisted: true\nDispatch: stage-0 (elephant)` in the commit-pipeline-owned commit.

## Phase B — evidence gate result (written after the hunt)

Header: requested route claude-opus-5-5 at max; effective identity claude-opus-5-5 (runtime prompt: "The exact model ID is claude-opus-5-5"); functional-equivalent-read-only; OS isolation not asserted. Ruleset f62b5143a16cd08c8b61878df99ad5a8a727f9be. Candidate: 25 enumerated commits = e6fec04a0..f62b5143a (linear, trees match bindings), head tree 8cf0822b983502b84e624c9e66d687ad2ba2b93e; spec sha256 bdaff6e0 matches evidence.

### Findings
F-A major — post-00ef3108d Elephant production commits still declare `Dispatch: stage-0 (elephant)`: 8ed2def1f (7 paths, new 286-line check + 181-line test + 703-line policy), 40c74a01e (4 paths, close authorship gate), 455b4af21. Range grep `^Dispatch: D` = 0 commits; all 25 = stage-0. D55 Q12 "Commits use it once that change lands"; stage-0 = at most 2 files / ~25 lines (agent-obligations §6, operating-model §3.3); EL-01/EL-16; GIT-03. Verifier only checks ELEPHANT_STAGE0_MAX_PATHS = 10 (dispatch-authorship-verify.mjs:153,393-406) -> they PASS as elephant-direct-declared; the misdeclaration is invisible.
F-B major — D56 (2) "the guard-override log moves under .git/agent-pipeline/ and leaves the tree" not implemented: lib/project-authority.mjs:38,43 still in-tree paths; new lib/pipeline-owned-files.mjs:12,16 + scripts/commit-pipeline-owned.mjs commit the log into tracked history; human-guard-override.mjs delta is comments only; backlog item pipeline-owned-files-dirty-the-push-tree.md:35-36 acceptance + status open; feedback-03-triage.md:15 "now, per D56 (2)".
F-C minor — scripts/commit-pipeline-owned.mjs:20-25 hardcodes `AI-Assisted: true` + `Dispatch: stage-0 (elephant)`; line 9 says it runs from the PO's terminal; push-prepare.test PF-36 pins it. GIT-03 (one Dispatch trailer saying who did the work).
F-D minor — close route discards the classification: close-coordinator.mjs assertCourseCriticEvidence(...) call (diff hunk @@ -472 / line ~492) ignores the returned `authorship`; close-authorship-record.mjs:16-17 claims `unrecorded` slices are reported by the close. Published but not consumed; gap only as backlog item (b5a346a2).
F-E minor — D56 (1) "a generic Verify check": harness/verify-suites.json has no architecture-boundary entry (rg empty), deferred to ceremony C14 (6bee0e8c message; TP-13 protected, PO-only); policy also accepts 11 forbidden-dependency + 3 unowned-path exceptions beyond the size-bound exception list.
F-F minor — D54 (2) names Full Verify; evidence fullVerify not-run, pending full-verify; modified tests outside the run (guard-dispatch, native-goldfish-host-state, human-guard-override, push-prepare, session-cleanup-binding, pipeline-start-scratch-lifecycle, dispatch-briefing, dispatch-authorship-verify); commit messages report known reds.

### Deliberately not flagged
pre-00ef3108d stage-0 commits (history not rewritten, D55 Q12; EL-01 ratified D51 (4), D55 Q11); f0789bbd4 (1 path, 1 line); no private correlation metadata (grep empty); vendored copies byte-identical by blob; elephant-exception policy/verifier shape and tests; D54 (1) scratch binding (SAR07); FB3-PF-55/56 lock owner, retire-aside, release-lock refuses live owner and never takes the lock, bounded wait (SAR08); 3-process retire/link-back race (low probability, end-of-boundary ownership check); D52 (2) absolute repair commands, ownerFault, session-cleanup plan-recovery (SAR09); AGY started reservation (NGHS38); guard-dispatch reorder + undo (GD61 strengthened); D56 (3) checkpoint check before signing (lines null asserted), stale-approval repair; PF-34 review unit; D55 Q1 audit-route substitution for the non-persisted counted run (stricter, documented); test integrity of the examined test diffs; critic-review.md change = schema v1 to v2 only; no new external dependency; language English; directory placement; triage status staleness; audit-lifecycle test import line (style).

### Trajectory
consistent for the bound artifact (head f62b5143a, tree 8cf0822b, dirty false, exit 0, 86/86, sha256 matches); not verifiable beyond it (Full Verify not run; suite counts claimed in readable commit messages have no artifact; eight modified test files outside the run).

### Briefing violations
none.

### Pass/fail
FAIL (F-A, F-B major).

## Final adjustments (supersede the sections above where they differ)
- F-A anchors on the operating-model stage-0 criterion (at most 2 files / ~25 lines, agent-obligations.md §6 -> operating-model §3.3) plus D55 Q12, not on the shipped verifier, whose only check (10 paths) disagrees with that criterion. Pre-landing 1c3b2b09 and 6bee0e8c sit exactly at the 10-path verifier bound.
- F-D phrasing: not a regression; the `return authorship` (close-coordinator.mjs:433) is new and unused at the only call site (:492), and the module comment (close-authorship-record.mjs:16-17) claims reporting that does not happen.
- F-E is the Verify-registration half only. The 14 non-size policy exceptions (11 forbidden-dependency, 3 unowned-path) move to deliberately-not-flagged: mechanical ratchet, each with a reason, first stage.
- F-F is withdrawn as a finding and becomes a trajectory statement: the artifact itself declares `pending: ["full-verify"]`.
- Final verdict unchanged: FAIL on F-A and F-B (major); minors F-C, F-D, F-E.
