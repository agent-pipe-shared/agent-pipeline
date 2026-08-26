# Critic review - P-AC-08 / F3 fix verification (head 3fdf8b9f)

Requested route: claude-opus-5 at max. Effective model identity: unknown (no direct same-dispatch route evidence observed).
T1 assurance: functional-equivalent-read-only; OS isolation not asserted.
Bootstrap check passed: ruleset ce50d74d16fdbcd0b9f8b3b606297e88af3d2f139b3cd14b692f4ea15599b023 loaded - Project agent-pipeline-shared_phoenix - Calibration sprint-phoenix-epic - State n/a (Critic sees no history) - Role Critic

Note on wording: this report refers to the GS-1-protected user gate-config file descriptively rather than by filename, because the shell guard refuses any command naming it. No attempt was made to assemble that name at runtime.

VERDICT: FAIL

Prior finding F3 IS genuinely closed: run() with deps={} reaches runFeaturePackageWriteCommand, which supplies defaultFeaturePackageReconcileApproval via Object.hasOwn (pipeline-state.mjs:5921-5936). RGi/RGi-2 prove a real, non-injected, genuinely signed Ed25519 approval gates a real manifest rewrite. Verified independently: 490/490 cases pass at HEAD 3fdf8b9f.

## 1. Findings

### F-A (major) - this range leaves a registered guard suite RED
Gap: c6bd3a6b replaced the direct gates.push_approval property read with a computed value?.gates?.[key] lookup in critical-human-proof-policy.mjs, breaking the source-text pin OT09 that asserts the approval mode is read from the GS-1-protected user gate-config file. Five further commits shipped without fixing it.
Risk: the verify gate is red on a security-guard suite, and the pin now asserts nothing true, so a future refactor moving the read to an agent-writable source would be caught only by chance. The runtime invariant itself still holds (OT15-OT19 pass). Severity: major.
Evidence: plugins/pipeline-core/hooks/guard-testpath-override.test.mjs:213 asserts /gates\?\.push_approval/u; independently reproduced at HEAD 3fdf8b9f -> "guard-testpath-override: 18 passed, 1 failed"; evidence/verify-latest.json step guard-testpath-override-tests exitCode 1.
Spec-ref: spec.md:690 (Full Verify passes on the exact integrated candidate); test-integrity.

### F-B (major) - the verified approval is discarded: no consumption ledger, no attribution record, no commit binding in chat mode
Gap: defaultFeaturePackageReconcileApproval verifies the proof and then returns only {ok:true}, throwing away verified.proof, verified.waived and --by. Neither the reconcile receipt nor the journal carries any approval field.
Risk: (1) the same signed proof can be presented repeatedly for its whole expiresAt window - no CRITICAL-PROOF-REPLAY equivalent exists; (2) no durable evidence that a human approved a given reconcile; (3) in chat mode verifyCriticalHumanProof returns before any candidate check, so --by <anything> suffices and nothing is commit-bound or labelled. Severity: major.
Evidence: pipeline-state.mjs:5917 (return verified.ok ? { ok: true } : ...); receipt at 5820-5828 and journal at 5786-5790 carry no approval field; contrast approve-push at 6567 and 6554-6576 (approvalRecord plus criticalProofConsumption replay refusal), which pipeline-state.mjs:5877-5879 explicitly claims to mirror; chat short-circuit at pipeline-state.mjs:2734.
Spec-ref: P-AC-08 (exact preview, authority class, candidate/evidence binding, transactional writer, readback); ADR-0056 Follow-up 2026-08-11 (same mode shape, same fail-closed rules); CLAUDE.md push policy (still commit-bound and still labelled in the record).

### F-C (major) - production change with no traceable dispatched author, bundled into another package
Gap: 55e60f67 carries the staleReceipt/casOutcome production hunk in runAuthorityRevisionRecoverCommand. Its trailer names PHX-WP-PAC08-RECONCILE-APPROVAL, but that record explicitly disclaims authorship, and PHX-WP-PX0-CASOUTCOME covers only the test commit 433e73db and states "No other file touched". No dispatch record in the evidence set claims this production change.
Risk: an unattributable production behaviour change (CLI casOutcome now reports stale instead of applied) inside a commit whose subject describes approval wiring; reverting the P-AC-08 work also reverts an unrelated fix. Not caught by CI. Severity: major.
Evidence: pipeline-state.mjs:3694-3709; PHX-WP-PAC08-RECONCILE-APPROVAL.dispatch-record.json report section 3 ("not authored by this dispatch"); PHX-WP-PX0-CASOUTCOME/dispatch-record.json:12; check-dispatch-provenance.mjs:76-78 validates trailer shape only.
Spec-ref: EL-01/EL-16 authorship; CLAUDE.md hard rule (small, atomic commits - one concern per commit, per work package).

