# Backlog reconciliation 2026-10-07 — triage entries versus what has landed

Read-only comparison of [`backlog-triage-2026-10-07.md`](backlog-triage-2026-10-07.md) sections 1, 3, 4, 5 and the
backlog items created 2026-10-07 against `git log 8bb937cf9..HEAD` and the "Current state" / "Earlier state" sections of
[`0.7-execution-order.md`](0.7-execution-order.md). Nothing is decided or closed here.

Classes: **a** landed (commit in range addresses it) · **b** in flight / slice named, or partial · **c** not started
(no commit, no named slice) · **d** protected / signed-package (section 5).

Section 1 rule: "landed" means the close-out commit exists in range. Items whose source fix predates the range (SHA in the
triage text) but whose close-out has not run are class c with the fix SHA in the note. Sub-items named in parentheses in
section 3 (for example node-v24-nul) are folded into their lane row. Section "N" = the 2026-10-07 backlog items.

## Section 1 — close-out sweep

| Entry | Sec | Class | Evidence | Note |
|---|---|---|---|---|
| advisor-prompt-before-host-admission | 1 | a | ecbf2b030 | closed with evidence |
| architecture-design-errors-omit-field-paths | 1 | a | ecbf2b030 | closed with evidence |
| architecture-fitness-model-repeats | 1 | a | ecbf2b030 | closed with evidence |
| architecture-materialization-premature-code | 1 | a | ecbf2b030 | closed with evidence |
| browser-preflight-missing-host-library | 1 | a | ecbf2b030 | closed with evidence |
| claude-bootstrap-action-rejected | 1 | a | 8d4c96455 | closed with evidence |
| fresh-preflight-hides-onboarding-action | 1 | a | 8d4c96455 | closed with evidence |
| git-apply-bypasses-draft-source-guard | 1 | a | ecbf2b030 | closed with evidence |
| greenfield-handover-supersession-marker | 1 | a | ecbf2b030 | closed with evidence |
| onboarding-spec-marker-preapproval-reconcile | 1 | a | 70c740fca | closed with evidence |
| reopened-approved-plan-blocks-ack | 1 | a | ecbf2b030 | closed with evidence |
| repeated-lifecycle-denials-not-counted | 1 | a | ecbf2b030 | closed with evidence |
| restart-barrier-before-intake-capture | 1 | a | ecbf2b030 | closed with evidence |
| zero-open-design-questions | 1 | a | 8d4c96455 | closed with evidence |
| advisor-evidence-read-size-limit | 1 | a | ecbf2b030 | closed with evidence |
| codex-advisor-shared-namespace | 1 | c | none | close-out not run |
| codex-compact-sessionstart-json | 1 | a | ecbf2b030 | closed with evidence |
| default-claude-readiness-alias | 1 | a | 70c740fca | closed with evidence |
| design-approval-validator-key-reordering | 1 | b | none | remaining CLOSEOUT item named in execution order |
| design-workflow-signing-schema-drift | 1 | a | ecbf2b030 | closed with evidence |
| governance-scope-stale-worktree | 1 | c | none | close-out not run |
| historical-plan-cancellation | 1 | a | ecbf2b030 | closed with evidence |
| lifecycle-inspect-plan-spec-digests | 1 | b | none | "lifecycle-inspect test" slice named |
| onboarding-home-override-machine-plane | 1 | c | none | close-out not run |
| stale-hgo-capability-shadows | 1 | c | none | close-out not run |
| worktree-process-start-parser | 1 | b | none | spaced-comm seam named; CLOSEOUT-T1 stopped |
| antigravity-1-2-13-managed-refresh | 1 | c | none | fix d1a015ff5 pre-range; close-out not run |
| commit-grammar-hint-scratch-file | 1 | c | none | fix 15722ce6a pre-range; close-out not run |
| first-enrollment-retirement-before-consent | 1 | c | none | close-out not run |
| git-hook-runtime-snapshot-protected-baseline | 1 | c | none | close-out not run |
| governance-scope-readonly-host-git-control | 1 | c | none | close-out not run |
| native-patch-rename-protected-markers | 1 | c | none | close-out not run |
| nongit-retirement-reader | 1 | c | none | close-out not run |
| onboarding-test-runner-async-pass | 1 | c | none | close-out not run |
| protected-baseline-discarded-idle-state | 1 | c | none | close-out not run |
| retirement-reader-masks-unsafe-layout | 1 | c | none | close-out not run |
| semgrep-default-version-check | 1 | c | none | close-out not run |
| worktrees-share-onboarding-private-state | 1 | c | none | close-out not run |
| dispatch-guard-capitalized-agent-types | 1 | c | none | fix 57e397b0f pre-range; close-out not run |
| brownfield-entry-greenfield-block | 1 | c | none | fix 21fee38d1 pre-range; close-out not run |
| budget-checkpoint-below-cap | 1 | c | none | fix 46cc537b5 pre-range; close-out not run |
| gitleaks-content-suppression-windows | 1 | c | none | fix e92635db7 pre-range; close-out not run |
| gitleaks-repair-ignore-cli-windows | 1 | c | none | fix c30c005d8 pre-range; close-out not run |
| guard-push-treats-gitleaks-as-git | 1 | c | none | close-out not run |
| kernel-closure-check-masks | 1 | c | none | close-out not run |
| source-agent-definition-locks-agent | 1 | c | none | fix 337492443 pre-range; close-out not run |
| verify-on-wsl-mnt-hides-reason | 1 | c | none | fix dac8d1314 pre-range; close-out not run |
| mandatory-hook-readiness-rollback | 1 | c | none | fix ddabe0ae3 pre-range; close-out not run |
| push-classifier-backslash-escaped-quotes | 1 | b | a2857ac3a, d9b4bf031 | partial; residual moved to Q12, AF follow-up open |
| model-role-confirmation-digest | 1 | c | none | close-out not run |
| prepared-codex-readiness-receipt | 1 | c | none | close-out not run |
| two-minor-happy-path-retries | 1 | c | none | close-out not run |
| two-signature-ceremonies | 1 | c | none | R7-6 adjacent but not named; close-out not run |
| feature-branch-push-without-signature | 1 | c | none | needs installed-host replay first |
| agy-managed-copy-attestation | 1 | c | none | needs installed-host replay first |
| windows-portable-seed | 1 | c | none | needs installed-host replay first |
| windows-pre-push-installer-fsync | 1 | c | none | needs installed-host replay first |

