# Scope pass, 2026-10-20 (D60)

D60 orders a scope-completion pass before Full Verify and corrections: the content scope of the
0.7.0 Alfred test candidate must be complete, so that every item can be closed after the PO's
local test. This file states what is still open and which part of it needs a PO decision.

## Method

- Input: the delivery remeasure of 2026-10-20
  (`specs/sprint-alfred-epic/evidence/delivery-remeasure-2026-10-20/snapshot.json`, head
  `9f9c1a456`). Its readers read every one of the 174 measured items on 2026-10-20 and gave every
  open point one owner; 9 rows kept their 2026-10-18 baseline because no later commit fits them.
- Every row with an open `agent` point is placed in one cluster below by the kind of work that
  point names. The clustering is the Elephant's reading of the one-line points, not a new
  measurement. The cluster table below is generated from the snapshot's rows; the
  "Agent work" column is the snapshot's text, unchanged.
- Before any cluster is dispatched, each of its items is re-read against its own acceptance text
  and `git log` (CLAUDE.md: re-verify an inherited "still open" claim).
- The remeasure counts no Critic review as done. D59 credits earlier per-item Critic reviews; that
  correction changes the `critic` owner column, not the content clusters here.

## Result

| Cluster | Items | Kind of open work |
| --- | --- | --- |
| B | 39 | Evidence only: the fix is built and pinned; a counted GREEN of the pin is not stated. A Full Verify run plus an item-to-pin map closes it. |
| T | 20 | Test only: a pin for a named clause is missing or not counted. |
| H | 11 | Guard and ceremony hardening: a small code change plus its test. |
| S | 11 | Typed skips to replace, or a red suite to fix. |
| L | 33 | Lifecycle admission, onboarding and Windows clauses: a medium code change. |
| F | 20 | Larger features or runner routes. |
| D | 11 | A PO decision decides whether content work remains. |
| N | 29 | No agent work: only the Critic, Verify, a native host or the PO acceptance is open. |

65 of the 174 items also carry a `native-host` point: they close only after a run on a real
installed Codex, Claude or Antigravity host, or on native Windows.

So the content scope is not complete: about 95 items (H, S, L, F and part of D) still need code,
and about 59 (B, T) need tests or counted evidence only.

## Epic criteria AC-1 to AC-37 (`acceptance.md`)

The remeasure measures items, not the epic criteria. Their evidence is mostly fixture suites,
which the Full Verify counts. By kind, before that run:

- A PO host run decides them: AC-1 (per-runner conformance records), AC-19 (two-runner parity),
  AC-29 and AC-35 (per-runner host evidence), AC-32 (the three-runner happy path, which is the
  local acceptance test itself).
- A PO decision or signature decides them: AC-6 (promotion approval), AC-9 (D4 adoption, routed
  by D60), AC-13 (every open `sprint: alfred` item closed or PO-visibly re-triaged; 155 are open
  in `backlog/index.json` today), AC-15 (documentation acceptance per member issue).
- Critic: AC-14 (every wave reviewed; the ordinal-4 review closes the batch).
- The rest are fixture-bound and are read from the Full Verify result.

AC-13 is the link to this pass: an item that the PO moves out of 0.7.0 is re-triaged, which
AC-13 accepts as its closure.

## Cluster table

