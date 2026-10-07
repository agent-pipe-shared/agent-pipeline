# Backlog triage 2026-10-07 — every open item mapped for the next local 0.7.0 candidate

PO 2026-10-07: the candidate carries the whole remaining Alfred scope and every open defect and backlog item (decision B,
afternoon instruction "inkludiere alle offenen Defekte und backlog items"). Seven read-only triage passes checked each
of the ~200 open items once, live, against HEAD (`1097adf62`..`8bb937cf9`). "Fixed in source" is source evidence only;
an item closes after its regression test is confirmed (close-out sweep). PO decisions referenced: I–P in
[`po-decisions-2026-10-07.md`](po-decisions-2026-10-07.md).

## 1. Close-out sweep (fixed in source; confirm the test, then close with evidence)

advisor-prompt-before-host-admission (4f27d3e80) · architecture-design-errors-omit-field-paths,
architecture-fitness-model-repeats, architecture-materialization-premature-code (26fef9e7d) ·
browser-preflight-missing-host-library · claude-bootstrap-action-rejected · fresh-preflight-hides-onboarding-action ·
git-apply-bypasses-draft-source-guard (1d7c76581) · greenfield-handover-supersession-marker ·
onboarding-spec-marker-preapproval-reconcile · reopened-approved-plan-blocks-ack (21b30e597) ·
repeated-lifecycle-denials-not-counted · restart-barrier-before-intake-capture · zero-open-design-questions ·
advisor-evidence-read-size-limit · codex-advisor-shared-namespace · codex-compact-sessionstart-json (f9ebdd5b6) ·
default-claude-readiness-alias · design-approval-validator-key-reordering · design-workflow-signing-schema-drift
(3b05a045e) · governance-scope-stale-worktree · historical-plan-cancellation (3b05a045e) ·
lifecycle-inspect-plan-spec-digests · onboarding-home-override-machine-plane · stale-hgo-capability-shadows ·
worktree-process-start-parser · antigravity-1-2-13-managed-refresh (d1a015ff5) · commit-grammar-hint-scratch-file
(15722ce6a) · first-enrollment-retirement-before-consent · git-hook-runtime-snapshot-protected-baseline ·
governance-scope-readonly-host-git-control · native-patch-rename-protected-markers · nongit-retirement-reader ·
onboarding-test-runner-async-pass · protected-baseline-discarded-idle-state · retirement-reader-masks-unsafe-layout ·
semgrep-default-version-check · worktrees-share-onboarding-private-state · dispatch-guard-capitalized-agent-types
(57e397b0f) · brownfield-entry-greenfield-block (21fee38d1) · budget-checkpoint-below-cap (46cc537b5) ·
gitleaks-content-suppression-windows (e92635db7) · gitleaks-repair-ignore-cli-windows (c30c005d8) ·
guard-push-treats-gitleaks-as-git · kernel-closure-check-masks · source-agent-definition-locks-agent (337492443) ·
verify-on-wsl-mnt-hides-reason (dac8d1314) · mandatory-hook-readiness-rollback (ddabe0ae3) ·
push-classifier-backslash-escaped-quotes (6b0413700; residual moves to Q12) · model-role-confirmation-digest ·
prepared-codex-readiness-receipt · two-minor-happy-path-retries (direction 1) · two-signature-ceremonies (defect 1).
Close after an installed-host replay (marked, not closed in this candidate): feature-branch-push-without-signature,
agy-managed-copy-attestation, windows-portable-seed, windows-pre-push-installer-fsync.

## 2. Superseded by ADR-0085 (accepted, decision I) — close when the removal lands

advisor-demand-reuse · advisor-question-contract-binding · codex-design-readiness-child · design-workflow-package-omits-contract ·
readiness-input-omits-advisor · revised-native-design-new-advisor-course · design-course-run-v2-own-routes (course part) ·
claude-design-readiness-windows · codex-advisor-evidence-after-host-update · greenfield-design-course-cost ·
unrelated-directory-entry-package (reader part) · unasked-advisor-export-consent (advisor half) ·
role-route-preflight (Advisor part) · 2026-10-07-design-phase-runs-critic-advisor-readiness · authority-decision-literal
(likely). Q12 option B supersedes: push-classifier-powershell-backtick, push-classifier-nested-quotes.