## Section 3 — in flight

| Entry | Sec | Class | Evidence | Note |
|---|---|---|---|---|
| R7-1 null device | 3 | a | 12ac0a7af, 2532a96fe | shared constant, ratchet; delta Critic owed |
| R7-11 budget lock | 3 | a | d71588d8a, 4311c6f96, 46b500610 | fixes landed; F2 POSIX matrix still owed |
| R7-6 signing readiness | 3 | b | b365c009a, 8f5bab8de | partial; F3 stopped, T8/T9/F4 named next |
| R7-3 tracked design artifacts | 3 | a | 991cb703f | ignored bound paths refused |
| SEM semgrep coverage | 3 | a | d69d39ad5, a57eb288d | v2 evidence and win32 UNC refusal |
| COMMITFLOW single-line producer | 3 | a | 238d9b5de | single-line commit-flow copy commands |
| R7-7 readiness report | 3 | a | 35d876a11, 67f0b4cd4 | report plus prepare-for-signature gate |

## Section 4 — unprotected fan-out lanes

| Entry | Sec | Class | Evidence | Note |
|---|---|---|---|---|
| agent-obligations "No &&" text | 4 | a | 7b1b4083b | admitted && grammar stated |
| design trailer stage-0 form | 4 | a | 2a466fa59 | rejected design trailer dropped; copy sync unchecked |
| critic-review drops openssl rand (L) | 4 | a | f95fc6998 | bare mkdir naming, notes via Write |
| QG-04 rule (N) | 4 | a | b3cabc7f8 | two-dispatch bugfix rule stated |
| bootstrap-teach-constraints (skill text) | 4 | c | none | no commit, no slice |
| remote-side-enforcement docs | 4 | c | none | no commit, no slice |
| stale-checkout skew hint (po-human-approval) | 4 | c | none | in-range edits there are R7-6 only |
| completion-fd single-file runner (T33) | 4 | a | 38cf9f547, 2f0c00932 | pins plus fix |
| hardened private temp root (O) | 4 | b | 156e68c6b | module landed; B-S2 migration and seam pending |
| scratch durability warning (P) | 4 | b | none | C-S3 close-block warning named next |
| scratch sweep verb (P) | 4 | a | 27e172a64, 0d6c5e5f7 | CLI over retention library |
| handover governance classification in pre-commit | 4 | c | none | no commit, no slice |
| preflight-hides-git-error envelope cause (R7-1b) | 4 | c | none | no commit, no slice |
| signing prompt prints whole review package (T25) | 4 | c | none | tied to R7-6 lane, not named |
| onboarding: design-generator-repeats | 4 | c | none | onboarding files untouched in range |
| onboarding: plugin-update-derails | 4 | c | none | onboarding files untouched in range |
| onboarding: existing-repos-drift | 4 | c | none | onboarding files untouched in range |
| onboarding: reconnect-sandbox-empty-output | 4 | c | none | onboarding files untouched in range |
| onboarding: claude-greenfield-unselected-codex-targets | 4 | c | none | onboarding files untouched in range |
| onboarding: greenfield-approval-policy replay | 4 | c | none | onboarding files untouched in range |
| onboarding: greenfield-machine-output dedupe | 4 | c | none | onboarding files untouched in range |
| forensics/audit (R6, four-way split) | 4 | c | none | no commit, no slice |
| repository-agent-definition-inert + stale-version-stamp readback | 4 | c | none | no commit, no slice |
| HOOKREFRESH S1-S7 (incl. bootstrap-refresh-hooks) | 4 | b | c07f177f3, 3bc3f2e74, 9aa9ddf89, 81d0e45d3 | partial; installer typed refusals only, A-S2 named |
| ADR-0085 removal (decision I) | 4 | b | f98388740, b716d3fb3, 120fba18f, 8545160e8 | plan and U1-U3 additive modules; removal itself not done |

