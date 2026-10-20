# Full Verify correction plan (2026-10-20)

Source: the measurement run of `c1771bc98`
(`specs/sprint-alfred-epic/evidence/full-verify-c1771bc98/`). 138 of 1057 steps are non-zero. Each
red suite was rerun alone in the clone (`fv-c1771bc98-classified*.json`), and every `test-red`
suite was rerun once more in the working checkout (`fv-causes.md`). All 103 test-red suites are
also red in the working checkout, so they are real reds, not fresh-clone artefacts. The sample
traced so far (the session-cleanup binding refusal) dates from the checkpoint import `d02409a8a`
(2026-10-12): these reds accumulated unmeasured, they are not one recent regression.

Protected among the red test files: only `hooks/guard-gate-strength.test.mjs` (TP-6) and
`hooks/notebook-write-coverage.test.mjs` (TP-10). The case-id registrations are protected
(`verify.mjs` TP-3, `verify-suites.json` TP-13) and go to C15/C16. Everything else is Goldfish work.

Fix rule for every cluster: decide per failing case whether the code or the test is wrong
against the Spec. A test is changed only when the Spec or an ADR changed the contract it pins
(for example ADR-0085), and the report names that source. No assertion is weakened to turn a
real defect green.

## Clusters

| # | Cluster | Suites (failing cases) | Signal | Owning item (D60 Q16) |
|---|---|---|---|---|
| K1 | Session-authority domain and continuity binding | session-cleanup-binding (39), session-cleanup-recovery (6), session-cleanup-power, design-workflow-package-builder (3), codex-critic-host CCH136, codex-critic-session-route, codex-design-advisor-host, afk-transaction-host (2), guard-dispatch-native-worker, native-goldfish-host-state-regression (3), pin-orphan-descriptor-recovery (AC-203), model-family-execution MFE018 | `domain-ancestor-unsafe`, `SDC-AUTHORITY-UNAVAILABLE`, "continuity current invocation required before binding", `SQ-AUTHORITY-UNAVAILABLE` | AC-224 (PF-55 area); AC-203 |
| K1h | Hang group (4.4-5.0 h each in Verify) | onboarding-continuity, design-workflow-package-v2, agy-session-dispatch, native-goldfish-host-state, native-goldfish-host-finalizer, project-reset-git-hooks, model-family-host-store, model-family-invocation (+ signing-disclosure-sweep, codex-pretool-guard, project-onboarding-v3 long) | not rerun alone yet; likely one shared lock or registry wait | measured first (K1 package), then owner |
| K2 | ADR-0085 retirement not followed by tests | project-onboarding-e2e (`DWP-PRESENT-RETIRED`), spec-readiness-host (3, `DESIGN-COURSE-RETIRED`), design-workflow-package-route R4-T0-6, measure-tofu-push-e2e, pin-approval-bound-design-package (4, AC-113), pin-configure-verify (4), interruption-receipts | retired route still exercised | AC-151 / AC-245 / AC-113 |
| K3 | Architecture decisions (AC-19) | architecture-effective-decisions (7), architecture-baseline, architecture-decision-continuity, architecture-entry-required-source (2), rigor-floor (5), guard-push-architecture GPA001 | `decision-adoption-unverified`, inputDigest instability | AC-9 / AC-119 area (epic AC-19) |
| K4 | Human approval and signed integration | guard-human-override (4), human-guard-override-capability-scan (3), commit-msg-hook-signed-integration (7), guard-git-signed-integration (5), model-family-approval-request MFA010, critical-action-approval-request, threat-model-approval-request (fixture not a Git repository), guard-gate-strength-ledger (2) | approval list and fixture drift | AC-123 / AC-207 |
| K5 | Documentation and text contracts | pipeline-start-v3 PSV04, language-canon, push-release-flow-docs-contract (3), doc-contract-tests (3) + doc-contract-check, license-contract-check, phase3-sdlc-coherence, no-autoupdate-key, product-capability-inventory (4), hook-governance-scope (unadmitted `claude-task-output-scope-posttool.mjs`), spec-retention-check | text or inventory drift | D60 doc contracts; AC-12 |
| K6 | Dispatch authorship and Critic coverage | dispatch-authorship-verify (7), check-critic-skip-coverage (5) + its check, verify-evidence-producer (5, `SCF-GENERIC-BATCH-REQUIRED`), session-critic-finalizer, critic-review-lineage, codex-critic-packet-host, codex-isolated-critic-protected-preimage, portable-agy-authorship-export | T0/T5 classification, record shape | AC-142 |
| K7 | Registration checkers | verify-case-completion-registry + check, verify-suite-registration + check, suite-registration-check, verify-suite-append-history-check, and the 10 case-drift suites | protected registrations | C15, C16 |
| K8 | Guard hook suites that crash or time out | guard-apply-patch, guard-devplan, guard-gate-strength (TP-6), notebook-write-coverage (TP-10), antigravity-pretool-guard, lifecycle-denial-loop RC04C001, codex-session-start-hint SSH003 | whole-file failure after 30-95 s | AC-195 / AC-247 area; TP-6/TP-10 to the bundled ceremony if the test must change |
| K9 | Remaining single suites | control-placement, agy-final-return AFR18, slice-queue-cli SC15, pipeline-state-rebind-runner (2), codex-host-output-custody (9), pipeline-state-late-verify, local-worker-supervisor-cli (9), nova-verify-journal (3), afk-claude-host, afk-activation, runner-contracts.schema (mechanic.claude tuple), gitleaks near-miss, security-scan + security-scan-snapshot (2), pipeline-start-preflight-pre-push-observation, wire-dispatch-budget-hook (7), guard-dispatch-budget-checkpoint GDBC10, pipeline-state-push-anchor (3), design-approval-command-admission, design-advisory-admission-cli (2), r7-3-bound-paths, agy-session-authority (2), goldfish-antigravity-live-host, pipeline-start-preflight-enforcement (2), the Windows and WSL pins, pin-no-uninstall, pin-worktrees (AC-274), pin-draft-phase (AC-167), pin-claude-session-start | mixed | per suite, by area |
| K10 | Green alone, red only in Verify | wsl-ipc-compatibility, stop-fanout, runner-profile-migration-v3, project-authority, guard-dispatch, dispatch-policy, governance-action-artifact, dispatch-budget-binding, dispatch-record-strip-for-critic, security-scanner-diagnostics, architecture-prospective-companion, session-authority-repair; scratch-package-staging needs Verify's FD3 | Verify-only cause (load, shared state, case completion) | measured with K1h |
| — | Typed pending by D66 | MFHS002-008, MFHS023, MFHS028, MFI012, MFI013, MFMP003, CADH001, readiness-host case | assertions unchanged, counted pending | AC-212 |

## Order

1. K1 with K1h and K10 first: one deep package measures whether one shared cause (the session
   authority registry or its lock) explains the hang group and the Verify-only reds, and fixes it.
2. K2, K5, K6 and K7-prep in parallel-safe sequence (one Goldfish at a time on this checkout).
3. K3, K4, K8, K9 after.
4. Then the bundled ceremony (C15, C16, any TP-6/TP-10 drop-in, the protected content parts),
   then the final Full Verify in a fresh clone.

Each package names its owning item, so the item route admits the dispatch.