## 3. In flight (this run)

R7-1 null device (+ node-v24-nul, git-2-56-nul) · R7-11 budget lock (+ dispatch-budget-lock-windows,
parallel-work umbrella part) · R7-6 signing readiness (+ sign-intent-bare-openssl, runner-improvised-signature,
signature-ceremony part) · R7-3 tracked design artifacts (+ approval-bound-package-ignored) · SEM semgrep coverage ·
COMMITFLOW single-line producer (T29; + commit-producer-path-order) · R7-7 readiness report.

## 4. Unprotected work for the candidate (fan-out lanes)

- Templates/docs: agent-obligations "No `&&`" text (generator); design trailer stage-0 form (generator + copies,
  decision #6); critic-review drops `openssl rand` (L); QG-04 rule (N); bootstrap-teach-constraints (skill text);
  remote-side-enforcement docs; stale-checkout skew hint (po-human-approval).
- Test infrastructure: completion-fd single-file runner (T33); hardened private temp root for win32 fixtures (O).
- Scratch durability warning + sweep verb (P).
- Handover governance classification in pre-commit; preflight-hides-git-error envelope cause (R7-1b).
- Signing prompt prints whole review package (T25) → one ready command, JSON to a file (with R7-6).
- Onboarding cluster (serialize on `project-onboarding-v3.mjs` / `onboarding-continuity.mjs`): design-generator-repeats,
  plugin-update-derails (name the cause), existing-repos-drift (detect + prompt), reconnect-sandbox-empty-output,
  claude-greenfield-unselected-codex-targets, greenfield-approval-policy replay, greenfield-machine-output dedupe.
- Forensics/audit (R6, split in four); repository-agent-definition-inert + stale-version-stamp (one session-start readback).
- HOOKREFRESH S1–S7 (decision M); bootstrap-refresh-hooks folds in.
- ADR-0085 removal (decision I) — needs an implementation plan first (slices, migration hints, legacy approvals).

## 5. Protected work → one signed package for the PO's return

R1 catalogue core (lifecycle-coordination, draft-phase-preflight, git-stash-list, advertised-git-to-head, scratch
writable sweep) · R2 reads (read-blocks, in-repo-read, passive-read credential files + `rg -L`, outside-root option
values, declared-system-skill read ×2, read-only-guard execution options, powershell-bypasses) · R7-4 approved-state
writes · R7-11e SubagentStart receipt (+ every-dispatch-bootstrap-receipt, preflight-forward-slash) · advisor
ancestor predicate (T35) · dispatch-record lane (T31 decision K, records-under-specs refusal) · Q12 classifier (decision
J) in `lib/git-cmd.mjs` (not protected) + guard-push pins · hooks.json `$comment` fix · heredoc-body classifier ·
override-digest drift · guard-bypass negative suite + registrations (verify-suites.json) · round-cap enforcement
(QG-13, needs a short spec delta) · R3 signing ceremony parts in `pipeline-state.mjs`/`po-commands.mjs`.

## 6. Deferred with reason (PO-scheduled or needs design beyond this candidate)

delivery-is-not-always-a-git-push (Batman) · three-runners-admin-overhead (post-0.7) · codex-worker-supervisor-sandbox,
selected-critic-lane, t1-fallback (native-Windows Codex package, re-triage 2026-12-15) · author-repair-signed-chain ·
every-small-correction-new-hash (after R3) · orchestrator-write-lease · hooks-enforce-parallel-dispatch ·
codex-own-session-audit-export · cross-runner-chat-intake · elephant-main-context telemetry · bootstrap-skill-budget
(last, after content settles) · agy-imported-plugin-snapshot (spike + PO topology A/B) · no-uninstall-path (B2 policy) ·
disjoint-signed-hgo-actions and existing-signing-key-reuse (probe first) · script-mediated-writes integrity (security
design) · dispatch-record-ownership (worktree-per-Goldfish) · three-runner happy path (AC-32 host run, PO).