### B — evidence only: the fix is built; a counted GREEN of its pin is not stated (39)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 7 | agent-obligations-says-no-and-and-while-the-guard-admits-six-segments | 75 | State a counted GREEN for the pin in a commit message or committed evidence. | — |
| 9 | agy-el01-write-authorization-gap | 50 | Give the EL-01 tripwire pin a stated pass count. | native-host |
| 19 | brownfield-implementation-entry-demands-a-greenfield-design-block | 50 | State counted brownfield and deferred-adoption pins for the entry. | — |
| 22 | capture-evidence-does-not-normalize-windows-npm-launch | 50 | Map the original acceptance to a counted pin. | native-host |
| 26 | claude-session-start-emits-codex-transcript-recovery-hint | 50 | Record the RED mirror and a counted GREEN for the Claude session-start hint. | native-host |
| 28 | claude-windows-guard-refuses-every-in-repo-read | 50 | State a counted pin for the in-repo read shapes. | native-host |
| 42 | critic-round-cap-and-delta-scope-are-not-enforced | 75 | State a counted GREEN result for the T3 close-feature pin in a fixture user repository. | — |
| 48 | denial-names-a-diagnosis-it-refuses | 50 | State a counted GREEN result for the denial-diagnosis fix. | — |
| 57 | design-workflow-package-omits-contract | 50 | State counted results for the E1 behavioral checks and test the text-only clauses. | — |
| 61 | dispatch-budget-lock-refuses-every-subagent-call-on-windows | 50 | Produce a counted GREEN for the bounded-wait pin and its RED mirror. | native-host |
| 62 | dispatch-guard-rejects-built-in-capitalized-agent-types | 50 | State a counted GREEN for the three capitalized-agent-type clauses. | — |
| 64 | dispatch-record-ownership-binds-an-attempted-creation | 50 | Confirm the pin file is tracked and state its counted GREEN. | — |
| 69 | every-dispatch-pays-a-bootstrap-receipt-detour | 50 | State a counted GREEN for the receipt-detour acceptance. | po-signature |
| 70 | evidence-artifacts-carry-no-commit-identity | 50 | State a counted GREEN for the commit-identity pin. | — |
| 74 | foreign-worktree-closes-the-implementation-gate | 50 | State a counted GREEN for the two-worktree pin once the patch lands. | po-signature |
| 77 | git-for-windows-2-56-rejects-git-config-global-nul | 50 | State a counted GREEN for the real-git run. | native-host |
| 78 | git-hook-runtime-snapshot-omits-protected-baseline-catalog | 50 | Show the onboarding handover commit and full original184 onboarding suite green with counts. | verify-wsl |
| 81 | git-stash-list-classified-as-working-tree-write | 50 | State a counted GREEN and integration evidence for the stash-list pin. | — |
| 82 | gitleaks-content-suppression-does-not-match-on-windows | 50 | State a counted GREEN for the pin. | native-host |
| 84 | gitleaks-repair-ignore-cli-is-a-no-op-on-windows | 50 | State a counted GREEN for the child-process pin. | native-host |
| 85 | goldfish-budgets-omit-the-closing-ceremony | 50 | State a counted GREEN for the closing-ceremony budget producer case. | — |
| 86 | goldfish-bugfix-module-conflicts-with-qg-04 | 50 | State a counted GREEN and verify the sync clause. | — |
| 97 | guard-suite-fails-60-tests-on-native-windows | 50 | Record the classified baseline count the Proposal asks for. | native-host |
| 100 | hgo-dead-owner-audit-lock-permanently-ambiguous-on-windows | 50 | State an item-specific pass count for the T90 pins. | native-host |
| 105 | installed-design-trailer-example-is-rejected-by-git-guard | 50 | State a counted pass for the 8e7dce0f4 trailer admission. | — |
| 110 | mandatory-hook-readiness-returned-refusal-skips-rollback | 50 | State a counted GREEN for the readiness rollback. | — |
| 111 | merge-commit-message-skips-conventional-type-check | 50 | State a counted GREEN for the R1-R5 pin. | — |
| 116 | no-uninstall-path-for-a-repository-that-once-opted-in | 50 | State a counted GREEN for the whole uninstall pin. | — |
| 117 | node-v24-on-windows-creates-a-real-nul-file | 50 | State a counted GREEN result for both nul-file clauses in a commit or committed evidence. | native-host |
| 133 | project-resource-budget-headroom-is-not-reported | 50 | State a counted result for the A5-A7 pin and wire it into verify. | verify-wsl |
| 135 | push-classifier-deny-list-does-not-converge | 50 | State a counted GREEN result covering the deny-list convergence acceptance. | — |
| 137 | push-classifier-misreads-backslash-escaped-quotes | 50 | State counted GREEN results for the pinned backslash-quote shapes. | — |
| 138 | push-classifier-misses-nested-quotes-and-redirect-before-push | 50 | State counted GREEN results for the nested-quote and redirect clauses. | — |
| 150 | semgrep-console-coverage-note-has-no-test | 50 | Record a counted GREEN run of the console-coverage-note pin. | — |
| 163 | source-agent-definition-change-locks-that-agent-until-install | 50 | Record a counted GREEN of the AC-263 pin. | — |
| 165 | transfer-redaction-alters-digest-bound-files | 50 | Record a counted GREEN of the byte-exact carry pin. | — |
| 169 | windows-greenfield-scratch-write-denied | 50 | Record counted GREEN results for the guard fix pins. | native-host |
| 172 | windows-pre-push-installer-fsync-and-relative-action | 50 | Record a counted GREEN for the installer pin. | native-host |
| 174 | worktrees-share-onboarding-private-state-with-root-bound-intake | 50 | Record a counted GREEN covering each clause of the worktree onboarding private-state pin. | — |

