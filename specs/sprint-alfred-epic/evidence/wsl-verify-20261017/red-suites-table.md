| Suite | Verify exit | Alone | tests/pass/fail/skip | First failure signature |
|---|---:|---|---|---|
| afk-activation-tests | 1 | fail-alone | 13/12/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| afk-claude-host-tests | 1 | fail-alone | 9/8/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| afk-transaction-host-tests | 1 | fail-alone | 2/0/2/0 | code: 'SDC-AUTHORITY-UNAVAILABLE', |
| agy-final-return-tests | 1 | pass-alone | 18/16/0/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| agy-session-authority-tests | 1 | fail-alone | 6/4/2/0 | AssertionError [ERR_ASSERTION]: AGY-CONSENT-ADMISSION-UNAVAILABLE |
| agy-session-dispatch-tests | 1 | fail-alone | 7/4/3/0 | AssertionError [ERR_ASSERTION]: MODEL-FAMILY-AUTHORITY-UNAVAILABLE |
| antigravity-pretool-guard-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /AGY-NATIVE-IMPLEMENTATION-CONSENT-UNAVAILABLE/. Input: |
| antigravity-topology-refresh-host-tests | 1 | pass-alone | 15/15/0/0 |  |
| architecture-baseline-tests | 1 | fail-alone | 21/20/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| architecture-decision-continuity-tests | 1 | fail-alone | 4/3/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| architecture-design-test-fixture-tests | 1 | fail-alone | 1/0/1/0 | AssertionError [ERR_ASSERTION]: {"schema":"pipeline.architecture-entry-readiness.v1","status":"blocked","root":"<tmp>","code":"ARCHITECTURE-DECISION-APPLICABILITY-BLOCKED","message |
| architecture-effective-decisions-tests | 1 | fail-alone | 12/5/7/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| architecture-entry-required-source-tests | 1 | fail-alone | 2/0/2/0 | AssertionError [ERR_ASSERTION]: {"schema":"pipeline.architecture-effective-decisions.v1","status":"advisory","area":"pipeline-core","decisions":[],"activeExceptions":[],"findings": |
| auth-gate-inventory-drift-check | 2 | check-not-rerun | null/null/null/null |  |
| auth-gate-inventory-drift-tests | 1 | fail-alone | 35/27/8/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| backlog-ledger-reconciliation-tests | 1 | fail-alone | null/null/null/null | FAIL RBL01 this repository needs no reconciliation: unexpected drift: pipeline.correction-critic-reuses-the-full-review-context, pipeline.architecture-deferral-records-no-net-new-b |
| backlog-sprint-assignment-check | 1 | check-not-rerun | null/null/null/null |  |
| backlog-state-check | 2 | check-not-rerun | null/null/null/null | FAIL backlog state: backlog/items/2026-10-12-correction-critic-reuses-the-full-review-context.md: type is not in the canonical item taxonomy |
| check-adr-consistency-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: expected exit 0, got 2; stderr: INDEX-DISAGREEMENT docs/adr/README.md:13 -- 0086-canonical-dab-windows-course-and-separate-legacy-api-checks.md has  |
| check-backlog-sprint-assignment-tests | 1 | fail-alone | 12/11/1/0 | AssertionError [ERR_ASSERTION]: expected the real backlog to carry no out-of-set sprint value; findings: ["backlog/items/2026-10-12-correction-critic-reuses-the-full-review-context |
| check-backlog-state-tests | 1 | fail-alone | null/null/null/null | FAIL CBS16 the real event 403 format and closure drift are explicitly accepted while all current drift is dispositioned: backlog/items/2026-10-12-correction-critic-reuses-the-full- |
| check-critic-skip-coverage-tests | 1 | fail-alone | 32/27/5/0 | AssertionError [ERR_ASSERTION]: evidence/dispatch-record-UNDELIVERED.json: invalid v4 dispatch record (terminal dispatch record requires at least one log entry) |
| close-coordinator-audit-lifecycle-tests | 1 | fail-alone | 8/0/8/0 | SessionCriticFinalizerError: Session Critic finalization is invalid. |
| codex-advisor-execution-tests | 1 | timeout-alone | 7/2/5/0 | AssertionError [ERR_ASSERTION]: SDC-AUTHORITY-UNAVAILABLE |
| codex-critic-host-tests | 1 | fail-alone | 137/133/4/0 | Error: review economy admission rejected: RE-DELTA-UNKNOWN-PATH |
| codex-critic-packet-host-tests | 1 | fail-alone | null/null/null/null | CriticPacketError: Critic review admission is blocked: evidence/dispatch-record-batman-codex.json: invalid v3 dispatch record (terminal dispatch record requires at least one log en |
| codex-critic-session-route-tests | 1 | fail-alone | 5/4/1/0 | code: 'SDC-AUTHORITY-UNAVAILABLE', |
| codex-design-advisor-host-tests | 1 | fail-alone | 1/0/1/0 | code: 'SDC-AUTHORITY-UNAVAILABLE', |
| codex-design-readiness-bootstrap-tests | 1 | fail-alone | 6/0/6/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| codex-design-readiness-host-store-tests | 1 | fail-alone | 6/1/5/0 | AssertionError [ERR_ASSERTION]: {"status":"unavailable","code":"CTFR-HOST-UNAVAILABLE","report":null,"receiptId":"drh_a7465165d761f34a64aad4c1d808eca4","transportCode":"host-proces |
| codex-design-readiness-host-tests | 1 | fail-alone | 10/9/1/0 | WorktreeLifecycleError: git rev-parse failed (128): fatal: not a git repository (or any parent up to mount point /) |
| codex-host-output-custody-tests | 1 | fail-alone | 12/3/9/0 | Error: ENOENT: no such file or directory, open '<tmp>' |
| codex-host-process-journal-tests | 1 | fail-alone | 6/0/6/0 | SyntaxError: Unexpected token 'export' |
| codex-isolated-critic-protected-preimage-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| codex-pretool-guard-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: {"schema":"pipeline.project-onboarding.v4","status":"bootstrap-binding-required","root":"<tmp>","runner":"codex","intent":"onboarding","repository": |
| codex-readiness-finalization-tests | 1 | fail-alone | 9/2/7/0 | AssertionError [ERR_ASSERTION]: {"status":"unavailable","code":"CTFR-HOST-UNAVAILABLE","report":null,"receiptId":"drh_716e665d0332bba351816eceb41fdd54","transportCode":"host-proces |
| codex-readiness-shared-parent-tests | 1 | fail-alone | 6/5/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| codex-session-start-hint-tests | 1 | fail-alone | 9/8/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| codex-tool-free-design-readiness-tests | 1 | fail-alone | 7/2/5/0 | AssertionError [ERR_ASSERTION]: {"status":"unavailable","code":"CTFR-HOST-UNAVAILABLE","report":null,"receiptId":"drh_d1eb15d5e79fae04e72b7fe309262aa6","transportCode":"host-proces |
| commit-msg-hook-install-tests | 1 | pass-alone | 23/23/0/0 |  |
| commit-msg-hook-signed-integration-tests | 1 | fail-alone | 9/2/7/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| consumer-safe-paths-tests | 1 | fail-alone | 9/8/1/0 | AssertionError [ERR_ASSERTION]: [ |
| continuity-result-bootstrap-tests | 1 | fail-alone | 6/1/5/0 | AssertionError [ERR_ASSERTION]: Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| continuity-result-case-migration-tests | 1 | fail-alone | 3/0/3/0 | AssertionError [ERR_ASSERTION]: Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| continuity-result-close-tests | 1 | fail-alone | 6/2/4/0 | AssertionError [ERR_ASSERTION]: Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| continuity-result-rebind-tests | 1 | fail-alone | 2/0/2/0 | AssertionError [ERR_ASSERTION]: Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| critic-dispatch-preflight-tests | 1 | fail-alone | 46/45/1/0 | ✔ CDPF039 a successful Git exit remains admissible when a contained host adds an EPERM diagnostic (93.066083ms) |
| critic-generic-batch-tests | 1 | fail-alone | 11/3/8/0 | GenericCriticBatchError: Generic Critic batch is unavailable or refused. |
| critic-skip-coverage-check | 2 | check-not-rerun | null/null/null/null | CRITIC-SKIP-COVERAGE evidence/abandoned-v3-dispatch-recovery-index.json: invalid or unauthorized abandoned-v3 recovery index (evidence/abandoned-v3-dispatch-recovery-index.json: en |
| critical-action-approval-request-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| critical-human-proof-gate-tests | 1 | fail-alone | null/null/null/null | Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| deferred-backlog-check | 2 | check-not-rerun | null/null/null/null |  |
| design-advisory-admission-cli-tests | 1 | fail-alone | 2/0/2/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| design-advisory-coordinator-v2-tests | 1 | timeout-alone | 3/1/2/0 | AssertionError [ERR_ASSERTION]: {"ok":false,"status":"recovery-required","code":"SDC-AUTHORITY-UNAVAILABLE","courseBinding":{"courseId":"dac_<hex>","initialContextSha256":"<hex>"," |
| design-approval-command-admission-tests | 1 | fail-alone | 13/12/1/0 | AssertionError [ERR_ASSERTION]: imported parser/catalogue policy for ["approve-plan","--design-approval-request","scratch/design-approval-request-<hex>.json"] |
| design-course-coordinator-tests | 1 | fail-alone | 1/0/1/0 | TypeError: Cannot read properties of undefined (reading 'status') |
| design-course-session-tests | 1 | fail-alone | 9/3/6/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| design-package-parent-metadata-false-drift-pin | 1 | fail-alone | 21/20/1/0 | Error: EACCES, Permission denied: <repo>/scratch/dwp-parent-pin-pcC795 '<repo>/scratch/dwp-parent-pin-pcC795' |
| design-workflow-package-builder-tests | 1 | timeout-alone | 3/0/3/0 | AssertionError [ERR_ASSERTION]: {"ok":false,"status":"recovery-required","code":"SDC-AUTHORITY-UNAVAILABLE","courseBinding":{"courseId":"dac_<hex>","initialContextSha256":"<hex>"," |
| design-workflow-package-route-tests | 1 | fail-alone | 15/14/1/0 | AssertionError [ERR_ASSERTION]: refusal wording must not change |
| design-workflow-package-v2-tests | 1 | timeout-alone | 2/0/2/0 | AssertionError [ERR_ASSERTION]: {"ok":false,"status":"recovery-required","code":"SDC-AUTHORITY-UNAVAILABLE","courseBinding":{"courseId":"dac_<hex>","initialContextSha256":"<hex>"," |
| dispatch-authorship-verify-tests | 1 | fail-alone | 64/57/7/0 | ✔ (b) trailer present, no record file -> FAIL record-missing (0.539315ms) |
| dispatch-policy-tests | 1 | pass-alone | 46/46/0/0 |  |
| dispatch-record-strip-for-critic-tests | 1 | pass-alone | 12/12/0/0 |  |
| doc-contract-check | 2 | check-not-rerun | null/null/null/null |  |
| doc-contract-tests | 1 | fail-alone | 76/73/3/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| gate-strength-guard-tests | 1 | fail-alone | null/null/null/null | FAIL GST21 a chat-armed capability admits the exact bound edit to a GS-1..GS-5/GS-7 path: override activation refused (CHAT-GATE-NOT-ATTENDED); a human must confirm this activation |
| gitleaks-tests | 1 | fail-alone | 23/22/1/0 | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /stale/i. Input: |
| goldfish-antigravity-live-host-tests | 1 | fail-alone | 6/5/1/0 | AssertionError [ERR_ASSERTION]: {"schema":"pipeline.agy-session-dispatch-receipt.v1","status":"rejected","code":"AGY-SESSION-NATIVE-CARRIER-UNAVAILABLE","field":"authorityLifetime" |
| governance-action-artifact-tests | 1 | pass-alone | 9/9/0/0 |  |
| governance-scope-tests | 1 | fail-alone | 26/25/1/0 | ℹ chmod(000) actual EACCES: true |
| guard-apply-patch-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value: |
| guard-devplan-tests | 1 | fail-alone | null/null/null/null | Error: [guard-devplan] implementation requires a valid design approval (DAA-PUBLIC-UNAVAILABLE). |
| guard-dispatch-budget-checkpoint-tests | 1 | fail-alone | 15/14/1/0 | AssertionError [ERR_ASSERTION]: admitted ABS:scratch/dispatch/critic-review-1/critic-notes.md |
| guard-dispatch-native-worker-tests | 1 | fail-alone | 4/2/2/0 | AssertionError [ERR_ASSERTION]: complete v2 briefing should prepare before launch: BLOCKED (guard-dispatch): SQ-AUTHORITY-UNAVAILABLE: Restore the approved feature's valid v2 slice |
| guard-dispatch-tests | 1 | fail-alone | 61/58/3/0 | AssertionError [ERR_ASSERTION]: stderr missing "DISPATCH-INCOMPLETE-BRIEFING" |
| guard-gate-strength-ledger-tests | 1 | fail-alone | 2/0/2/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| guard-git-signed-integration-tests | 1 | fail-alone | 5/0/5/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| guard-human-override-tests | 1 | fail-alone | 28/24/4/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| guard-lifecycle-ready-tests | 1 | timeout-alone | 391/362/26/3 | ✔ NVA-B-GREENFIELD-SCRATCH-CONTAINMENT-1: only ENOENT permits first creation; scratch inspection faults fail closed (98.329743ms) |
| guard-maintenance-window-kernel-closure-tests | 1 | fail-alone | null/null/null/null | FAIL GMWKC01 NEVER_LIFTABLE_KERNEL_PATHS is transitively closed under first-party relative imports: AssertionError [ERR_ASSERTION]: NEVER_LIFTABLE_KERNEL_PATHS is not transitively  |
| guard-push-architecture-tests | 1 | fail-alone | 1/0/1/0 | AssertionError [ERR_ASSERTION]: BLOCKED (guard-push feature checkpoint): signature mode requires a current approval bound to this exact commit, remote and destination. |
| guard-push-decision-reference-tests | 1 | fail-alone | null/null/null/null | FAIL  GPDR01 allow  signed push, no decisionReference on the record at all -- exit 1 (expected 0) -- stderr: [guard-push] WARN (report-only): scratch custody has 4 typed finding(s) |
| guard-push-external-ledger-tests | 1 | fail-alone | null/null/null/null | FAIL  PGXL01 allow  signed push, no gates.push_external_ledger configured at all -- exit 1 (expected 0) -- stderr: [guard-push] WARN (report-only): scratch custody has 4 typed find |
| guard-push-promotion-tests | 1 | fail-alone | 4/3/1/0 | AssertionError [ERR_ASSERTION]: Expected allow (exit 0), got 1: [guard-push] WARN (report-only): scratch custody has 4 typed finding(s) for pushed source <hex>. |
| guard-push-scratch-advisory-tests | 1 | fail-alone | null/null/null/null | FAIL  PGSA01 allow  signed push, no scratch descriptors at all -- no advisory -- exit 1 (expected 0) -- stderr: [guard-push] WARN (report-only): scratch custody has 4 typed finding |
| guard-push-tests | 1 | fail-alone | null/null/null/null | FAIL  PG09 allow  security evidence skipped when gates.security mode=off -- exit 1 (expected 0) -- stderr: [guard-push] WARN (report-only): scratch custody has 4 typed finding(s) f |
| guard-push-v2-tests | 1 | fail-alone | null/null/null/null | FAIL  PGV2-01 allow  fresh+bound+non-blocking v2 pair is a no-op alongside all-green v1 -- exit 1 (expected 0) -- stderr: [guard-push] WARN (report-only): scratch custody has 4 typ |
| guard-split-contract-tests | 1 | fail-alone | 5/4/1/0 | AssertionError [ERR_ASSERTION]: export names |
| guard-testpath-override-tests | 1 | fail-alone | null/null/null/null | FAIL OT10 an armed capability admits exactly the edit it was bound to: override activation refused (CHAT-GATE-NOT-ATTENDED); a human must confirm this activation directly, in their |
| guard-testpath-tests | 1 | pass-alone | 21/21/0/0 |  |
| hook-governance-scope-tests | 1 | fail-alone | 9/8/1/0 | AssertionError [ERR_ASSERTION]: unadmitted runner wiring: claude-task-output-scope-posttool.mjs |
| human-guard-override-capability-scan-tests | 1 | fail-alone | 3/0/3/0 | HumanGuardOverrideError: override activation refused (CHAT-GATE-NOT-ATTENDED); a human must confirm this activation directly, in their own attended terminal -- an agent's own tool  |
| human-guard-override-tests | 1 | fail-alone | 172/129/42/1 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| install-agy-tests | 1 | fail-alone | 17/15/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| interruption-receipts-tests | 1 | fail-alone | 107/106/1/0 | AssertionError [ERR_ASSERTION]: file://<repo>/plugins/pipeline-core/schemas/pipeline.design-workflow-package.v2.json:2 |
| language-canon-tests | 1 | fail-alone | 4/3/1/0 | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /When the delivery contract explicitly requires actual\nindependent PASS/. Input: |
| license-contract-check | 1 | check-not-rerun | null/null/null/null |  |
| lifecycle-denial-loop-guard-tests | 1 | fail-alone | 5/4/1/0 | AssertionError [ERR_ASSERTION]: matcher and telemetry share one inspection per guard call |
| local-worker-supervisor-cli-tests | 1 | fail-alone | 10/1/9/0 | AssertionError [ERR_ASSERTION]: {"schema":"pipeline.local-worker-supervisor-cli.v1","ok":false,"code":"LWS-UNAVAILABLE"} |
| measure-tofu-push-e2e-tests | 1 | fail-alone | 9/8/1/0 | AssertionError [ERR_ASSERTION]: { |
| model-family-approval-request-tests | 1 | fail-alone | 10/9/1/0 | AssertionError [ERR_ASSERTION]: family requests must receive their own exact disclosure and fail closed before generic HGO/GMW fallback |
| model-family-execution-tests | 1 | fail-alone | 19/18/1/0 | Error: S4 activation failed: MODEL-FAMILY-AUTHORITY-UNAVAILABLE |
| model-family-host-store-tests | 1 | fail-alone | 28/1/27/0 | AssertionError [ERR_ASSERTION]: MODEL-FAMILY-AUTHORITY-UNAVAILABLE |
| model-family-invocation-tests | 1 | fail-alone | 14/8/6/0 | WorktreeLifecycleError: git rev-parse failed (128): fatal: not a git repository (or any parent up to mount point /) |
| model-family-main-prelaunch-tests | 1 | fail-alone | 3/2/1/0 | WorktreeLifecycleError: git rev-parse failed (128): fatal: not a git repository (or any parent up to mount point /) |
| model-family-runtime-host-tests | 1 | fail-alone | 5/4/1/0 | AssertionError [ERR_ASSERTION]: MODEL-FAMILY-STATE-UNCERTAIN |
| model-role-host-store-tests | 1 | pass-alone | 8/8/0/0 |  |
| module-inventory-tests | 1 | fail-alone | 27/26/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| native-goldfish-host-state-regression-tests | 1 | fail-alone | 3/0/3/0 | AssertionError [ERR_ASSERTION]: WT-GIT-FAILED |
| native-goldfish-host-state-tests | 1 | timeout-alone | 20/20/0/0 |  |
| no-autoupdate-key-tests | 1 | fail-alone | null/null/null/null | FAIL  SCAN  .claude/settings.json binds pipeline-core@agent-pipeline to the public marketplace -- enabled=false; marketplace=null |
| notebook-write-coverage-tests | 1 | fail-alone | null/null/null/null | FAIL NB07 no write guard reads tool_input.file_path directly any more: guard-lifecycle-ready.mjs does not use the shared write-target reader |
| nova-critic-lineage-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /CRL-INVALIDATION/u. Input: |
| nova-verify-journal-tests | 1 | fail-alone | 91/88/3/0 | ✔ WSL EPERM after a zero suite exit remains successful; other error shapes stay closed (354.953161ms) |
| onboarding-continuity-tests | 1 | fail-alone | 301/262/39/0 | KickoffError: continuity current invocation required before binding |
| onboarding-init-tests | 1 | timeout-alone | 55/54/1/0 | ✔ driveOnboardingInit: accepts a completed WSL child when EPERM accompanies its zero exit status (0.519066ms) |
| passive-read-credential-follow-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: owned fixture and Git ceiling required |
| phase3-sdlc-coherence-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: schema-lite does not execute the published schema's $ref/oneOf nested event contract |
| pin-advisor-demand-reuse-has-no-design-course-bound-tests | 1 | fail-alone | 13/12/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pin-advisor-question-contract-and-final-source-binding-conflict-tests | 1 | pass-alone | 12/11/1/0 | AssertionError [ERR_ASSERTION]: design-workflow-package-v2.test.mjs |
| pin-agy-managed-copy-first-start-lacks-attestation-tests | 1 | fail-alone | 12/10/1/1 | Error: ENOENT: no such file or directory, scandir '<repo>/scratch/agy-p18-02-first-start-NyqPln/home/.gemini/agent-pipeline/installed-plugin-attestations' |
| pin-approval-bound-design-package-lives-in-an-ignored-directory-tests | 1 | fail-alone | 11/7/4/0 | AssertionError [ERR_ASSERTION]: {"ok":false,"code":"PO-PROFILE-RECEIPT-INVALID","reason":"The common PO profile receipt is missing, unsafe, noncanonical or malformed.","repair":"Ru |
| pin-claude-session-start-emits-codex-transcript-recovery-hint-tests | 1 | fail-alone | 12/11/1/0 | AssertionError [ERR_ASSERTION]: the drive-letter path detector used in A3 recognises the embedded host path |
| pin-codex-advisor-evidence-fails-after-host-update-tests | 1 | timeout-alone | 7/4/3/0 | AssertionError [ERR_ASSERTION]: SDC-AUTHORITY-UNAVAILABLE |
| pin-codex-readiness-private-receipt-omits-output-custody-tests | 1 | fail-alone | 8/7/1/0 | AssertionError [ERR_ASSERTION]: {"status":"unavailable","code":"CTFR-HOST-UNAVAILABLE","report":null,"receiptId":"drh_d0b0f7704bf4e574e3077bee3bf1e053","transportCode":"host-proces |
| pin-declared-system-skill-read-requires-human-override-tests | 1 | fail-alone | 10/4/1/5 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pin-design-approval-validator-rejects-json-key-reordering-tests | 1 | fail-alone | 6/4/2/0 | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /current, complete package/. Input: |
| pin-draft-phase-guard-blocks-mandatory-bootstrap-preflight-tests | 1 | fail-alone | 11/9/2/0 | AssertionError [ERR_ASSERTION]: case variant on a case-sensitive host must stay refused (control) |
| pin-lifecycle-read-scope-blocks-host-declared-system-skill-tests | 1 | fail-alone | 14/6/1/7 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pin-model-role-bootstrap-is-always-unavailable-on-native-windows-tests | 1 | fail-alone | 14/11/1/2 | AssertionError [ERR_ASSERTION]: MODEL-FAMILY-STATE-UNCERTAIN |
| pin-no-uninstall-path-for-a-repository-that-once-opted-in-tests | 1 | fail-alone | 29/28/1/0 | AssertionError [ERR_ASSERTION]: Missing expected exception. |
| pin-node-v24-on-windows-creates-a-real-nul-file-tests | 1 | fail-alone | 13/12/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| pin-revised-native-design-cannot-reach-a-new-advisor-course-tests | 1 | timeout-alone | 7/6/1/0 | AssertionError [ERR_ASSERTION]: {"ok":false,"status":"recovery-required","code":"SDC-AUTHORITY-UNAVAILABLE","courseBinding":{"courseId":"dac_<hex>","initialContextSha256":"<hex>"," |
| pin-verify-on-a-wsl-mnt-drive-checkout-hides-its-reason-tests | 1 | fail-alone | 8/6/1/1 | AssertionError [ERR_ASSERTION]: The input did not match the regular expression /VERIFY-JOURNAL-DIRECTORY-NOT-PRIVATE/u. Input: |
| pin-windows-greenfield-scratch-write-denied-tests | 1 | fail-alone | 12/9/2/1 | AssertionError [ERR_ASSERTION]: alias project dir, alias-spelled target |
| pin-windows-os-temp-root-dacl-fails-private-state-assurance-for-test-fixtures-tests | 1 | fail-alone | 13/4/1/8 | AssertionError [ERR_ASSERTION]: child must exit 0 (status=1): file://<repo>/[eval1]:19 |
| pipeline-start-preflight-pre-push-observation-tests | 1 | fail-alone | 28/27/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pipeline-state-discard-feature-tests | 1 | fail-alone | 11/7/4/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pipeline-state-external-push-ledger-tests | 1 | fail-alone | null/null/null/null | FAIL PSXL05 approve-push refuses with PUSH-EXTERNAL-LEDGER-TOPOLOGY-UNRESOLVED when discoverRepository cannot resolve the repository, and the success line is not reached: Assertion |
| pipeline-state-inspection-contract-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: close-feature: expected classification "valid", got "damaged" |
| pipeline-state-late-verify-tests | 1 | fail-alone | 2/1/1/0 | TypeError: Cannot read properties of undefined (reading 'map') |
| pipeline-state-lifecycle-event-tests | 1 | fail-alone | null/null/null/null | Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| pipeline-state-observer-conformance-tests | 1 | fail-alone | 14/10/4/0 | AssertionError [ERR_ASSERTION]: close-feature (design): classifyOnboardingContinuity expected status "valid", got "damaged" |
| pipeline-state-push-anchor-tests | 1 | fail-alone | 5/2/3/0 | AssertionError [ERR_ASSERTION]: the complete bundle must get past the anchor stage and be approved |
| pipeline-state-rebind-runner-tests | 1 | fail-alone | 18/4/14/0 | AssertionError [ERR_ASSERTION]: Error: State authority route unavailable (WT-GIT-FAILED); no success is reported. |
| pipeline-state-reopen-design-tests | 1 | fail-alone | 2/1/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pipeline-state-revocation-tests | 1 | fail-alone | 2/1/1/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| pipeline-state-tests | 1 | fail-alone | null/null/null/null | FAIL  PS06a-1 continuity-init exit 0 -- got 2 |
| po-human-approval-tests | 1 | fail-alone | 185/170/15/0 | ✔ 2026-08-30-po-human-approval-setup-silently-swallows-writemachineplane-error: a writeMachinePlane() failure produces a visible warning and still does not throw (4.046836ms) |
| portable-agy-authorship-export-tests | 1 | fail-alone | 5/4/1/0 | Error: terminal dispatch record requires at least one log entry |
| product-capability-inventory-tests | 1 | fail-alone | 30/26/4/0 | ✔ PCI01 HAW-A00 accepts only a status-zero Git EPERM false positive with observed output (2.494968ms) |
| project-onboarding-e2e-tests | 1 | fail-alone | 6/4/1/1 | AssertionError [ERR_ASSERTION]: DWP-PRESENT-RETIRED: use present-plan --review-receipt |
| project-onboarding-v3-tests | 1 | fail-alone | null/null/null/null | FAIL  V4 authority drift reopens the historical approval instead of rebinding it -- Expected values to be strictly equal: |
| project-uninstall-tests | 1 | pass-alone | 17/17/0/0 |  |
| push-init-tests | 1 | fail-alone | 32/31/1/0 | ✔ drivePushInit: reconciliation accepts WSL EPERM only after status zero, while non-zero and status-less results stop fail-closed (1677.804899ms) |
| push-release-flow-docs-contract-tests | 1 | fail-alone | 11/8/3/0 | AssertionError [ERR_ASSERTION]: reader-review lost required source-bound procedure: /If any covered document\s+changes,[\s\S]*restart both phases with a new round/u |
| r7-3-bound-paths-tests | 1 | fail-alone | 13/12/1/0 | AssertionError [ERR_ASSERTION]: unclassified live State fields: rigorHistory.body.planPath, planPresentation.designApprovalRequestPath |
| repair-map-tests | 1 | fail-alone | 7/6/1/0 | AssertionError [ERR_ASSERTION]: a code was added to or removed from eligibility() without updating this test's accepted-gap list |
| rigor-floor-tests | 1 | fail-alone | 16/11/5/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| runner-contracts.schema-tests | 1 | fail-alone | null/null/null/null | FAIL  committed registry is complete and exact -- mechanic.claude exact tuple |
| runner-design-readiness-bootstrap-tests | 1 | fail-alone | 8/5/3/0 | AssertionError [ERR_ASSERTION]: claude |
| runner-profile-migration-v3-tests | 1 | pass-alone | 60/60/0/0 |  |
| scoped-verify-registration-tests | 1 | fail-alone | null/null/null/null | FAIL SVR28 Verify writes only the failed scoped-registration evidence when its registered target is absent |
| scratch-package-staging-tests | 1 | fail-alone | null/null/null/null | Error: SPC controls require genuine Root-inherited FD3 |
| scripts-pipeline-state-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: present-plan must succeed for a normal submitted plan: DWP-PRESENT-RETIRED: use present-plan --review-receipt |
| security-scan | 2 | check-not-rerun | null/null/null/null |  |
| security-scan-snapshot-tests | 1 | fail-alone | 4/2/2/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly deep-equal: |
| session-cleanup-binding-tests | 1 | fail-alone | 64/25/39/0 | KickoffError: continuity current invocation required before binding |
| session-cleanup-power-tests | 1 | fail-alone | null/null/null/null | FAIL descriptor-bound cleanup accepts unavailable power as nonblocking and retires the session -- domain-ancestor-unsafe |
| session-cleanup-recovery-tests | 1 | fail-alone | 38/32/6/0 | KickoffError: continuity current invocation required before binding |
| session-critic-finalizer-tests | 1 | fail-alone | 18/2/16/0 | SessionCriticFinalizerError: Session Critic finalization is invalid. |
| session-power-controller-tests | 1 | fail-alone | null/null/null/null | SessionPowerError: controller runtime dependency overrides are unavailable |
| signed-quality-package-single-link-tests | 1 | fail-alone | 6/0/6/0 | Error: ENOENT: no such file or directory, lstat '<repo>/undefined' |
| signed-quality-package-tests | 1 | fail-alone | 43/25/18/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| signing-disclosure-sweep-tests | 1 | fail-alone | 19/18/1/0 | AssertionError [ERR_ASSERTION]: actual anchor failure precedes scratch request/describer |
| slice-queue-cli-tests | 1 | fail-alone | 14/13/1/0 | AssertionError [ERR_ASSERTION]: ["validate"] |
| spec-readiness-host-tests | 1 | fail-alone | 3/0/3/0 | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| spec-retention-check | 2 | check-not-rerun | null/null/null/null | FAIL spec retention: sprint-sentinel-epic.handoverPath must link specs/2026-07-19-sprint-sentinel-epic/prd_sentinel-epic.md |
| stop-fanout-tests | 1 | pass-alone | 24/24/0/0 |  |
| threat-model-approval-request-tests | 1 | fail-alone | null/null/null/null | WorktreeLifecycleError: git rev-parse failed (128): fatal: not a git repository (or any parent up to mount point /) |
| toolchain-preflight-tests | 1 | pass-alone | 44/44/0/0 | PASS TCP13 Git accepts only the documented status-zero EPERM false-positive, while ordinary probes retain EPERM failure |
| verify-case-completion-check | 2 | check-not-rerun | null/null/null/null |  |
| verify-case-completion-registry-tests | 1 | fail-alone | 32/31/1/0 | AssertionError [ERR_ASSERTION]: REQUIRED-VERIFY-POLICY agy-item-delivery-tests has no Verify caseCompletion policy |
| verify-evidence-producer-tests | 1 | fail-alone | 34/29/5/0 | SessionCriticFinalizerError: Session Critic finalization is invalid. |
| verify-suite-append-history-check | 1 | check-not-rerun | null/null/null/null |  |
| verify-suite-registration-check | 2 | check-not-rerun | null/null/null/null |  |
| verify-suite-registration-tests | 1 | fail-alone | null/null/null/null | AssertionError [ERR_ASSERTION]: UNCATEGORIZED-VERIFY-SURFACE "administrative-commit-policy-tests": add "verify-phase:harness/scripts/verify.mjs:administrative-commit-policy-tests"  |
| windows-private-state-tests | 1 | pass-alone | 16/12/0/4 | ✔ WPS008 accepts only the documented completed WSL EPERM shape (0.459733ms) |
| wire-dispatch-budget-hook-tests | 1 | fail-alone | 17/10/7/0 | Error: anchor not found (test): the file does not contain the expected text. Nothing was written. |
| worktree-lifecycle-tests | 1 | fail-alone | null/null/null/null | PASS D0-WSPAWN runGit accepts WSL EPERM only after status zero and keeps non-zero or missing status closed |
| worktree-target-binding-tests | 1 | fail-alone | 5/3/2/0 | AssertionError [ERR_ASSERTION]: target CWD must use target evidence |
