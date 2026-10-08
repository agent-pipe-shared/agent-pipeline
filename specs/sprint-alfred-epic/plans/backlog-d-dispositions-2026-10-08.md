# Dispositions for the 63 uncovered (d) backlog items — 2026-10-08 (late)

Elephant rulings under PO goal BH and decision BJ (simplify where the PO meets the toil; keep the enforcement layer).
Source list: `backlog-survey-2026-10-08.md` §1. Nothing here is PO-accepted; group D items need PO confirmation.

## A. In 0.7.0 as fix slices (toil the PO or the agents hit live)

| Slice | Items | Note |
|---|---|---|
| HOOKREFRESH-E | 2026-10-05-bootstrap-should-refresh-hooks-when-the-plugin-updated · 2026-10-04-git-hook-runtime-snapshots-go-stale-after-plugin-changes · 2026-08-27-a-plugin-update-under-an-onboarded-project-derails-the-next-session-into-repair · 2026-10-08-typed-plugin-update-next-action | enforcement per item's recurrence section (stale hook → Elephant non-ready + typed refresh; model-role readback required); toil T79 |
| GREP-PUSH | 2026-10-05-guard-push-refuses-a-read-only-git-grep-no-index-as-ambiguous-push-target | toil T80; guard-push code → GUARDRAIL class; protected test path → tranche |
| FANOUT-WIN | 2026-10-06-fanout-ledger-spawns-powershell-on-every-stop-on-windows | pins 2a51a0356, de4d37afa exist; PO-visible console spawns |
| WIN-SKIPS | 2026-10-07-design-workflow-package-v2-readiness-fixture-fails-on-windows | typed win32 skips naming the WSL route (toil T78) |
| TEMP-SEAM | 2026-10-07-private-temp-root-not-secure-branch-has-no-test-seam | pins 0407f3d4a exist |
| HGO-STALE-T | 2026-09-28-stale-hgo-capability-shadows-current-authorization | regression test first (test-only), fix only if red |
| PROCSTART | 2026-09-28-worktree-process-start-parser-misreads-spaced-comm | small parser fix, test-first |
| GREENFIELD-TARGETS | 2026-09-29-claude-greenfield-seeds-unselected-codex-targets | onboarding seeds only the selected runner |
| SCANNER-PROV | 2026-09-29-security-scanner-failures-lose-executable-and-timeout-provenance | typed failure keeps executable + timeout |
| SEMGREP-NOTE-T | 2026-10-07-semgrep-console-coverage-note-has-no-test | test-only |
| CLOSURE-ALL | 2026-10-05-kernel-closure-check-masks-violations-after-the-first | report all violations |
| SIGN-PROMPT | 2026-10-04-signing-prompt-prints-the-whole-review-package | R7-6 signing UX family |
| SKILL-READ | 2026-09-28-declared-system-skill-read-requires-human-override · 2026-09-28-lifecycle-read-scope-blocks-host-declared-system-skill · 2026-10-05-outside-root-read-label-skips-option-value-file-tokens | read-scope family → folded into TOILRES (read grammar), GUARDRAIL class |
| R5 (existing) | 2026-08-21-enforce-kickoff-po-questions | covered by R5 "asked once" + BC; close with R5 |
| TRANCHE | 2026-10-05-dispatch-records-land-under-specs-evidence (guard part) · 2026-10-05-shell-classifier-faults-on-heredoc-body-text (guard part) | protected paths → signed tranche |

## B. Verification probe first (claimed fixed without SHA, or "unclear")

One read-only probe dispatch establishes fixed / not fixed with `file:line` or commit evidence:
2026-08-09-two-minor-happy-path-retries-in-the-final-codex-run · 2026-08-28-two-signature-ceremonies-in-one-sitting-overwrite-each-others-proof ·
2026-09-28-model-role-confirmation-prompt-obscures-required-digest · 2026-09-29-worktrees-share-onboarding-private-state-with-root-bound-intake ·
2026-09-28-design-approval-validator-rejects-json-key-reordering · 2026-09-28-onboarding-home-override-does-not-bind-machine-plane ·
2026-09-29-governance-scope-rejects-readonly-host-git-control · 2026-09-29-nongit-retirement-reader-calls-inaccessible-controller-helper ·
2026-09-29-disjoint-signed-hgo-actions-invalidate-one-another · 2026-09-29-cross-runner-chat-intake-reference-needs-host-capture ·
2026-09-29-reconnect-sandbox-empty-child-output-breaks-bootstrap · 2026-10-05-dispatch-record-log-stays-empty-despite-mandatory-phase-entries ·
2026-10-08-codex-bootstrap-in-the-typed-next-action. Fixed → triage "fixed in source"; not fixed → group A slice or D.

