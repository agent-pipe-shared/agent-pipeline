# W8-D216A preflight read-only admission closure (D216 option A, D219): held patch notes

Dispatch W8-D216A-PREFLIGHT-READ-ONLY-ADMISSION-CLOSURE-20261031, candidate a8c3497c7 (clone base cb5990c71 = stacked Candidate 14).
Patch: `w8-d216a-preflight-read-only-admission-closure.patch` (25 files, apply-check exit 0 on the candidate). Targeted delivery: green
for the three owned suites; the 13-suite sweep (clone c1 vs base1) is Coordinator-run; Critic, Verify and PO acceptance stay pending.

## Result

- Preflight import closure (`closure-each.mjs <clone> 3 scripts/critic-dispatch-preflight.mjs`): 38 modules, 0 violators (candidate: 362 / 132).
- Clone, label c3: `hooks/guard-gate-strength.test.mjs` 41 passed 0 failed (GST33 and GST33b PASS, rule unedited);
  `scripts/critic-dispatch-preflight.test.mjs` tests 86 pass 86; `scripts/check-critic-skip-coverage.test.mjs` tests 61 pass 61.
- Revert proof: the import pin (CDPF079) was recorded RED against the original code before the first production edit (run red1: exit 1,
  only that case failed). A second revert run was deliberately not made because the Coordinator's sweep was reading the same clone.

## Moved symbols (old file imports and re-exports them under the same names)

- `scripts/check-critic-skip-coverage.mjs` -> `lib/review-admission-read.mjs`: DEFAULT_ROOT, LEGACY_RECONCILE_SCHEMA,
  DEFAULT_LEGACY_RECONCILE_INDEX_PATH, ABANDONED_V3_RECOVERY_INDEX_SCHEMA, DEFAULT_ABANDONED_V3_RECOVERY_INDEX_PATH,
  readAbandonedV3RecoveryIndex, readLegacyDispatchReconcileIndex, criticAddendumBindingFinding, verifyCriticDispositionAddendumForRecord,
  readCommitChangedPaths, walkDispatchRecords, evaluateRepositoryCriticSkipCoverage, evaluateReviewAdmission (+ internal helpers). The script keeps
  createLocalDispatchEvidenceBinding, evaluateSignedQualityImportReviewAdmission, observeHistoricalFreshReviewTargetAuthority, the CLI.
- `lib/historical-fresh-review-admission.mjs` -> `review-admission-read`: readHistoricalFreshReviewAdmission, historicalFreshReviewPacketBinding,
  historicalFreshReviewCaptureFacts, readHistoricalFreshReviewApproval, revalidateHistoricalFreshReviewPacketBinding, and the shared
  handle store (`handles`, makeHandle, live) so there is one WeakMap. The source-composition self-hash now also lists review-admission-read,
  po-human-approval-read, critical-human-proof-policy-read, po-gate-authority-read (stored inventories drift once; inherent to the edit).
- `lib/signed-quality-package.mjs` -> `review-admission-read`: verifyQualityPackageIntegrationPostCommit and its readers (internals renamed sqp*).
- `lib/critic-verify-lifecycle.mjs` -> `review-admission-read`: readBoundConsumedCriticReceipt, residualFindingId, RESIDUAL_ACCEPTANCE_BASIS (internals renamed cvl*).
- `lib/portable-agy-authorship-export.mjs` -> `review-admission-read`: readPortableAgyAuthorshipExport, verifyPortableAgyAuthorshipExport,
  portableAgyAuthorshipExportPath, portableAgyAuthorshipIntent and the schema constants (internals renamed agy*).
- `lib/critical-human-proof-policy.mjs` -> `critical-human-proof-policy-read`: readHumanApprovalMode, readCriticalHumanProofPolicy,
  criticalProofWaiverFor, verifyAgainstTrustAnchors, isWellFormedEd25519PublicKey and constants.
- `lib/project-authority.mjs` -> `project-authority-read`: resolveAuthorityArtifactPath, resolveProjectAuthorityPaths, readProjectAuthority, layer constants.
- `lib/po-gate-authority.mjs` -> `po-gate-authority-read`: nearly the whole validator (validatePoGateAuthorityForRepository, validatePoGateAuthority,
  derivePoGateRepositoryFingerprint, topology and receipt readers); the old module keeps createPoGateProfileReceipt and validatePoGateProfileForRepository.
- `scripts/po-human-approval.mjs` -> `po-human-approval-read`: resolvePoKeyDirectory.
- `scripts/critic-packet-preflight.mjs` -> `critic-packet-preflight-read`: canonicalJson, sha256, packetDigestMatches, readConsumedCandidateReceipt/Result/Snapshot,
  readConsumedSessionAdmission, normalizedPacketView, CriticPacketError and the schema constants.
