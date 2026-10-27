# W7 held patch: real-submit-plan fixtures get a ready architecture readiness (composed-stack repair a)

Patch: `w7-fixture-submit-plan-architecture-a.patch` (git diff --binary against a local commit "bundle stack base" = candidate 28535750305a7c5c2f1e3d60f630ed0b723b7abe + `scratch/agent-out/compose/bundle.patch`). Apply order: bundle first, this patch second. 3 files, 8 insertions, 2 deletions.

## Cause
D165-S4 (in the bundle) makes `submit-plan` call the architecture readiness seam; these three fixtures run the real in-process `run([... "submit-plan" ...], deps)` on a root without an architecture map, so the precheck refuses (exit 2) before the case body runs. Re-verified in the clone: RED run shows `actual: 2, expected: 0` assertion failures inside the fixtures.

## Shape used: (a) for all three (every fixture calls in-process run(), none spawns the script)
One line added to each fixture `deps`, same shape as `planAuthorityFixture` in `pipeline-state.test.mjs`: `architectureEntryReadiness: () => ({ status: "ready", code: null, nextAction: null })`.
- catalogue-admit-prescribed-lifecycle-verbs.test.mjs: fixture(), deps literal (after `runner: "codex"`).
- plan-submission-must-not-require-separate-po-approval.test.mjs: fixture(), deps literal (after `poGateAuthority`).
- design-phase-d64-criterion-parser-and-sanitized-review-chain.test.mjs: submittedRoot(), deps literal (after `runner: "codex"`).
No assertion changed, no case added, skipped or deleted.

## RED (composed stack, before repair), recorded from the printed output
- catalogue-admit: 22 failing names (all cases fail in fixture), exit 1.
- plan-submission: 10 failing, exit 1 (briefing: 11 of 21 pass).
- design-phase-d64: 5 failing, exit 1 (briefing: 9 of 14 pass).
Logs: `scratch/agent-out/w7fa/red.*.log`.

## GREEN and baseline (read from the printed logs by the Elephant after the Goldfish budget ended)
Logs: `scratch/agent-out/w7fa/green.*.log` (clone, bundle plus this patch) and `base.*.log` (clone2, clean candidate).
- catalogue-admit-prescribed-lifecycle-verbs: patched stack 22 tests, 21 pass, 1 fail; clean candidate 19 tests, 18 pass, 1 fail. The three extra cases are the D41 cases the bundle adds. The single failing name is identical in both: `D64 model-role bootstrap admits a host session and is a decision, not an admission: it stays refused here` (red at the clean candidate, not caused by this patch).
- plan-submission-must-not-require-separate-po-approval: 21 of 21 pass in both.
- design-phase-d64-criterion-parser-and-sanitized-review-chain: 14 of 14 pass in both.
Failing-name sets patched versus baseline: identical (only the pre-existing D64 model-role bootstrap case).
Apply check: `driver check` applied the bundle in clone2 and then `git apply --check` of this patch: exit 0 (Elephant, after the Goldfish budget ended).

## Not done
Cleanup of the scratch clones under `scratch/agent-out/w7fa/` (the Elephant removes them after the commit). The pre-existing D64 model-role bootstrap red case is not repaired here.

## Proposed commit message
test(fixtures): give the real submit-plan fixtures a ready architecture readiness (composed-stack repair a)

## Operator flow
apply bundle, then `git apply` this patch, `git add -u` with a path limit, `--no-verify` commit, stamp, install. Independent Critic review stays a parent-owned batch gate.