## C. Host checklist (needs a real host; added to H1–H12)

2026-10-07-desktop-app-support-is-unverified · 2026-09-29-windows-portable-seed-rolls-back-with-hidden-worktree-error.

## D. Deferred beyond 0.7.0 — PO confirmation requested (owner: Elephant of the 0.8 planning session; expiry: 0.8 kickoff)

- Superseded by ADR-0085 (close as superseded once the ADR-0085 removal lands): 2026-08-08-the-authority-decision-offers-two-candidates-and-one-of-them-is-a-literal ·
  2026-09-28-readiness-input-omits-current-advisor-observation · 2026-09-29-codex-advisor-evidence-fails-after-host-update ·
  2026-10-05-advisor-provenance-ancestor-check-fails-on-any-sibling-write.
- ADR-0085 removal itself (2026-10-07-design-phase-runs-critic-advisor-and-readiness-instead-of-one-review): additive U1–U3 landed;
  the removal of the Advisor/readiness stack and the spec §17 rewrite is a design change → **PO decision: in 0.7.0 or 0.8?**
  Recommendation: 0.8 (removal touches the approval chain the candidate is about to be tested on).
- Already deferred by PO or triage: 2026-08-29-three-runners-showed-wide-pipeline-administration-overhead-variance (PO: after 0.7) ·
  2026-08-28-every-small-correction-costs-a-new-hash-and-a-new-human-interaction (after R3) · 2026-09-12-author-repair-route-has-no-signed-event-chain ·
  2026-08-08-the-bootstrap-skill-grows-by-budget-raise-instead-of-by-module · 2026-08-30-codex-worker-supervisor-hardcodes-a-sandbox-mode-that-blocks-git-spawn
  (native-Windows Codex package) · 2026-10-01-hooks-enforce-available-parallel-dispatch (PO choice FANOUT) ·
  2026-10-05-shell-grammar-file-is-a-kernel-path-without-capability-placement (protected kernel package).
- Process/documentation, not toil-critical: 2026-08-09-agents-read-the-pipelines-source-because-nothing-describes-its-interface ·
  2026-08-09-bootstrap-and-kickoff-teach-their-own-constraints-only-by-live-rejection (partly TOILRES) ·
  2026-08-28-remote-side-enforcement-is-the-only-boundary-a-local-bypass-cannot-reach · 2026-08-27-a-repository-agent-definition-is-inert-the-runtime-loads-the-installed-copy ·
  2026-10-05-elephant-main-context-spent-on-wake-ups-and-inline-reads · 2026-10-05-scratch-has-no-retention-and-no-durability-check ·
  2026-09-29-onboarding-init-greenfield-matrix-is-serial-and-slow · 2026-10-07-critic-round-cap-and-delta-scope-are-not-enforced (needs spec change).
- Nightwing-era Codex/agy items without a current repro: 2026-08-09-guard-denial-escalates-benign-commands-to-human-in-terminal ·
  2026-08-09-kickoff-promotion-cleanup-readback-has-no-in-session-recovery · 2026-08-12-stale-checkout-runs-outdated-human-approval-ceremony-against-current-trust-policy ·
  2026-08-26-existing-repos-drift-on-agy-pipeline-user-yaml-update-no-migration · 2026-08-27-a-stale-version-stamp-makes-a-plugin-reload-a-silent-no-op ·
  2026-08-28-guard-bypass-paths-have-no-negative-regression-suite.
- **Security, flagged for the PO rather than silently deferred:** 2026-08-28-verify-evidence-is-trusted-on-read-and-was-forged-by-hand —
  recommendation: 0.7.0 keeps the current trust (Verify evidence is advisory to the Critic, not a gate input it re-executes);
  the signed/bound verify receipt is an 0.8 item. PO decision requested.
