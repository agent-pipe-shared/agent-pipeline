Source run: IC-2b full Verify, WSL clone (run verify-1791223073070-b819321af32bafc6), 37 red suites of 746
Candidate: af3dd8dc9 (triage written at dispatch HEAD c6e49a065)
Date: 2026-10-05

| suite | cause class | evidence | fix touches | protected? | fix direction |
|---|---|---|---|---|---|
| backlog-done-predicate-check | env-fresh-clone | REGRESSION: approve-announce test no longer holds (closed item predicate) | none (follows pipeline-state-approve-announce-tests) | no | Goes green once the approve-announce fixture seeds its own profile authority. |
| backlog-ledger-reconciliation-tests | fixed-since | RBL01 unexpected backlog drift (already fixed on branch) | none | no | No action. |
| backlog-state-check | fixed-since | items lack transition-ledger entry (already fixed) | none | no | No action. |
| bootstrap-source-attestation-acceptance-tests | env-fresh-clone | readiness 'hook-provisioning-required', expected 'ready' (PX0-AC-10, -17) | plugins/pipeline-core/lib/bootstrap-source-attestation-acceptance.test.mjs | no | Test-isolation defect: fixture should not depend on host git hooks; seed or stub hook state. |
| check-backlog-state-tests | fixed-since | CBS16 backlog drift (already fixed) | none | no | No action. |
| check-state-phase-consistency-tests | env-fresh-clone | submit-plan refused PROFILE-AUTHORITY-INVALID | plugins/pipeline-core/scripts/check-state-phase-consistency.test.mjs | no | Test-isolation defect: fixture must create its own profile authority, not rely on host PO profile receipt. |
| codex-isolated-critic-protected-preimage-tests | test-expectation-stale | pinned sha256 differs for agents/critic.md and templates/prompts/critic-review.md | plugins/pipeline-core/scripts/codex-isolated-critic-protected-preimage.test.mjs (pin location not verified) | no | Re-pin the two protected-preimage digests (or locate the pin source) after the deliberate critic edits. |
| codex-pretool-guard-tests | env-fresh-clone | status 'bootstrap-binding-required' for fresh /tmp fixtures (case 19 etc.) | plugins/pipeline-core/hooks/codex-pretool-guard.test.mjs | no | Test-isolation defect: fixtures should bind bootstrap themselves rather than inherit host readiness/hook state. |
| control-placement-tests | registry-or-declaration | derived controls lack claude-task-output-scope-posttool and claude-intake-prompt-capture | plugins/pipeline-core control-placement table/A1 record (file not located) | no | Add the two new hooks to the shipped control-placement catalog; hooks.json itself stays untouched. |
| critic-skip-coverage-check | env-fresh-clone | recovery index entries[0].recordPath: evidence/dispatch-record-ALF-ADOPTION-PROOF.json missing | evidence/abandoned-v3-dispatch-recovery-index.json or the untracked record | no | Referenced record is not tracked in git; track it or amend the index entry. |
| doc-contract-check | fixed-since | generated enforcement doc bytes differ (already fixed) | none | no | No action. |
| doc-contract-tests | unknown | 3 cases fail: stateful checklist, repository integration, CLI exclusion count | harness/scripts/check-doc-contracts.test.mjs or docs (unknown) | no | Reason: likely same docs drift as doc-contract-check, not re-run on current branch; rerun single file first. |
| guard-apply-patch-tests | env-fresh-clone | status 'bootstrap-binding-required' where 'architecture-design-required' expected | plugins/pipeline-core/hooks/guard-apply-patch.test.mjs | no | Test-isolation defect: fixture should not inherit host bootstrap/hook state. |
| guard-dispatch-tests | registry-or-declaration | all cases pass; VERIFY-CASE-COMPLETION-DECLARATION error, exit 1 | harness/scripts/verify.mjs and/or harness/verify-suites.json (caseCompletion declaration) | yes | Correct the suite's case-completion declaration (case IDs/count) to match the test file. |
| guard-lifecycle-ready-tests | unknown | NVA-INTAKEARGV-1 fails; no assertion text captured in log tail | plugins/pipeline-core/hooks/guard-lifecycle-ready.test.mjs (unknown) | no | Reason: log has no assertion detail; run the single file in the clone to settle. |
| hook-governance-scope-tests | registry-or-declaration | unadmitted runner wiring: claude-task-output-scope-posttool.mjs | plugins/pipeline-core/hooks hook-governance scope inventory (file not located) | no | Admit the new PostToolUse hook in the source scope inventory. |
| installed-plugin-attestation-host-tests | env-fresh-clone | IPH09 status 'hook-provisioning-required', expected 'ready' | plugins/pipeline-core/scripts/installed-plugin-attestation-host.test.mjs | no | Test-isolation defect: fixture independent of host hook installation. |
| license-contract-check | license-or-doc-artifact | 4 files lack SPDX SUL-1.0 header | plugins/pipeline-core/hooks/antigravity-bootstrap-lock.mjs; plugins/pipeline-core/lib/bound-design-line-endings.mjs; plugins/pipeline-core/lib/bound-design-line-endings.test.mjs; plugins/pipeline-core/scripts/install-snapshot-progress.test.mjs | no | Add the SPDX SUL-1.0 header to the first three lines of each file. |
| lifecycle-recovery-contract-tests | unknown | po_authority_rebind_writer_unavailable; guard-devplan blocks kickoff feature in draft | plugins/pipeline-core/hooks/guard-lifecycle-recovery-contract.test.mjs (unknown) | no | Reason: fixture lifecycle draft may be fresh-clone profile state or real defect; rerun single file. |
| measure-tofu-push-e2e-tests | env-fresh-clone | outcome onboarding-not-ready; intake consent guidance step | plugins/pipeline-core/scripts/measure-tofu-push-e2e.test.mjs | no | Likely host hook/profile state; make the e2e fixture self-provision (confidence medium). |
| nova-verify-journal-tests | unknown | ALFRED-RF1 real SIGINT: exit null !== 130 | plugins/pipeline-core/scripts/verify-journal.test.mjs (unknown) | no | Reason: SIGINT may be ignored because run was launched in background; rerun single file in foreground. |
| onboarding-init-tests | env-fresh-clone | INTAKE-GENERATE-LINE-ENDINGS-REFUSED: LINE-ENDINGS-GIT-FAILED | plugins/pipeline-core/scripts/onboarding-init.test.mjs | no | Fixture git call fails without host git config/hooks; give fixture own git identity (confidence medium). |
| pipeline-start-preflight-antigravity-hard-enforcement-tests | env-fresh-clone | status 'hook-provisioning-blocked', expected 'ready' (4 cases) | plugins/pipeline-core/scripts/pipeline-start-preflight-antigravity-hard-enforcement.test.mjs | no | Test-isolation defect: preflight fixtures must not depend on installed hooks. |
| pipeline-start-preflight-pre-push-observation-tests | env-fresh-clone | 10 'wired:' cases fail; ready path expected | plugins/pipeline-core/scripts/pipeline-start-preflight-pre-push-observation.test.mjs | no | Test-isolation defect: wired cases assume provisioned hooks; stub provisioning. |
| pipeline-start-preflight-tests | env-fresh-clone | 8 cases fail incl. identity/attestation (hook-provisioning-required) | plugins/pipeline-core/scripts/pipeline-start-preflight.test.mjs | no | Test-isolation defect: fixtures should neutralise host hook provisioning (confidence medium). |
| pipeline-state-approve-announce-tests | env-fresh-clone | submit-plan refused PROFILE-AUTHORITY-INVALID | plugins/pipeline-core/scripts/pipeline-state-approve-announce.test.mjs | no | Test-isolation defect: seed fixture's own profile authority. |
| pipeline-state-late-verify-tests | env-fresh-clone | baseline-only project could not enter implementation, exit 2 | plugins/pipeline-core/scripts/pipeline-state-late-verify.test.mjs | no | Test-isolation defect: seed fixture's own profile authority (same family). |
| pipeline-state-observer-conformance-tests | test-expectation-stale | submit-plan blocked ARCHITECTURE-DESIGN-PRD-DIGEST-STALE | plugins/pipeline-core/scripts/pipeline-state-observer-conformance.test.mjs | no | Fixture predates the architecture-design gate; give it a complete design (confidence medium). |
| pipeline-state-tests | env-fresh-clone | PS06a0 submit-plan exit 2; TypeError legacy.planApproval undefined | harness/scripts/pipeline-state.test.mjs | yes | Test-isolation defect: fixture must seed its own profile authority; TypeError is a consequence. |
| po-gate-authority-fixture-tests | env-fresh-clone | submit-plan refused PROFILE-AUTHORITY-INVALID, exit 2 not 0 | plugins/pipeline-core/lib/po-gate-authority.test.mjs | no | Test-isolation defect: seed own profile authority. |
| product-capability-inventory-tests | registry-or-declaration | capabilities[0] references missing surface hooks.json PostToolUse claude-task-output-scope | capability inventory baseline (file not located; not hooks.json) | no | Update capability inventory for the new PostToolUse hook surface. |
| project-onboarding-v3-tests | unknown | shards fail; kickoff feature lifecycle 'invalid'/draft, exit 2 | plugins/pipeline-core/lib/project-onboarding-v3.test.mjs (unknown) | no | Reason: multiple causes mixed (profile state vs lifecycle); rerun single file. |
| security-scan | security-scan | gitleaks 2 findings (stale .gitleaksignore line; model-family-host-store.test.mjs:39); semgrep scanner_error | .gitleaksignore | no | Repair stale ignore entry via gitleaks-repair-ignore; handle new fixture finding; semgrep error likely env. |
| session-cleanup-binding-tests | unknown | TypeError: reading 'candidates' of undefined (test line 1830) | plugins/pipeline-core/scripts/session-cleanup-binding.test.mjs (unknown) | no | Reason: undefined result, possibly missing session state in fresh clone; rerun single file. |
| setup-check-tests | env-fresh-clone | (a)(b)(c) preflight 'hook-provisioning-required' expected ready | plugins/pipeline-core/hooks/setup-check.test.mjs | no | Test-isolation defect: preflight cases must not depend on installed git hooks. |
| verify-case-completion-registry-tests | registry-or-declaration | VCR01 pinned counts differ (audit-pack top-level-assertions 49 vs 35) | harness/scripts/check-verify-case-completion.test.mjs and registry source (not located) | partly | Refresh pinned descriptor counts; protected only if the registry lives in harness/verify-suites.json. |
| verify-suite-append-history-check | registry-or-declaration | VSA-PRIOR-ENTRY-CHANGED at b7c66028 (reproduces on main checkout, not env) | harness/verify-suites.json and recovery record | yes | Prior registry entry altered in import commit; needs signed recovery record or restoration. |