### T — test only: a pin for a named clause is missing or not counted (20)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 2 | advertised-git-to-head-pipeline-is-refused | 75 | Cover the PF-17 observed shapes (git -C ... show --format= -- \| head, rg -o/-c, ls -la) with a counted pin. | — |
| 6 | agent-obligations-recommends-a-commit-spelling-guard-push-refuses | 50 | Pin the recommended commit spelling through guard-git, guard-lifecycle-ready and guard-push with stated counts. | — |
| 13 | approval-bound-design-package-lives-in-an-ignored-directory | 50 | Pin the ignored-directory package behaviour with a counted GREEN. | native-host, po-decision |
| 18 | bounded-reader-terminal-binding | 50 | Pin the real-course terminal binding clause with a counted GREEN. | — |
| 25 | claude-greenfield-seeds-unselected-codex-targets | 50 | Pin target selection across the platform matrix. | native-host |
| 60 | disjoint-signed-hgo-actions-invalidate-one-another | 50 | Add a counted test for three disjoint signed actions with two sequential deliveries plus target-drift cases. | po-signature |
| 71 | existing-signing-key-reuse-deadlocks-onboarding | 50 | Pin the attended first-anchor recovery, path aliases and wrong-key refusal with a counted GREEN. | native-host |
| 72 | feature-branch-push-admitted-without-signature-approval | 50 | Pin the remaining approval-lane clauses with a counted GREEN. | po-signature |
| 79 | git-hook-runtime-snapshots-go-stale-after-plugin-changes | 50 | Pin the stale-admission clause with a counted GREEN. | po-signature |
| 80 | git-push-classifier-misses-env-s-and-editor-bang | 50 | Pin env -S and editor-bang classification with a counted GREEN. | — |
| 83 | gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one | 50 | Pin the batch clause with a counted GREEN. | verify-wsl |
| 92 | greenfield-machine-output-and-skill-budget | 50 | Cover the help-action clause with a counted test. | — |
| 96 | guard-push-treats-gitleaks-as-a-git-command | 50 | Add a test for the gitleaks admit case and a counted GREEN. | — |
| 98 | handover-doc-committed-without-governance-classification | 50 | Pin the classification hook with a counted GREEN. | — |
| 114 | model-role-confirmation-prompt-obscures-required-digest | 50 | Pin the confirmation prompt output with a counted test. | — |
| 119 | onboarding-home-override-does-not-bind-machine-plane | 50 | Pin explicit home-override retention for the machine plane with a counted result. | — |
| 125 | passive-read-policy-admits-uncovered-credential-files-and-rg-follow | 50 | Pin the shared credential-root constant refusals and the rg -L decision with counted results. | verify-wsl |
| 127 | plan-submission-must-not-require-separate-po-approval | 50 | Pin the plan-submission acceptance with a counted result. | — |
| 154 | shell-classifier-faults-on-heredoc-body-text | 50 | Add a counted test for heredoc body text in the shell classifier. | — |
| 156 | sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows | 50 | Add a counted test of the openssl spawn path. | native-host |

