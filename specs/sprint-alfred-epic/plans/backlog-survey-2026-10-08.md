# Backlog survey 2026-10-08 (late) — coverage of the 186 open items for the 0.7.0 content candidate

Source: read-only Explore survey of `backlog/items/` (all `status: open`, `TEMPLATE.md` excluded), dispatched by the
Elephant under PO goal BH. Evidence classes: **a** fixed in source by a commit · **b** owned by a spec section/case/AC ·
**c** listed only in `next-actions-2026-10-08.md` · **d** not covered anywhere (a > b > c when several apply).
"weak" = surveyor's judgement, not a literal match. Triage column: F filled · P prose, no decision · E empty · N none.
Counts: d 63 · c 10 · b 72 · a 41. Sprint split: alfred 136, none 28, nightwing 20, batman 2. No (a) item is closed;
several still need a host run. Nothing here is PO-accepted. Elephant dispositions for (d) are in §5.

## 1. (d) Not covered (63)

| Item | Problem | Sprint | Tri | Evidence |
|---|---|---|---|---|
| 2026-08-08-the-authority-decision-offers-two-candidates-and-one-of-them-is-a-literal | authority decision offers a PRD option hard-coded unavailable | nightwing | F | triage: superseded by ADR-0085 ("likely") |
| 2026-08-08-the-bootstrap-skill-grows-by-budget-raise-instead-of-by-module | skill byte cap raised instead of moving content to references | nightwing | F | triage §6 deferred |
| 2026-08-09-agents-read-the-pipelines-source-because-nothing-describes-its-interface | ~40/114 commands spent reading source; no interface doc | nightwing | F | nothing found |
| 2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection | grammar/kickoff syntax only learned by refusals | nightwing | F | not started |
| 2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal | Codex fallback escalates every lifecycle denial to a human | nightwing | F | nothing found |
| 2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery | `kickoff promote apply` partial without agent recovery | nightwing | F | nothing found |
| 2026-08-09-two-minor-happy-path-retries-in-the-final-codex-run | `kickoff-` prefix undocumented; capability goes stale | nightwing | F | triage says fixed, no SHA |
| 2026-08-12-stale-checkout-runs-outdated-human-approval-ceremony-against-current-trust-policy | stale checkout runs old signing flow | nightwing | F | skew hint not started |
| 2026-08-21-enforce-kickoff-po-questions | language/profile can be invented instead of asked | nightwing | F | nothing found |
| 2026-08-26-existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration | agy ruleset update drifts `pipeline.user.yaml` | nightwing | F | not started |
| 2026-08-27-a-plugin-update-under-an-onboarded-project-derails-the-next-session-into-repair | plugin update forces a two-step repair | nightwing | F | not started |
| 2026-08-27-a-repository-agent-definition-is-inert-the-runtime-loads-the-installed-copy | repo agent-definition edits ignored by runtime | nightwing | F | related 337492443 |
| 2026-08-27-a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op | stale stamp makes reload a silent no-op | nightwing | F | nothing found |
| 2026-08-28-every-small-correction-costs-a-new-hash-and-a-new-human-interaction | each fix invalidates the preimage | batman | N | deferred until after R3 |
| 2026-08-28-guard-bypass-paths-have-no-negative-regression-suite | no negative suite for found bypasses | nightwing | N | only env-dump pins 069813bf3 |
| 2026-08-28-remote-side-enforcement-is-the-only-boundary-a-local-bypass-cannot-reach | remote-side enforcement missing from the model | nightwing | N | docs not started |
| 2026-08-28-two-signature-ceremonies-in-one-sitting-overwrite-each-others-proof | two signings overwrite each other's proof | nightwing | F | triage says fixed, no SHA |
| 2026-08-28-verify-evidence-is-trusted-on-read-and-was-forged-by-hand | Verify evidence trusted on read; hand-forged once | nightwing | N | nothing found |
| 2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance | admin overhead varies by runner | nightwing | F | PO: after 0.7 |
| 2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn | Codex worker sandbox blocks git spawn | none | F | deferred to native-Windows Codex package |
| 2026-09-12-author-repair-route-has-no-signed-event-chain | author repair has no signed event chain | nightwing | N | deferred |
| 2026-09-28-declared-system-skill-read-requires-human-override | host system skill read needs override (Codex) | none | P | placed in R2; R2 names no skill root |
| 2026-09-28-lifecycle-read-scope-blocks-host-declared-system-skill | lifecycle read scope blocks host skill read | alfred | F | same |
| 2026-09-28-onboarding-home-override-does-not-bind-machine-plane | home override does not bind machine-plane reads | none | E | "unclear"; no test |
| 2026-09-28-model-role-confirmation-prompt-obscures-required-digest | model-role confirmation hides its digest | alfred | F | triage says fixed, no SHA |
| 2026-09-28-readiness-input-omits-current-advisor-observation | readiness input lacks Advisor observation | none | N | ADR-0085 removal pending |
| 2026-09-28-stale-hgo-capability-shadows-current-authorization | stale override capability shadows current one | none | P | no regression test |
| 2026-09-28-worktree-process-start-parser-misreads-spaced-comm | process start parsed wrong with spaced comm | alfred | P | CLOSEOUT-T1 stopped |
| 2026-09-29-claude-greenfield-seeds-unselected-codex-targets | Claude greenfield seeds unselected Codex targets | alfred | N | not started |
| 2026-09-29-codex-advisor-evidence-fails-after-host-update | sealed Advisor result unreadable after host update | alfred | N | ADR-0085 (P8 retires reader) |
| 2026-09-29-disjoint-signed-hgo-actions-invalidate-one-another | disjoint signed overrides invalidate each other | alfred | N | probe first |
| 2026-09-29-cross-runner-chat-intake-reference-needs-host-capture | chat turn not capturable by host reference | alfred | N | probe first |
| 2026-09-29-governance-scope-rejects-readonly-host-git-control | governance rejects read-only host git mount | alfred | P | "unclear" |
| 2026-09-29-nongit-retirement-reader-calls-inaccessible-controller-helper | retirement reader calls unreachable helper | alfred | N | "unclear" |
| 2026-09-29-onboarding-init-greenfield-matrix-is-serial-and-slow | greenfield onboarding tests serial | alfred | N | nothing found |
| 2026-09-29-reconnect-sandbox-empty-child-output-breaks-bootstrap | empty nested bootstrap output, no recovery | alfred | N | not started |
| 2026-09-29-security-scanner-failures-lose-executable-and-timeout-provenance | scanner failures lose executable/timeout detail | none | N | nothing found |
| 2026-09-29-windows-portable-seed-rolls-back-with-hidden-worktree-error | Windows seed rollback hides worktree error | none | P | needs host replay |
| 2026-09-29-worktrees-share-onboarding-private-state-with-root-bound-intake | worktrees share onboarding private state | alfred | F | triage says fixed, no SHA |
| 2026-10-01-hooks-enforce-available-parallel-dispatch | hooks do not oblige parallel dispatch | none | N | PO choice (FANOUT) |
| 2026-10-04-git-hook-runtime-snapshots-go-stale-after-plugin-changes | hook snapshots stale after plugin change | alfred | E | partial eb2478e24, c974ed27c |
| 2026-10-04-signing-prompt-prints-the-whole-review-package | signing prompt dumps the review package | alfred | E | not started |
| 2026-10-05-advisor-provenance-ancestor-check-fails-on-any-sibling-write | Advisor provenance check fails on sibling write | alfred | E | T35, protected |
| 2026-10-05-bootstrap-should-refresh-hooks-when-the-plugin-updated | bootstrap does not refresh hooks | alfred | E | partial 72a9f81c5, eb2478e24 |
| 2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries | dispatch-record log stays empty | alfred | E | nothing found |
| 2026-10-05-dispatch-records-land-under-specs-evidence | dispatch records under `specs/.../evidence` | alfred | F | partial 9fcda03f6; guard part protected |
| 2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads | Elephant context spent on wake-ups/inline reads | alfred | E | triage §6 |
| 2026-10-05-guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target | guard-push refuses read-only `git grep` | alfred | E | recurred 2026-10-08 (toil T80) |
| 2026-10-05-kernel-closure-check-masks-violations-after-the-first | closure check stops at first violation | alfred | E | partial 866be2139 |
| 2026-10-05-outside-root-read-label-skips-option-value-file-tokens | outside-root label skips option-value tokens | alfred | E | R2, no case |
| 2026-10-05-scratch-has-no-retention-and-no-durability-check | scratch has no retention/durability check | alfred | E | partial 27e172a64, dea126ba9 |
| 2026-10-05-shell-classifier-faults-on-heredoc-body-text | heredoc body classified as `git apply` | alfred | E | partial d9b4bf031; guard part protected |
| 2026-10-05-shell-grammar-file-is-a-kernel-path-without-capability-placement | grammar file kernel path w/o capability | alfred | E | protected package |
| 2026-10-06-fanout-ledger-spawns-powershell-on-every-stop-on-windows | fan-out ledger spawns PowerShell per Stop | alfred | E | pins 2a51a0356, de4d37afa |
| 2026-10-07-critic-round-cap-and-delta-scope-are-not-enforced | QG-13 round cap / delta scope not enforced | alfred | F | needs spec change |
| 2026-10-07-design-phase-runs-critic-advisor-and-readiness-instead-of-one-review | design phase stacks three reviews | alfred | F | ADR-0085 additive U1–U3 landed; removal pending |
| 2026-10-07-design-workflow-package-v2-readiness-fixture-fails-on-windows | package v2 fixture fails on Windows | alfred | F | measurement named (toil T78) |
| 2026-10-07-desktop-app-support-is-unverified | Desktop app unverified | alfred | F | docs dab757674; PO host check |
| 2026-10-07-private-temp-root-not-secure-branch-has-no-test-seam | NOT_SECURE branch has no seam | alfred | F | pins 0407f3d4a |
| 2026-10-07-semgrep-console-coverage-note-has-no-test | semgrep note untested | alfred | E | nothing found |
| 2026-10-08-codex-bootstrap-in-the-typed-next-action | Codex readiness bootstrap in fresh-host next action | alfred | F | decision AO; premise unverified |
| 2026-10-08-typed-plugin-update-next-action | plugin update command as typed next action | alfred | F | decision AO |
| 2026-09-28-design-approval-validator-rejects-json-key-reordering | approval check depends on JSON key order | alfred | F | triage says fixed, no SHA |