- `scripts/session-critic-finalizer.mjs` -> `session-critic-finalizer-read`: validateSessionCriticReceipt, SessionCriticFinalizerError, receipt constants.
- `lib/critical-action-authorization.mjs` -> `critical-action-authorization-read`: authorizeRecordedResidualAcceptance(+ByMode), authorizeRecordedChatResidualAcceptance and helpers.
- `lib/critic-verify-readiness.mjs` -> `critic-verify-readiness-read`: loadResidualAcceptanceDeps(+ForPacket), residualAcceptanceRecordPath.
- Callers: `scripts/critic-dispatch-preflight.mjs` now imports evaluateReviewAdmission, criticCoverageAdvisory, listUncoveredCriticRecords from the read module;
  every other caller keeps importing the old modules, which re-export. Not split (not reached by the read path): agy-host-observed-store, native-goldfish-host-state, worktree-lifecycle.

## Behavior notes and deviations

1. First-use trust-anchor pin: the signature route of the residual acceptance pinned the signer into the trust policy inside the verdict path (a write).
   The read half takes an optional `pinTrustAnchor` hook; the old module wraps both entry points and passes its own pin, so write-capable callers behave as before.
   A read-only preflight no longer pins; the verdict never depended on the pin.
2. po-gate-authority hardened read: `openSync` + fstat replaced by lstat, `readFileSync(path, {flag: O_RDONLY | O_NOFOLLOW})`, lstat, refusing on any
   change of dev, ino, mode, size or mtime (decision 4). Descriptor pinning is the only difference; the swap case is CDPF086.
3. Every read half names no write API (also not in comments).

## Copies of code from modules outside the write scope (follow-up debt: become imports once those modules are split)

| Copy lives in | Original (out of scope) | Pinned by |
|---|---|---|
| po-human-approval-read | lib/machine-plane.mjs readMachinePlane, validateMachinePlane, resolveLocalOperatorKeyAnchor and helpers | CDPF080 |
| critic-packet-preflight-read | lib/critic-diagnostic-packet.mjs validateDiagnosticBundleShape | CDPF081 |
| review-admission-read | scripts/dispatch-record-write.mjs coverage advisory readers | CDPF082 |
| review-admission-read | lib/agy-host-commit-admission.mjs agyHostGitEnvironment | CDPF083 |
| po-gate-authority-read | lib/plan-approval-device-rebind.mjs readers, lib/private-boundary.mjs read path, lib/plan-spec-state-v2.mjs canonicalJson/sha256CanonicalJson | CDPF084 |

Each pin (in `critic-dispatch-preflight.test.mjs`) compares the copy's source (comments stripped, documented renames undone) with the original and runs both on one fixed input.
Other new cases: CDPF079 import pin; CDPF085 read half has no pin and the old module wraps with its pin (structural plus identical verdict on invalid input; the pinning
behavior itself stays covered by lib/critical-action-authorization.test.mjs, which this dispatch did not run); CDPF086 swap and symlink refusal;
check-critic-skip-coverage.test.mjs: re-export identity case (same bindings as the read module).
A defect found on the way: the reachability tool skipped a constant used only through a spread, so `RECEIPT_DIRECTORY` was first missing from the device-rebind copy (the
reader swallows errors and would have returned null); fixed, pinned by CDPF084, and a spread check over all changed modules finds no other missing name.

## For the PO rebaseline: new modules

lib/review-admission-read.mjs, lib/critical-human-proof-policy-read.mjs, lib/project-authority-read.mjs, lib/po-gate-authority-read.mjs,
lib/po-human-approval-read.mjs, lib/critic-packet-preflight-read.mjs, lib/session-critic-finalizer-read.mjs,
lib/critical-action-authorization-read.mjs, lib/critic-verify-readiness-read.mjs. No new test file (cases added to two registered files).

## Coordinator sweep and fixes (2026-10-31, after the Goldfish returned)

Sweep of 13 downstream suites, edited clone against the plain baseline clone, failing-name sets compared: no new red in close-coordinator (38/38), critic-packet-preflight (18/18),
dispatch-record-write (40/40), session-critic-finalizer (91/91), project-authority (38/38), po-human-approval (191/191 after the fix below), po-gate-authority (72 checks), critical-action-authorization,
critical-human-proof-policy, worktree-lifecycle, native-goldfish-host-state (64/64), critic-verify-lifecycle (17/17). Two reds appeared in the first sweep and were fixed by the Coordinator in the clone:
1. `lib/review-admission-read.mjs`: the copy of the portable Agy export reader had a blind rename `sha256` -> `agySha256` that also hit the digest algorithm name and the `sha256` key of the approval
   intent (`Digest method not supported`; three `po-human-approval` cases red). Restored the algorithm name and the key; the function name stays `agySha256`.
2. VCR01 (`check-verify-case-completion.test.mjs`): the preflight suite now declares 86 cases (CDPF001..086) and 352 top-level assertions. The case-completion augmentation of
   `critic-dispatch-preflight-tests` was extended to the 86 case ids (built with the augmentation builder, base policy untouched), and the pinned count moved 331 -> 352.
Both files are part of this patch. After the fixes: check-verify-case-completion 32/32, augmentation 19/19, augmentation policy 8/8, preflight 86/86, coverage 61/61, GST33 and GST33b green (41/0).
Not run: the revert proof after the final edits (the import pin CDPF079 was recorded RED on the original code by the Goldfish).

## Open

- Nothing blocking in the clone. Whether the whole candidate is green is only established by a Full Verify of the applied tree (PO decision: none before the new version).