### H — guard and ceremony hardening, small code change plus test (11)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 14 | approval-verification-demands-head-equals-candidate | 50 | Implement and pin approval verification against the candidate commit instead of HEAD. | po-signature |
| 93 | guard-override-request-digest-drifts-after-arming | 50 | Exclude runner-cosmetic fields such as description from the digest and add the arm-then-identical-retry regression with a named-input mismatch message. | verify-wsl, native-host |
| 94 | guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target | 50 | Isolate the exact refused shape and pin it with a counted test. | — |
| 99 | heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier | 50 | Add the receiver handling and a counted test. | — |
| 101 | hgo-patch-preflight-before-signature | 50 | Add a malformed-hunk-rejected-before-signature test and the EOF-marker grammar admission. | native-host |
| 102 | hgo-stale-capability-shadows-current-authorization | 50 | Integrate the search-continues fix and its stale-only, corrupt-audit and two-record regressions. | — |
| 140 | read-only-guard-admits-execution-and-output-options | 50 | Close the remaining skipped lanes and pin them with counted results. | verify-wsl |
| 148 | script-mediated-writes-bypass-protected-test-paths | 50 | Add a counted result for the codemod-shape acceptance beyond the baseline redirect pins. | — |
| 157 | sign-intent-disclosure-scan-blocks-for-minutes | 50 | Bound the disclosure scan time and add a counted test for AC-257. | — |
| 166 | unasked-advisor-export-consent-in-fresh-seed | 50 | Add the guard-admission clause for advisor export consent in a fresh seed with a counted test. | — |
| 168 | vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier | 50 | Extend the heredoc receiver list to vim -es and busybox and add a counted test. | — |

### S — typed skips or red suites to replace or fix (11)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 29 | codex-advisor-evidence-fails-after-host-update | 50 | Un-skip the three skipped cases and get the Advisor host suite GREEN beyond 0/1. | native-host |
| 44 | critic-scratch-notes-write-is-refused-again | 50 | Replace the typed skips with counted GREEN cases. | native-host |
| 45 | cross-runner-chat-intake-reference-needs-host-capture | 50 | Cover the expiry clause and replace the typed skips. | native-host |
| 54 | design-package-parent-metadata-false-drift | 50 | Replace the typed skips and link the corpus case with counted GREEN tests. | — |
| 58 | design-workflow-package-v2-readiness-fixture-fails-on-windows | 50 | Replace the HOST-LIMITATION skips (due 2026-10-19) or renew them. | native-host |
| 112 | model-family-approval-with-automatic-version-upgrades | 50 | Fix the E24 settled-phase async effect and the E30/E31 cross-process reserved-member refusal so the host-store and invocation suites are green. | verify-wsl, native-host |
| 113 | model-role-bootstrap-is-always-unavailable-on-native-windows | 50 | Register the win32 and POSIX directoryPathChain test and state a counted GREEN. | native-host |
| 126 | pipeline-hooks-act-in-repositories-that-never-opted-in | 50 | Pin the non-git hook entrypoint clauses that are skipped. | native-host |
| 141 | readiness-input-omits-current-advisor-observation | 50 | Replace the three typed skips with counted GREEN cases. | native-host |
| 144 | revised-native-design-cannot-reach-a-new-advisor-course | 50 | Replace the two skips on the surviving observer with counted cases. | po-decision |
| 147 | scratch-must-remain-writable-across-lifecycle-states | 50 | Add a counted GREEN pin for scratch writes in every lifecycle state without typed skips. | native-host |