## Counts (script: scratch/verify-probe/gen-triage.mjs)

By cause class:
- env-fresh-clone: 17
- registry-or-declaration: 6
- unknown: 6
- fixed-since: 4
- test-expectation-stale: 2
- license-or-doc-artifact: 1
- security-scan: 1

By protected status:
- no: 33
- yes: 3
- partly: 1

## Suggested slices

1. unprotected: profile-authority fixtures: pipeline-state-approve-announce, late-verify, observer-conformance, check-state-phase-consistency, po-gate-authority-fixture (+ backlog-done-predicate-check follows).
2. unprotected: hook-provisioning isolation: bootstrap-source-attestation-acceptance, installed-plugin-attestation-host, antigravity-hard-enforcement, pre-push-observation, preflight-tests, setup-check-tests.
3. unprotected: codex/bootstrap-binding fixtures: codex-pretool-guard, guard-apply-patch, measure-tofu-push-e2e, onboarding-init.
4. unprotected: new-hook declarations: control-placement, hook-governance-scope, product-capability-inventory.
5. unprotected: artifacts: license headers (4 files), .gitleaksignore/security-scan, codex preimage re-pin, critic-skip recovery-index record.
6. bundle (needs signed package): verify-suite-append-history-check (TP-13), guard-dispatch-tests declaration (TP-3/TP-13), verify-case-completion-registry (maybe TP-13), pipeline-state-tests (TP-5 file).
7. unprotected, needs single-file reruns first: unknowns: doc-contract-tests, guard-lifecycle-ready, lifecycle-recovery-contract, project-onboarding-v3, nova-verify-journal, session-cleanup-binding.
(The four fixed-since suites need no slice.)

## Matrix note

Results are WSL/Linux only; nothing was run on Windows or macOS. Likely Windows-relevant too: all env-fresh-clone rows (hook/profile state is host-dependent on every OS), the license/registry/declaration rows (OS-independent), and security-scan (scanner availability differs). nova-verify-journal SIGINT is POSIX-specific and likely behaves differently on Windows.