## 2. (c) Listed only in next-actions (10)

| Item | next-actions row |
|---|---|
| 2026-08-28-an-orchestrator-write-into-a-running-dispatchs-tree-is-undetectable | §3 N5 (write lease) |
| 2026-08-28-delivery-is-not-always-a-git-push | §3 N11; classifier cf9ed9f53 |
| 2026-09-06-the-selected-critic-lane-briefs-contract-files-it-neither-pins-nor-binds | AL work; eb1c5e06c partial |
| 2026-09-06-the-t1-fallback-waits-for-failure-codes-the-route-collapses-before-they-arrive | AL work; pins 9a317fa56 RED |
| 2026-10-05-capability-inventory-checker-is-red-at-head | §0.3 baseline refresh; 392dfab78 partial |
| 2026-10-05-dispatch-record-ownership-binds-an-attempted-creation | §3 N10 |
| 2026-10-05-script-mediated-writes-bypass-protected-test-paths | §3 N6 |
| 2026-10-08-approval-verification-demands-head-equals-candidate | §0b.1; pins ce6b30031, fix 975352801 |
| 2026-10-08-sign-intent-disclosure-scan-blocks-for-minutes | §0.2; R7-6 part 3 |
| 2026-10-08-gh-delivery-classifier-is-not-wired | weak: §3 N11 / §4 tranche 2 |

