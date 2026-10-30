# N22: a residual acceptance reaches Critic-bound Verify (held patch, partial state)

Held patch `w7-n22-residual-acceptance-reaches-verify.patch`, built in a scratch clone at candidate cdcc81cd5. Nothing applied. Status: CHECKPOINT (budget), not complete.

## Behaviour implemented

- `approve-residual-acceptance` binds the record to the consumed Critic receipt's candidate (commit, tree), not to `gitCandidate(dir)`.
  `resolveResidualAcceptanceSubject` (po-human-approval.mjs) computes the subject digest over the same receipt candidate and returns it,
  so the approval request is built for that candidate too (writer and signing route agree).
- The record and its proof consumption entry are stored in `<git-common-dir>/agent-pipeline/critic-residual-acceptance/<criticReceiptSha256>.json`
  (0600, directory 0700, atomic rename). The tracked state file is no longer written. A proof already present in any private record gives
  `CRITICAL-PROOF-REPLAY`.
- `critic-verify-readiness.mjs` exports `residualAcceptanceRecordPath`, `writeResidualAcceptanceRecord`, `loadResidualAcceptanceDeps`
  (by receipt digest) and `loadResidualAcceptanceDepsForPacket` (by packet id). The verifier calls the unchanged authorizers with a
  state-shaped object. `inspectCriticBoundVerify` uses the loader per lifecycle receipt (new optional `residualAuthorizeFn` for tests).
- `verify-evidence-producer.mjs` passes the loaded deps at the preflight (both sites), the reverify binding check and `recordCriticVerifyLifecycle`;
  `inspectConsumedCriticEvidenceCarryForward` forwards its deps to `readBoundConsumedCriticReceipt`.

## Tests

New in critic-verify-lifecycle.test.mjs (3 cases: carry-forward to an evidence-only target plus recorder, loader inert and cross-record replay, readiness admission).
Updated in pipeline-state.test.mjs (justified by the decided behaviour): C11-a now moves HEAD away from the reviewed candidate and expects the private record bound to
the receipt candidate and an unchanged state file; C11-b/e read the private record and the replay is also refused across records; `c11Lifecycle` loads deps through the
loader. C11-c and C11-d keep their assertions. No case skipped or deleted.

## Evidence (finished logs, clone)

- RED before production edit: lifecycle test: the 3 N22 cases fail (missing exports); pipeline-state C11-a, b, d, e fail.
- GREEN in clone after change: critic-verify-lifecycle 15/15, critic-verify-lifecycle-route 13 pass / 1 skipped (pre-existing skip), pipeline-state.test.mjs exit 0.
- Patch apply-check on the plain candidate: exit 0.

## Update after the budget grant

- Revert proof done (driver revert, restored byte-equal true): without the production change the 3 N22 lifecycle cases fail and pipeline-state.test.mjs exits 1.
- First clone run of po-human-approval.test.mjs: 3 residual route cases failed (CRITIC-PACKET-UNREADABLE) because their fixture receipt carried no candidate; the fixture now carries `candidate` (one-line edit in po-human-approval.test.mjs, in the patch). Re-run (label c3) was still running at hand-back; baseline po-human-approval had `fail 0`.
- check-critic-bound-verify (6/6) and verify-evidence-producer (50/50) green in clone; baseline run of verify-evidence-producer (base2) was still running.
- Patch refreshed (36838 bytes, apply-check exit 0).

## Final status

All targeted suites green in clone and baseline: po-human-approval 189/189 both, check-critic-bound-verify 6/6 both, verify-evidence-producer 50/50 both, lifecycle 15/15, route 13 pass/1 skip, pipeline-state exit 0 both. Revert proof and patch apply-check done. No end-to-end case through verify-evidence-producer's preflight was built (its fixture is not reachable from the lifecycle-route test).

## End-to-end case (second grant)

New case in verify-evidence-producer.test.mjs: a real failed all-minor Critic packet, a registered evidence-only commit, chat mode; Verify first refuses with VEP-CVL-CRITIC-FAILED, then passes after the private acceptance is stored, and `checkCurrentCriticBoundVerify` is ok. It exposed a real defect fixed in critic-verify-lifecycle.mjs: a carry-forward (v2) lifecycle receipt that also carries `residualAcceptance` could not be read back (key set and residual drift check only knew v3). Result in clone: verify-evidence-producer 51/51, lifecycle 15/15. pipeline-state, po-human-approval and the other suites were NOT re-run after this last one-line lifecycle change; the patch was refreshed afterwards.

## Not done / not verified (earlier list; superseded by the updates above except the last four bullets)

- Baseline (clone2) run of pipeline-state and the clone run of po-human-approval, check-critic-bound-verify, verify-evidence-producer suites were started but their results were not held at hand-back. Compare logs `base1.*` and `c2.*` in the scratch directory.
- Revert proof (new cases fail without the production change) beyond the RED run above was not executed with the driver `revert` mode.
- No end-to-end case through verify-evidence-producer's preflight (not reached).
- The reverify path reads the prior lifecycle receipt (`readCriticVerifyLifecycle` before the Critic check) without residual deps; a residual-accepted receipt may still fail there. Left untouched.
- An earlier acceptance in the state file is not migrated (as decided).
- Full Verify, Critic, PO acceptance remain pending.