### L — lifecycle admission, onboarding and Windows clauses, medium code change (33)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 4 | advisor-provenance-ancestor-check-fails-on-any-sibling-write | 50 | Implement and pin the cause-field clause and the policy gate with a counted GREEN. | — |
| 15 | approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes | 75 | Close the perl-opaque clause that is still a todo and count the devplan-lane pin. | — |
| 17 | bootstrap-should-refresh-hooks-when-the-plugin-updated | 50 | Cover the non-ready preflight, the confirmation refusal and the model-role readback, and the 2 todo injection seam. | native-host |
| 30 | codex-advisor-shared-namespace-rejects-fresh-repository-identity | 50 | Fix or pin the fresh-identity versus shared-namespace refusal with a counted GREEN test. | native-host |
| 31 | codex-bootstrap-in-the-typed-next-action | 50 | Implement the bootstrap inclusion clause in the typed next action and pin it. | — |
| 36 | commit-grammar-hint-still-requires-scratch-message-file | 50 | Change the hint and skill guidance so no scratch message file is required, and pin it. | — |
| 37 | commit-producer-path-order-failures-count-against-the-tool-cap | 50 | Stop path-order failures counting against the tool cap and pin it. | — |
| 39 | concurrent-session-warning-never-fires-on-native-windows | 50 | Fix the warning on native Windows and pin it. | native-host |
| 40 | configure-verify-output-lacks-a-walkable-commit-route | 75 | Cover the repair clauses and the non-private State case left open by cff00accd. | — |
| 43 | critic-scratch-name-randomness-has-no-admitted-command | 25 | Implement an admitted command for random Critic scratch names and pin it. | — |
| 47 | declared-system-skill-read-requires-human-override | 50 | Build the protected read-scope seam and the catalog-bound clauses, replacing the typed holds. | native-host |
| 50 | design-bootstrap-verify-state-contradicts-deferred-contract | 25 | Implement and pin the enforcement clause. | — |
| 56 | design-trailer-verifier-lost-after-closure | 50 | Close the remaining clause of the AC-156 sweep. | verify-wsl |
| 63 | dispatch-record-log-stays-empty-despite-mandatory-phase-entries | 50 | Finish the log-entry measurement and the fold-in part, with a counted GREEN. | — |
| 67 | draft-phase-guard-blocks-mandatory-bootstrap-preflight | 50 | Admit and pin the preflight, onboarding inspect and pipeline-state inspect spellings in draft phase with a counted GREEN. | native-host |
| 87 | goldfish-test-briefs-lack-targeted-and-quick-command-routes | 50 | Cover the remaining AC-187 clauses and consumer coverage with a counted GREEN. | — |
| 106 | kernel-closure-check-masks-violations-after-the-first | 50 | Make the check report all violations per run and pin it; make a red ratchet block the candidate stamp. | — |
| 107 | lifecycle-coordination-commands-refused-as-implementation-writes | 50 | Admit the remaining coordination lanes (continuity-cas, integrate-final, cancel-submitted-plan, scratch read-only scripts) and cover them with counted tests. | native-host |
| 108 | lifecycle-inspect-omits-current-plan-spec-digests | 50 | Integrate the prepared inspect source-digest correction with its regressions into Source. | — |
| 118 | nongit-retirement-reader-calls-inaccessible-controller-helper | 50 | Qualify the complete original onboarding controller and reconcile remaining failures with a counted result. | — |
| 120 | onboarding-init-greenfield-matrix-is-serial-and-slow | 50 | Implement and pin the matrix wall-time clause that is still a skip. | verify-wsl |
| 121 | onboarding-test-runner-reports-async-pass-before-settlement | 50 | Implement and pin the deferred criterion 4 with a counted result. | — |
| 128 | powershell-bypasses-onboarding-read-boundary | 50 | State counted GREEN results for the four PowerShell read-boundary bullets. | native-host |
| 129 | preflight-hides-the-git-error-behind-gs-git-unavailable | 50 | Surface the underlying git error in preflight and pin it with a counted result. | — |
| 131 | private-temp-root-not-secure-branch-has-no-test-seam | 50 | Close the missing-count clauses and pin them with counted results. | verify-wsl |
| 139 | read-blocks-and-misleading-denial-texts-across-runners | 50 | Implement and pin the held read-block and denial-text clauses with counted results. | native-host |
| 143 | retirement-reader-masks-typed-unsafe-layout-inspection | 50 | Qualify the complete original onboarding controller and the admitted-root history clauses with counted results. | — |
| 145 | role-route-preflight-with-self-dispatch-fallback | 50 | Implement the held point 2b and the recovery-state verb (C7) and pin them with counted results. | native-host |
| 153 | session-readiness-drops-to-partial-after-bootstrap-ready | 50 | Fix the intermittent cleanup root cause and add a counted test for the partial-readiness drop. | verify-wsl |
| 155 | shell-grammar-file-is-a-kernel-path-without-capability-placement | 50 | Place the shell grammar file in the capability model and add the fixture clause with a counted test. | — |
| 160 | signing-default-test-fixture-root-escapes-the-repository | 50 | Move the signing-default fixture root off the repository and show RC21C003 reversed order covered with a counted run. | — |
| 170 | windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures | 50 | Move remaining fixtures off os.tmpdir or handle the DACL case, with a counted test. | native-host |
| 171 | windows-portable-seed-rolls-back-with-hidden-worktree-error | 50 | Implement the held driver and onboarding clauses with counted tests. | native-host |