## 3. (b) Owned by a spec contract (72) — item → owner

2026-08-27-a-runner-improvised-the-po-signature-instructions → §22.6 R7-6 · 2026-08-27-pretooluse-guards-do-not-fire-in-dispatched-subagents → §21.4 R4-12 ·
2026-09-27-codex-wsl-required-advisor-has-no-completable-route → §16 A, §17 (ADR-0085) · 2026-09-27-design-generator-repeats-large-source-material → §16 D ·
2026-09-27-hgo-patch-preflight-before-signature → §16 B · 2026-09-27-design-bootstrap-verify-state-contradicts-deferred-contract → §16 D, R5-4 ·
2026-09-27-greenfield-approval-policy-applies-after-intake-transition → §16 C · 2026-09-27-bounded-reader-terminal-binding → §16 E ·
2026-09-27-powershell-bypasses-onboarding-read-boundary → §16 B, R7-8 · 2026-09-27-scratch-must-remain-writable-across-lifecycle-states → §16 B, R1-4 ·
2026-09-28-advisor-demand-reuse-has-no-design-course-bound → §17 (ADR-0085) · 2026-09-28-advisor-question-contract-and-final-source-binding-conflict → §17 (ADR-0085) ·
2026-09-28-agy-imported-plugin-snapshot-shadows-registered-plugin → §18, AM-W · 2026-09-28-codex-design-readiness-child-rejects-valid-review → §17 (ADR-0085) ·
2026-09-28-design-workflow-package-omits-contract → §17 (ADR-0085) · 2026-09-28-lifecycle-inspect-omits-current-plan-spec-digests → R6-2 ·
2026-09-28-plan-submission-must-not-require-separate-po-approval → §17 · 2026-09-28-no-uninstall-path-for-a-repository-that-once-opted-in → §18, AC-34 ·
2026-09-28-pipeline-hooks-act-in-repositories-that-never-opted-in → §18 · 2026-09-29-agy-managed-copy-first-start-lacks-attestation → §18 (weak), AM-W ·
2026-09-29-codex-own-session-audit-export-missing → R6-1 (weak) · 2026-09-29-existing-signing-key-reuse-deadlocks-onboarding → R3-1/R7-6 (weak) ·
2026-09-29-first-enrollment-enters-retirement-before-consent → §21.0, R3-1 · 2026-09-29-greenfield-design-course-cost-and-proportionality → R5-1 (ADR-0085) ·
2026-09-29-greenfield-machine-output-and-skill-budget → R4-6 · 2026-09-29-unasked-advisor-export-consent-in-fresh-seed → §17 (ADR-0085) ·
2026-09-29-unrelated-directory-entry-changes-reject-approved-design-package → §17, R7-5 · 2026-09-29-windows-greenfield-scratch-write-denied → R1-4 ·
2026-09-29-windows-pre-push-installer-fsync-and-relative-action → K3-13, K6-2 · 2026-09-30-model-family-approval-with-automatic-version-upgrades → R4-11 ·
2026-09-30-read-only-guard-admits-execution-and-output-options → R2-3 (weak) · 2026-10-03-advertised-git-to-head-pipeline-is-refused → R2-4 ·
2026-10-03-agy-driver-dispatch-and-design-routes-incomplete → R4-3 · 2026-10-03-claude-session-start-emits-codex-transcript-recovery-hint → R4-6 ·
2026-10-03-claude-windows-greenfield-lifecycle-not-walkable → R5-3, R1-1 · 2026-10-03-claude-windows-guard-refuses-every-in-repo-read → R2-1 ·
2026-10-03-dispatch-budget-lock-refuses-every-subagent-call-on-windows → R4-4, R7-11 · 2026-10-03-draft-phase-guard-blocks-mandatory-bootstrap-preflight → R1-3 ·
2026-10-03-forensics-and-audit-evidence-not-reconstructable → R6-1…R6-5 · 2026-10-03-git-stash-list-classified-as-working-tree-write → R1-5 ·
2026-10-03-feature-branch-push-admitted-without-signature-approval → R3-2 · 2026-10-03-handover-doc-committed-without-governance-classification → R6-3 ·
2026-10-03-guard-override-request-digest-drifts-after-arming → R3-3 · 2026-10-03-read-blocks-and-misleading-denial-texts-across-runners → R2-5 ·
2026-10-03-lifecycle-coordination-commands-refused-as-implementation-writes → R1-1/R1-2 · 2026-10-03-role-route-preflight-with-self-dispatch-fallback → R4-1/R4-2 ·
2026-10-03-session-readiness-drops-to-partial-after-bootstrap-ready → R1-9 · 2026-10-03-signature-ceremony-requires-operator-work-and-breaks → R3-4/R3-5 ·
2026-10-03-three-runner-happy-path-with-two-po-approvals → AC-32, R3-1 · 2026-10-04-approved-lifecycle-state-refuses-its-own-recovery-and-backlog-writes → R7-4 ·
2026-10-04-claude-design-readiness-cannot-start-on-windows → R4-9/R4-10 (ADR-0085) · 2026-10-04-design-course-run-v2-refuses-its-own-documented-routes → R5-8 (ADR-0085) ·
2026-10-04-design-trailer-verifier-lost-after-closure → R5-2 · 2026-10-04-guard-suite-fails-60-tests-on-native-windows → R4-8 (weak) ·
2026-10-04-parallel-work-in-one-checkout-is-unsafe → R7-11, N5/N10 · 2026-10-04-passive-read-policy-admits-uncovered-credential-files-and-rg-follow → R2-2 ·
2026-10-04-revised-native-design-cannot-reach-a-new-advisor-course → R5-6 (ADR-0085) · 2026-10-04-signed-quality-package-route-is-not-agent-operable-on-windows → R7-6 (weak) ·
2026-10-05-critic-cannot-complete-a-security-review-under-the-dispatch-budget-guard → K3-12 (weak) · 2026-10-05-every-dispatch-pays-a-bootstrap-receipt-detour → R7-11e ·
2026-10-05-host-crash-during-verify-leaves-a-descriptor-no-recovery-verb-can-clear → §20 RV, AC-33, R7-2 · 2026-10-05-preflight-with-a-forward-slash-plugin-path-records-no-bootstrap-receipt → R1-3, R7-11e ·
2026-10-05-windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures → K3-10 (weak) · 2026-10-06-approval-bound-design-package-lives-in-an-ignored-directory → R7-3 ·
2026-10-06-preflight-hides-the-git-error-behind-gs-git-unavailable → R7-1b/c · 2026-10-07-sign-intent-bare-openssl-spawn-searches-the-working-directory-on-windows → R7-6e ·
2026-10-08-auto-install-pre-push-hook-with-the-plugin → K6-2, R7-7e · 2026-10-08-catalogue-admit-prescribed-lifecycle-verbs → R1-1/R1-2, R7-9c ·
2026-10-08-denial-names-a-diagnosis-it-refuses → R7-4 · 2026-10-08-machine-wide-key-directory-resolution → R7-6 (recurred) ·
2026-10-08-signing-toolchain-readiness → R7-6, R7-7 · 2026-10-08-transfer-redaction-alters-digest-bound-files → R7-3 (weak).