## Section 5 — protected, signed package

| Entry | Sec | Class | Evidence | Note |
|---|---|---|---|---|
| R1 lifecycle-coordination | 5 | d | none | protected |
| R1 draft-phase-preflight | 5 | d | none | protected |
| R1 git-stash-list | 5 | d | none | protected |
| R1 advertised-git-to-head | 5 | d | none | protected |
| R1 scratch writable sweep | 5 | d | none | guard part protected; sweep verb is separate |
| R2 read-blocks | 5 | d | none | protected |
| R2 in-repo-read | 5 | d | none | protected |
| R2 passive-read credential files + rg -L | 5 | d | none | protected |
| R2 outside-root option values | 5 | d | none | protected |
| R2 declared-system-skill read (x2) | 5 | d | none | protected |
| R2 read-only-guard execution options | 5 | d | none | protected |
| R2 powershell-bypasses | 5 | d | none | protected |
| R7-4 approved-state writes | 5 | d | none | protected |
| R7-11e SubagentStart receipt (+ two folded items) | 5 | d | none | protected |
| advisor ancestor predicate (T35) | 5 | d | none | protected |
| dispatch-record lane (T31 decision K, records-under-specs) | 5 | d | none | protected |
| Q12 classifier in lib/git-cmd.mjs (not protected) | 5 | b | d9b4bf031, 33014fba9, b5b4a3514, 5e94c2ae9 | partial; Q12-F4/F5 (AF) still named |
| Q12 guard-push pins | 5 | d | none | protected; pin-side commits are unprotected tests |
| hooks.json $comment fix | 5 | d | none | protected |
| heredoc-body classifier | 5 | d | none | narrowing landed in d9b4bf031; AF follow-up named |
| override-digest drift | 5 | d | none | protected |
| guard-bypass negative suite + registrations | 5 | d | none | pins 069813bf3 landed; registrations protected |
| round-cap enforcement (QG-13) | 5 | d | none | needs spec delta |
| R3 signing ceremony parts | 5 | d | none | protected |