### F — larger features or runner routes (20)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 8 | agy-driver-dispatch-and-design-routes-incomplete | 50 | Implement and test the AGY happy path and the Critic, Advisor and Verify routes. | native-host |
| 10 | agy-imported-plugin-snapshot-shadows-registered-plugin | 50 | Add the lock-version-mismatch preflight reason and the docs clauses with counted pins. | native-host |
| 27 | claude-windows-greenfield-lifecycle-not-walkable | 50 | Implement and pin the V-9, V-10, V-12 and V-13 clauses. | native-host |
| 34 | codex-readiness-private-receipt-omits-output-custody | 50 | Implement and test the output-custody points, including point 6. | native-host |
| 35 | codex-wsl-required-advisor-has-no-completable-route | 50 | Pin the receipts, trail and answered path with counted tests. | native-host |
| 38 | completion-fd-suites-cannot-run-as-single-files | 50 | Make the completion-fd suites runnable as single files and state a counted result. | verify-wsl |
| 52 | design-generator-repeats-large-source-material | 50 | Measure before and after, the host output budget and reviewer understanding, and fix the hand-edit header contradiction. | — |
| 55 | design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | 50 | Implement the original flow: Advisor on demand, one merged review, one PO signature, with a counted pin. | po-signature |
| 68 | elephant-main-context-spent-on-wake-ups-and-inline-reads | 25 | Implement the context reduction and pin it with a counted test. | native-host |
| 75 | forensics-and-audit-evidence-not-reconstructable | 25 | Implement the reconstructable evidence export and pin it with a counted test. | po-signature |
| 103 | host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear | 50 | Implement the recovery verb and a crash-simulation test. | native-host |
| 122 | opus-critic-only-batched-for-architecture-and-security | 50 | Close the open triage points and pin the Opus-tier batching acceptance with a counted result. | po-decision |
| 124 | parallel-work-in-one-checkout-is-unsafe | 50 | Implement restart-liveness and the AGY serial-packages scope, then pin with a counted result. | native-host |
| 146 | scratch-has-no-retention-and-no-durability-check | 50 | Implement the sanctioned scratch sweep and the durability check from the Proposal with a counted test. | — |
| 149 | security-scanner-failure-provenance | 50 | Finish implementation and a counted test for scanner failure provenance. | — |
| 151 | semgrep-offline-default-version-check | 50 | Finish the offline default version check and a counted test. | — |
| 152 | semgrep-partial-parsing-warnings-fail-the-whole-scan | 50 | Finish partial-parsing warning handling and a counted test. | — |
| 158 | signature-ceremony-requires-operator-work-and-breaks | 50 | Reduce operator work in the ceremony and add a counted test of the original acceptance. | po-signature |
| 159 | signed-quality-package-route-is-not-agent-operable-on-windows | 50 | Add the native Windows route for the signed quality package. | native-host |
| 164 | three-runner-happy-path-with-two-po-approvals | 50 | Add a counted end-to-end happy-path scenario per runner with exactly two PO proofs. | native-host, po-signature |