Note (surveyor): spec.md does not mention ADR-0085; items marked "(ADR-0085)" map to §17 text describing the Advisor/
readiness stack that ADR-0085 removes — a spec/ADR reconciliation item for the spec-AC pass.

## 4. (a) Fixed in source (41) — item → commit(s)

2026-09-27-installed-design-trailer-example-is-rejected-by-git-guard 2a466fa59 · 2026-09-28-codex-advisor-shared-namespace-rejects-fresh-repository-identity 8b5dcf4fb (tentative) ·
2026-09-28-prepared-codex-readiness-receipt-does-not-bind-finalized-output 8b5dcf4fb · 2026-09-29-antigravity-1-2-13-blocks-managed-refresh d1a015ff5 ·
2026-09-29-commit-grammar-hint-still-requires-scratch-message-file 15722ce6a · 2026-09-29-git-hook-runtime-snapshot-omits-protected-baseline-catalog 26fef9e7d (host run) ·
2026-09-29-native-patch-rename-drops-protected-content-markers 26fef9e7d (host run) · 2026-09-29-onboarding-test-runner-reports-async-pass-before-settlement 26fef9e7d (host run) ·
2026-09-29-protected-baseline-rejects-canonical-discarded-idle-state 26fef9e7d (host run) · 2026-09-29-retirement-reader-masks-typed-unsafe-layout-inspection 26fef9e7d (host run) ·
2026-09-29-semgrep-default-version-check-blocks-offline-local-rules-scan 26fef9e7d (4/156 fail on host) · 2026-10-03-dispatch-guard-rejects-built-in-capitalized-agent-types 57e397b0f ·
2026-10-04-brownfield-implementation-entry-demands-a-greenfield-design-block 21fee38d1 · 2026-10-05-agent-obligations-says-no-and-and-while-the-guard-admits-six-segments 7b1b4083b ·
2026-10-05-budget-checkpoint-fires-below-the-briefed-cap b89e26e0f, 573b5355b · 2026-10-05-commit-producer-path-order-failures-count-against-the-tool-cap c277e4aac ·
2026-10-05-completion-fd-suites-cannot-run-as-single-files 2f0c00932 · 2026-10-05-gitleaks-repair-ignore-cli-is-a-no-op-on-windows c30c005d8 ·
2026-10-05-gitleaks-content-suppression-does-not-match-on-windows e92635db7 · 2026-10-05-guard-push-treats-gitleaks-as-a-git-command 6b0413700, 6ca4474d3 ·
2026-10-05-node-v24-on-windows-creates-a-real-nul-file 866be2139, 12ac0a7af · 2026-10-05-push-classifier-misreads-backslash-escaped-quotes 6b0413700, a2857ac3a ·
2026-10-05-verify-on-a-wsl-mnt-drive-checkout-hides-its-reason dac8d1314 · 2026-10-05-source-agent-definition-change-locks-that-agent-until-install 337492443 ·
2026-10-06-critic-scratch-name-randomness-has-no-admitted-command f95fc6998 · 2026-10-06-critic-scratch-notes-write-is-refused-again f95fc6998 ·
2026-10-06-git-for-windows-2-56-rejects-git-config-global-nul 12ac0a7af, 2532a96fe · 2026-10-06-gitleaks-repair-does-not-check-that-the-moved-value-is-the-reviewed-one 2c2aafccd (registration pending) ·
2026-10-06-goldfish-bugfix-module-conflicts-with-qg-04 b3cabc7f8 · 2026-10-06-mandatory-hook-readiness-returned-refusal-skips-rollback ddabe0ae3 ·
2026-10-06-push-classifier-deny-list-does-not-converge d9b4bf031, 49d6f928d · 2026-10-06-push-classifier-does-not-model-powershell-backtick-escapes c9b9d0101, d9b4bf031 ·
2026-10-06-push-classifier-misses-nested-quotes-and-redirect-before-push 7b0bb402a, 49d6f928d · 2026-10-06-semgrep-partial-parsing-warnings-fail-the-whole-scan 28eac0677, d69d39ad5 ·
2026-10-07-a-read-only-probe-can-dump-the-process-environment-into-a-transcript da20519dd · 2026-10-07-heredoc-fed-to-non-shell-command-runners-is-data-to-the-push-classifier e694f8509 ·
2026-10-07-signing-default-test-fixture-root-escapes-the-repository 32169fca8 · 2026-10-07-vim-es-and-busybox-heredoc-runners-are-data-to-the-push-classifier 8fafb1e99 ·
2026-10-08-evidence-artifacts-carry-no-commit-identity be0bd4a91 · 2026-10-08-git-push-classifier-misses-env-s-and-editor-bang 9bc217fe9, d256c7e81 ·
2026-10-08-model-role-bootstrap-is-always-unavailable-on-native-windows 4cead36e4.

## 5. Elephant dispositions (2026-10-08 late; rulings, not PO acceptance)

- **(a) 41:** a mechanical triage slice fills each item's Triage block (`Decision: fixed in source`, commit SHAs from §4,
  remaining host-run need named); status stays `open` until the candidate's host checklist H1–H12 has run, then they
  close in one batch. Items marked "host run" are added to the host checklist.
- **(b) 72 / (c) 10:** close with their owning slice; the spec-AC reconciliation pass checks each against its owner.
  ADR-0085 vs spec §17 is a spec reconciliation item (spec edit needs the PO's design approval → PO list).
- **(d) 63:** grouped in `plans/backlog-d-dispositions-2026-10-08.md` (to be written): (i) in 0.7.0 as a fix slice
  where it is toil the PO hit (BJ focus); (ii) "triage says fixed, no SHA" → a verification probe slice; (iii)
  nightwing/batman/PO-deferred items → explicit `deferred` triage with owner and expiry (QG-06), listed for PO
  confirmation, not silently dropped.
