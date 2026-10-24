# K150-FV-GUARD-APPROVAL notes (base 439f4c60d; ruleset 0.7.0+claude.20261023185750.bd9ee06)

Commit in clone scratch/clones/k150: 623b2bf82 (one file: plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs, +46/-7).
Diff: scratch/agent-out/K150-protected.diff (plugin-source test file, so it belongs to the protected route; no unprotected diff).
Commit message (to be copied into K150-msg-protected.txt by the Elephant; trailers must be `AI-Assisted: true` and `Dispatch: stage-0 (elephant)`):
test(codex-pretool-guard): enroll the fixture root and restate the stale ceremony and recovery text
Dispatch record: NOT written (fix-wave task, PO list row 59). K150-msg-*.txt and the git apply --check in a second clone: NOT done (budget).

## Part A: codex-pretool-guard.test.mjs 16/37 red -> 0 red (alone, private TMPDIR)
Evidence: base scratch/agent-out/K150-cpg-base.log + K150-cpg-base-detail.log (exit 1); final scratch/agent-out/K150-cpg-final.log
(`node scripts/run-in.mjs scratch/clones/k150 k150-cpg plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs`, exit 0).
Causes, all STALE FIXTURE / STALE TEXT, no product defect:
1. Tests 8,10,11,22-25,27-29,31,32 (and 33-37 family): fixture() was a tmp dir with only .claude/. Adapter calls nativeHookGovernanceAdmission
   (hooks/hook-governance-admission.mjs, "Scope-only admission", commit b8d4b4019 "correct guard scope and onboarding qualification"):
   an un-enrolled root exits 0 with empty stdout BEFORE any guard. This is a deliberate enforcement/scope decision, not changed.
   Fix: fixture() now enrolls with the consent marker .agent-pipeline/onboarding-consent.json (same shape as the green Antigravity twin);
   unenrolledFixture() keeps the passive root; enrollFixtureRoot() helper.
2. Test 24 (native cwd vs stale CLAUDE_PROJECT_DIR): stale root is enrolled (so honouring it would deny, first half unchanged), the current root is
   enrolled before the second half (it only denies once enrolled).
3. Test 30 (warnings stay warnings in an ungoverned repo): needed the OPPOSITE, kept on unenrolledFixture(). By design no guard runs there, so the old
   stderr `guard-testpath` warning cannot appear; restated to status 0, stdout "", stderr "" (a broken guard config never blocks). This is a bounded
   weakening of the stderr-warning assertion, justified by b8d4b4019; needs independent scrutiny (QG-04).
4. Test 16 (plugin-cache HGO route): the denial prints `Step: plan` and "The plan JSON gives the mode-specific nextAction" (text introduced in
   d1a015ff5, kept by 917674f20/380eb7faa). Restated at equal strength: assert the new text, run the printed plan command, then prepare-authorization
   with the returned plan sha, and assert prepare-authorization / authorize / --activate in those outputs.
5. Test 37 (lifecycle-not-ready denial): the `doesNotMatch /Re-run the typed project-onboarding-v3 inspection/` was stale; every controlling status now
   names its typed recovery (8c9146d3d). Now asserts that sentence, the no-override-ceremony assertion is unchanged.
Line bound: file went from 1413 to 1459 lines (+46/-7, net +39 would be 1452; verify with wc -l). architecture/boundary-policy.json bound 1413 must be
raised by the Coordinator (not edited here).

## Part B: po-human-approval PO-SIGN-DISCLOSURE-MATERIAL: NOT DONE
Reproduced on base (scratch/agent-out/K150-pha-base.log, exit 1; the log is clipped so the failing case name was not captured).
Narrowed: the check is po-human-approval.mjs line 482; materialArtifact comes either from publishSigningReviewMaterial (path `scratch/review-<64hex>-<64hex>.json`,
149 chars, so length is not the cause there) or from `record.materialArtifact` of describeHumanGuardOverrideSignatureRequest (HGO signature-digest
path, line ~2668). Most likely culprit: that HGO record path (absolute/longer path or missing sha256 in the fixture). NOT measured.
Next step: scratch/k150-run.mjs <clone> <test> - <regex> (4th arg prints matching contexts only) to get the failing case and the offending
materialArtifact value, then fix in the fixture or the record builder.

## Other
- check-consumer-safe-paths.test.mjs and check-doc-contracts.mjs: NOT run (budget).
- Helper scratch/k150-run.mjs is scratch-only (private-TMPDIR direct runner with stderr detail).
