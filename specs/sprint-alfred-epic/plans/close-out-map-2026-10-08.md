# Close-out map 2026-10-08 (CLOSE-MAP-1, updated by CLOSE-MAP-2) - PARTIAL

Status: partial. CLOSE-MAP-2 resolved four of twelve rows by source and test search; eight rows are `unclear` because
the 30-tool-use budget was reached before their search could run. Findings that hold for every row:

- Each item file has `status: open` and `done_when: manual`; none carries a Triage or closure section naming a fix SHA.
  The item bodies cite only patch, aggregate or evidence-file digests (not commit SHAs).
- `backlog-reconciliation-2026-10-07.md` lists all twelve as class c ("close-out not run", fix "in source per the
  triage"), with no SHA. `backlog-triage-2026-10-07.md` section 1 names none of these twelve with a SHA.
- `git log --grep` on slug words returned only backlog-intake commits (15c85695e, 97d03bf26, 90fcb6bd0, 35773101b,
  c20502aae are intake/registration commits, not fixes).
- Because `done_when: manual` is set on all twelve, a passing test alone never satisfies Acceptance; the
  "needs beyond test" column states the item-specific part.
- Fix SHA 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d (`feat(pipeline): integrate 0.7 greenfield remediation`) is the
  earliest commit introducing the searched token in the file named; it is an integration commit, so it dates the
  behaviour but is not a single-purpose fix commit.

Verdict counts: closable-by-test 3 · needs-host-run 1 · not-fixed 0 · unclear 8 (total 12).

Next step for the eight `unclear` rows: read the item's Proposal/Acceptance, pick one distinctive token, then
`git grep -n -e <token> -- plugins harness`, `git log --oneline -S "<token>" -- <file>`, and a test grep.

| Slug | Item file | Fix SHA | Regression test + `--test-name-pattern` | Beyond a passing test | Verdict |
|---|---|---|---|---|---|
| codex-advisor-shared-namespace | backlog/items/2026-09-28-codex-advisor-shared-namespace-rejects-fresh-repository-identity.md | not found | not resolved | Item says Readiness hardening patch is not yet in productive source; Acceptance needs an actual first identity mint in a controlled Git repository | unclear (token search not run; budget reached) |
| onboarding-home-override-machine-plane | backlog/items/2026-09-28-onboarding-home-override-does-not-bind-machine-plane.md | not found | candidate: `plugins/pipeline-core/lib/machine-plane.test.mjs`, unverified | Acceptance: injected home B reads B's plane and anchor while OS provider reports A | unclear (machine-plane lib and test exist; binding unverified) |
| stale-hgo-capability-shadows | backlog/items/2026-09-28-stale-hgo-capability-shadows-current-authorization.md | not found (introducing commit not searched) | `plugins/pipeline-core/lib/human-guard-override.test.mjs`, asserts `driftedChecks` equal `["repository"]` near line 1818; no pattern recorded (tests are named by comment, not by `--test-name-pattern`) | Acceptance also needs an independently authorized current match to survive a stale one (`consumeHumanGuardOverride` loop near line 4157 to 4228 continues after an audited drifted match) | closable-by-test (behaviour present at human-guard-override.mjs:4211-4228) |
| first-enrollment-retirement-before-consent | backlog/items/2026-09-29-first-enrollment-enters-retirement-before-consent.md | not found | not resolved | Acceptance spans empty and initialized Git roots, non-Git refusal and fresh-consent activation | unclear (token search not run; budget reached) |
| git-hook-runtime-snapshot-protected-baseline | backlog/items/2026-09-29-git-hook-runtime-snapshot-omits-protected-baseline-catalog.md | not found | not resolved | Acceptance needs the original onboarding handover commit to succeed via the installed hook | unclear (token search not run; needs installed hook) |
| governance-scope-readonly-host-git-control | backlog/items/2026-09-29-governance-scope-rejects-readonly-host-git-control.md | not found | not resolved | manual done_when | unclear (token search not run; budget reached) |
| native-patch-rename-protected-markers | backlog/items/2026-09-29-native-patch-rename-drops-protected-content-markers.md | 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d (introduces `RCM03` in the test) | `plugins/pipeline-core/hooks/guard-apply-patch.test.mjs`, `check("RCM0...")` cases near lines 746, 764, 770, 778 (custom `check()` runner; run the file whole) | Acceptance requires the fixed committed candidate AND the installed guard to retain the controls | closable-by-test (source path in `guard-apply-patch.mjs`; installed-guard part is host-run) |
| nongit-retirement-reader | backlog/items/2026-09-29-nongit-retirement-reader-calls-inaccessible-controller-helper.md | not found | not resolved | Item stays open until the fixed candidate's combined acceptance; remaining failures must be reconciled from new receipts | unclear (acceptance demands combined candidate run) |
| onboarding-test-runner-async-pass | backlog/items/2026-09-29-onboarding-test-runner-reports-async-pass-before-settlement.md | 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d (introduces the `B8 corpus must reach at least one real session command` assertion) | `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs` (custom runner; B8 corpus lines near 10380 and 10397) | Criterion 4 is the full complete-suite run with consistent case counts and exit 0 | needs-host-run (criterion 4 is a full 216-case suite run) |
| protected-baseline-discarded-idle-state | backlog/items/2026-09-29-protected-baseline-rejects-canonical-discarded-idle-state.md | not found | not resolved | manual done_when | unclear (token search not run; budget reached) |
| retirement-reader-masks-unsafe-layout | backlog/items/2026-09-29-retirement-reader-masks-typed-unsafe-layout-inspection.md | 26fef9e7d26be3d59b7e609c1dad9dd04c747b4d (introduces `if (result.root === null \|\| result.status === "unsafe") return result;` at project-onboarding-v3.mjs:5483) | `plugins/pipeline-core/lib/project-onboarding-v3.test.mjs`, `--test-name-pattern "existing unmanaged projects plan read-only while partial and symlink roots fail closed"` (asserts `root_symlink_rejected`, status `unsafe`, repository `unavailable`) | Acceptance also requires the complete original onboarding controller and combined candidate gates | closable-by-test (unit assertion present; combined gates are host-run) |
| semgrep-default-version-check | backlog/items/2026-09-29-semgrep-default-version-check-blocks-offline-local-rules-scan.md | not found | not resolved | manual done_when; scanner-defaults commits (92d1b7118, f7213cc2a) are a related lead only, unconfirmed | unclear (related commits unconfirmed; search not run) |