## Section N — backlog items created 2026-10-07

| Entry | Sec | Class | Evidence | Note |
|---|---|---|---|---|
| a-read-only-probe-can-dump-the-process-environment | N | b | 069813bf3 | pins landed; fix named "ENVDUMP fix" next |
| critic-round-cap-and-delta-scope-are-not-enforced | N | d | none | is section 5 QG-13 |
| design-phase-runs-critic-advisor-and-readiness | N | b | f98388740, b716d3fb3, 120fba18f, 8545160e8 | partial; ADR-0085 removal pending |
| design-workflow-package-v2-readiness-fixture-fails-on-windows | N | b | none | "package-v2 win32 fixture measurement" named |
| heredoc-fed-to-non-shell-command-runners | N | b | 5e94c2ae9, d9b4bf031 | pins landed; Q12-F5 fix named |
| private-temp-root-not-secure-branch-has-no-test-seam | N | b | 0407f3d4a | "B-S1 seam" named; no seam yet |
| semgrep-console-coverage-note-has-no-test | N | c | none | filed from SEM Critic; no slice |
| sign-intent-bare-openssl-spawn-searches-working-directory | N | b | b6e529fd0, 9a54c453f | partial; win32 residual accepted (decision R) |
| signing-default-test-fixture-root-escapes-the-repository | N | b | none | R7-6-T9 homedirFn named |

## Counts

| Section | a | b | c | d | Total |
|---|---|---|---|---|---|
| 1 close-out | 19 | 4 | 34 | 0 | 57 |
| 3 in flight | 6 | 1 | 0 | 0 | 7 |
| 4 fan-out | 6 | 4 | 15 | 0 | 25 |
| 5 protected | 0 | 1 | 0 | 23 | 24 |
| N new items | 0 | 7 | 1 | 1 | 9 |
| **Total** | **31** | **17** | **50** | **24** | **122** |

## Class (c) — the remaining unstarted work (50)

Section 1 close-outs (34): codex-advisor-shared-namespace · governance-scope-stale-worktree ·
onboarding-home-override-machine-plane · stale-hgo-capability-shadows · antigravity-1-2-13-managed-refresh ·
commit-grammar-hint-scratch-file · first-enrollment-retirement-before-consent · git-hook-runtime-snapshot-protected-baseline ·
governance-scope-readonly-host-git-control · native-patch-rename-protected-markers · nongit-retirement-reader ·
onboarding-test-runner-async-pass · protected-baseline-discarded-idle-state · retirement-reader-masks-unsafe-layout ·
semgrep-default-version-check · worktrees-share-onboarding-private-state · dispatch-guard-capitalized-agent-types ·
brownfield-entry-greenfield-block · budget-checkpoint-below-cap · gitleaks-content-suppression-windows ·
gitleaks-repair-ignore-cli-windows · guard-push-treats-gitleaks-as-git · kernel-closure-check-masks ·
source-agent-definition-locks-agent · verify-on-wsl-mnt-hides-reason · mandatory-hook-readiness-rollback ·
model-role-confirmation-digest · prepared-codex-readiness-receipt · two-minor-happy-path-retries · two-signature-ceremonies ·
feature-branch-push-without-signature · agy-managed-copy-attestation · windows-portable-seed ·
windows-pre-push-installer-fsync.

Section 4 lanes (15): bootstrap-teach-constraints · remote-side-enforcement docs · stale-checkout skew hint ·
handover governance classification in pre-commit · preflight-hides-git-error envelope cause (R7-1b) · signing prompt prints
whole review package (T25) · onboarding cluster x7 (design-generator-repeats, plugin-update-derails, existing-repos-drift,
reconnect-sandbox-empty-output, claude-greenfield-unselected-codex-targets, greenfield-approval-policy replay,
greenfield-machine-output dedupe) · forensics/audit R6 · repository-agent-definition-inert + stale-version-stamp readback.

New item (1): semgrep-console-coverage-note-has-no-test.

Caveat: the 34 section-1 entries need only a regression-test confirmation and a close-out commit (fix is in source per
the triage); the 16 non-section-1 entries are real unstarted implementation.