### F-D (minor) - trailer task IDs cite a dispatch with no record
Gap: 433e73db, 0d9f3690 and 3fdf8b9f all carry "Dispatch: PHX-GMW-TP5-TESTS (goldfish)", but no dispatch record with that taskId exists in the evidence set.
Risk: trailer-to-record traceability is reconstructible only from record prose. Not CI-enforced. Severity: minor.
Evidence: git show trailers for the three commits; evidence records are PHX-WP-PX0-CASOUTCOME (taskId PHX-WP-PX0-CASOUTCOME) and PHX-WP-PX0-V1JOURNAL-TESTS (taskId PHX-WP-PX0-V1JOURNAL-TESTS).
Spec-ref: EL-16 authorship evidence.

## 2. Deliberately not flagged
1 Spec fidelity: F3 closed; P-AC-08 now has a named test in the gate-registered pipeline-state-tests suite. 2 Scope: file list matches ADR-0056 Follow-up (the one out-of-scope hunk is F-C). 3 Trajectory: see section 3. 4 Test integrity: no test weakened, deleted, skipped or made tolerant; RGi-RGn use a genuine generateKeyPairSync/sign keypair and a real verifyCriticalHumanProof call, not a stub; RGk/RGl/RGm/RGn are real refusal and scoping regressions. 5 Edge cases: fail-closed on unparsed flags, absent state, unavailable candidate, pending journal, readback mismatch - all verified. 6 Guardrails: no secret, no absolute path, no forbidden file edited. 7 Security: gates.reconcile_approval absent from the committed user gate-config file yields the strongest default (signature) - nothing weakened, so not a finding. 8 Documented-instead-of-fixed: none new. 9 Dependencies: no new package, action or image. 10 Language: all new artifacts English per ADR-0011.
Dropped candidates: GATE_APPROVAL_MODE_KEYS prototype-chain lookup for a non-literal kind (unreachable, still fail-closed); readReconcileApprovalMode exported but unused; repoRoot and schema passed to the closure and ignored; other red verify steps not attributable to this range.

## 3. Trajectory check
consistent. Every checkable claim reproduced exactly: 490/490 at HEAD 3fdf8b9f matches the record claim; the record disclosed the OT09 failure as a bare fact and it reproduced exactly. Limitation, not an inconsistency: evidence/verify-latest.json does not cover the reviewed candidate - start ddffcb63, finish 0d9f3690, binding drift, verifyRun.status failed, exitCode 1 - so it does not establish the spec.md:690 bar for 3fdf8b9f.

## 4. Briefing violations observed
1 Contaminated dispatch (directed hunt list): Phase A item 4 supplied a claims-to-verify list naming internals the Critic did not construct itself, and item 1 added a hypothesis. templates/prompts/critic-review.md:36-53 forbids exactly this. I hunted my own surface; F-A, F-C and F-D lie outside the directed list.
2 Re-run instruction contrary to CLAUDE.md (evidence reaches the Critic as artifact paths, not commands to re-run). Executed anyway because it was decisive.
3 Prior-verdict leakage: PAC08-F3-findings-registry.md:3 carries the prior verdict FAIL; the fix-verification contract admits only the neutral finding IDs.
4 T1 lane vs write grant: the dispatch asserts the strict-no-write functional-equivalent lane while granting a repository write for this report. Write capability confirmed present. Disclosed as a residual host limitation; no other write and no mutating command was issued.
Disclosures: auto-injected CLAUDE.md, a parent-session git status and commit snapshot (not used; HEAD confirmed independently as 3fdf8b9f), and the user memory index. A fresh scratchpad subdirectory could NOT be created - GUARD-CROSS-REPO-MUTATION refuses writes outside the project root - so CR-06-D repository-external persistence was unavailable; no pre-existing scratch state was consumed. The Advisor was NOT invoked, per the dispatch MP-26 line, verified as a canonical template field at templates/prompts/critic-review.md:152. The mid-task coordinator message corrected the persistence mechanism only and is not contamination.

## 5. Verdict
FAIL. F3 itself is closed, but F-A leaves a registered guard suite red at the reviewed head against spec.md:690, and F-B leaves the PO-bound approval neither recorded nor consumed against P-AC-08 binding and authority requirements.