### D — a PO decision decides whether content work remains (11)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 23 | catalogue-admit-prescribed-lifecycle-verbs | 50 | Catalogue-admit each remaining prescribed verb and pin it with a counted GREEN. | po-decision |
| 24 | claude-design-readiness-cannot-start-on-windows | 50 | — | po-decision, native-host |
| 32 | codex-design-readiness-child-rejects-valid-review | 50 | Qualify the authenticated-route and tool-disable clauses with counted tests. | native-host, po-decision |
| 41 | critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard | 50 | Implement the decided budget behaviour and the notes-persistence fix, then pin it. | po-decision, native-host |
| 51 | design-course-run-v2-refuses-its-own-documented-routes | 50 | If kept, fix the output collision, resume and revision-path gaps and replace the skips. | po-decision, native-host |
| 90 | greenfield-comparisons-need-reproducible-public-evidence | 25 | Turn the reconstructed acceptance draft into an implementation and a counted test. | po-decision |
| 91 | greenfield-design-course-cost-and-proportionality | 25 | Implement the cost and proportionality limits and pin them with a counted test. | po-decision |
| 95 | guard-push-refuses-read-only-git-without-push | 50 | Implement the second clause if the PO asks for it. | po-decision |
| 104 | implementation-without-dispatch-escapes-review-coverage | 25 | Implement the review-coverage check for dispatchless commits and test it. | po-decision |
| 109 | lifecycle-read-scope-blocks-host-declared-system-skill | 50 | Implement the narrow declared-skill admission and the catalog-bound clauses that need a protected read-scope seam. | native-host, po-decision |
| 132 | project-calibration-retains-new-project-placeholder | 50 | — | po-decision, verify-wsl |

### N — no agent work: only Critic, Verify, native host or PO acceptance is open (29)

| # | Item | Stage | Agent work (remeasure) | Other owners |
| --- | --- | --- | --- | --- |
| 1 | a-read-only-probe-can-dump-the-process-environment-into-a-transcript | 75 | — | verify-wsl |
| 3 | advisor-demand-reuse-has-no-design-course-bound | 75 | — | verify-wsl |
| 5 | advisor-question-contract-and-final-source-binding-conflict | 75 | — | native-host |
| 11 | agy-managed-copy-first-start-lacks-attestation | 50 | — | native-host |
| 12 | antigravity-1-2-13-blocks-managed-refresh | 50 | — | native-host |
| 16 | auto-install-pre-push-hook-with-the-plugin | 75 | — | native-host |
| 20 | budget-checkpoint-fires-below-the-briefed-cap | 75 | — | verify-wsl |
| 21 | capability-inventory-checker-is-red-at-head | 75 | — | verify-wsl |
| 33 | codex-own-session-audit-export-missing | 75 | — | native-host |
| 46 | declared-product-criteria-need-matching-acceptance-evidence | 75 | — | — |
| 49 | design-approval-validator-rejects-json-key-reordering | 75 | — | — |
| 53 | design-intake-generator-omits-question-answers | 75 | — | — |
| 59 | desktop-app-support-is-unverified | 50 | — | native-host |
| 65 | dispatch-records-land-under-specs-evidence | 75 | — | verify-wsl |
| 66 | domain-scanner-findings-need-reproduction-before-remedy | 50 | — | verify-wsl |
| 73 | first-enrollment-enters-retirement-before-consent | 50 | — | verify-wsl |
| 76 | gh-delivery-classifier-is-not-wired | 75 | — | verify-wsl |
| 88 | governance-scope-rejects-readonly-host-git-control | 75 | — | native-host |
| 89 | greenfield-approval-policy-applies-after-intake-transition | 75 | — | native-host |
| 115 | native-patch-rename-drops-protected-content-markers | 50 | — | native-host |
| 123 | outside-root-read-label-skips-option-value-file-tokens | 75 | — | — |
| 130 | preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt | 75 | — | verify-wsl |
| 134 | protected-baseline-rejects-canonical-discarded-idle-state | 75 | — | — |
| 136 | push-classifier-does-not-model-powershell-backtick-escapes | 75 | — | — |
| 142 | reconnect-sandbox-empty-child-output-breaks-bootstrap | 50 | — | native-host |
| 161 | signing-prompt-prints-the-whole-review-package | 50 | — | native-host |
| 162 | signing-toolchain-readiness | 50 | — | verify-wsl |
| 167 | verify-on-a-wsl-mnt-drive-checkout-hides-its-reason | 50 | — | verify-wsl |
| 173 | worktree-process-start-parser-misreads-spaced-comm | 50 | — | verify-wsl |
