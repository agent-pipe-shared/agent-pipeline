# D190 residual-finding acceptance: lifecycle slice implemented (C2)

Status: lifecycle production edit done and its five cases GREEN; authorization function, push-gate wiring and the remaining suite comparison are NOT done. Targeted delivery for the lifecycle check: green. Batch Critic, Full Verify and PO acceptance stay pending.

## Stacking

The patch is the cumulative diff against "candidate a4d1e0d4d plus the budget patch (w7-d190-critic-delta-rounds-are-not-capped.patch)". Apply order: budget patch, then this patch. `git apply --check` of this patch on a third clone (plain candidate plus budget patch): exit 0.

## Changed files (in the patch)

- plugins/pipeline-core/lib/critic-verify-lifecycle.mjs (+~50 lines): exports `residualFindingId` (sha256 of the module's existing `canonicalJson`), `CRITIC_VERIFY_RESIDUAL_LIFECYCLE_RECEIPT_SCHEMA` (v3) and `RESIDUAL_ACCEPTANCE_BASIS`; a private `residualAcceptanceFor`; `readBoundConsumedCriticReceipt` lets a failed receipt through only via that function (so record and readback share one rule); record writes v3 with `residualAcceptance {basis, mode, acceptanceSha256, findings}`; readback accepts v3, requires the key set, and refuses drift (`CVL-CRITIC-DRIFT`) when the record kind and the recomputed acceptance disagree. Passing receipts keep v1, byte for byte. Carry-forward records never take the residual path (the inner carry read passes no acceptance, so a failed receipt stays CVL-CRITIC-FAILED).
- plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs: the five RED cases of slice C1, now GREEN, one corrected (below).

Rule implemented: a failed receipt passes only when the open findings (default reader: consumed result `verdict.findings`) are non-empty, count equals `findingCount`, every severity is `minor`, the acceptance binds the receipt's commit, tree, receipt sha256 and the exact sorted `{id, severity}` list, and `verifyResidualAcceptanceFn` returns `authorized: true` with a mode. Otherwise `CVL-CRITIC-FAILED` with its unchanged text. The recorded mode is the verify function's returned mode.

## Case correction (written justification)

Case "a missing or unverified acceptance..." recorded both modes in ONE fixture. The record is immutable and now carries the mode, so the second write hit the existing `CVL-RECEIPT-COLLISION` rule (same id, different bytes). That rule is a deliberate existing binding, not something to weaken; the case now uses a fresh fixture per mode. The PO decision (both approval modes qualify) is still pinned: both modes are asserted.

## Evidence (clone, machine-written logs in the scratch driver dir, removed with it)

- RED against original code: `node plugins/pipeline-core/lib/critic-verify-lifecycle.test.mjs` exit 1, SyntaxError: no export `residualFindingId` (whole file RED).
- GREEN with edit: lifecycle suite tests 12, pass 12, fail 0, exit 0 (first run had 1 failure, the collision above).
- Revert proof: with ONLY the lifecycle production edit reverted (tests kept) the file is RED again with the same import SyntaxError, exit 1; restore proven byte-identical.
- Baseline (clone2 = candidate plus budget patch, NOT plain candidate; difference stated): lifecycle suite 7/7 pass; push-prepare 88/88 in both states.
- scripts/push-prepare.test.mjs: patched 88/88, baseline 88/88, failing-name sets both empty.
- lib/critic-verify-readiness.test.mjs: does not exist.
- session-critic-finalizer, guard-maintenance-window-kernel-closure suites and `generate-architecture-overview.mjs --check`: were started in both clones but had NOT finished at the budget checkpoint; NOT verified here. Run them next.

## Not done

- critic-verify-readiness.mjs wiring: no readiness test file exists; wiring needs the authorization function, which does not exist. Dependencies stay injectable (`readOpenFindingsFn`, `residualAcceptance`, `verifyResidualAcceptanceFn`); the readiness reader still calls `readCriticVerifyLifecycle` without them. Next slice.
- Authorization function for kind `accept-residual-critic-findings` in both approval modes (signature via the kind-generic signed-action verifier, chat via the waiver), the authorize-critical and pipeline-state wiring, the push-prepare closing sentence (~line 752) and its text pin.
- Unverified from C1 notes: whether `criticalActionSubjectSha256` accepts a new kind without edits.
- Failing-name comparison for finalizer, kernel-closure and architecture check (above).

## Kernel production files and operator flow

Production kernel file in this patch: plugins/pipeline-core/lib/critic-verify-lifecycle.mjs; the PO applies it under a Guard Maintenance Window. Flow: apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Independent Critic review stays a parent-owned batch gate.

Proposed commit message: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

## C3 slice: STOPPED at a stop condition (no production edit made, patch unchanged)

Status: C3 stopped before any case or production edit. The briefed stop condition "the subject builder refuses a new kind and the fix would live in a file outside the slice files" fired. The patch in this directory is the unchanged C2 cumulative patch (lifecycle branch plus its five cases); it was NOT regenerated, and `git apply` of budget patch then this patch onto the candidate still works (setup of C3 applied both cleanly in a fresh clone, then committed locally). No suite comparison was run in C3 (nothing changed to compare). Batch Critic, Full Verify and PO acceptance stay pending.

### Verified facts (read in a clone of the candidate plus both patches)

- Subject builder: `criticalActionSubjectSha256` in `plugins/pipeline-core/lib/critical-action-approval-request.mjs` throws unless `kind` is a member of the frozen `CRITICAL_ACTION_KINDS` list (currently push, deploy, publication, release-preflight, governance-fork-disposition, feature-package-reconcile, interruption-promotion). So it does NOT accept a new kind without an edit; this resolves the open question from C1/C2. The same list also gates `criticalActionSha256` (via `actionValid`, used by `verifySignedAction` to rebuild the intent) and the policy reader in `critical-human-proof-policy.mjs` (`requiredKinds` and waiver entries must be members).
- How a kind enters the digest: `digest({schema: "pipeline.critical-action-subject.v1", kind, candidate: {commit, tree}, subject})`, canonical JSON, so `subject` can carry `{criticReceiptSha256, findings: [{id, severity}]}` with no builder change beyond the kind list.
- What a recorded push authorization binds (`authorizeRecordedPush`, reused shape): `forCommit`, remote and destination, the threat-model file digest, then `verifySignedAction` (kind equality, action expiry, rebuilt subject digest, rebuilt intent with plan and spec sha and candidate commit and tree, Ed25519 proof against the trust-anchor set, proof digest equality), then a `criticalProofConsumption` ledger entry of that kind, then the trust-on-first-use machine-key check.
- Chat versus signature (`authorizeRecordedChatPush`): chat mode calls `criticalProofWaiverFor(anchorDir, kind)`, requires `criticalProof === null`, a recorded `criticalProofWaiver` equal to the policy waiver (mode and source) and, for mode `chat-attributed-unattested`, a `humanApproval` block of the same kind and mode; no signature, no ledger entry. Signature mode requires the proof and the ledger entry. Both verify the commit binding; chat does not verify tree or subject.
- `po-human-approval.mjs` routes only `CRITICAL_COMMAND_KINDS` (push, deploy, publication, feature-package-reconcile, release-preflight, interruption-promotion) through `prepare-critical`/`authorize-critical`; the new kind would need to be added there (that is the next slice, command surface).

### The blocker (exact change needed outside the slice files)

1. `plugins/pipeline-core/lib/critical-action-approval-request.mjs`: add `"accept-residual-critic-findings"` to `CRITICAL_ACTION_KINDS`. One list member; every consumer is an `includes()` test, so existing kinds are untouched.
2. The waiver half in chat mode also needs `project/critical-human-proof.json` (gate-strength, PO-owned) to list the kind under `requiredKinds` and, to waive it, under `waivedKinds`; that is a PO configuration step, not a patch file.

Both are outside the C3 allowed patch files (lifecycle, authorization, readiness and their existing suites), so the work stopped instead of guessing. No existing binding needed weakening; a finding list binds cleanly into `subject`.

### Not done (carry to the next slice, which needs the file above added to its scope)

- The new cases in the critical-action-authorization suite (signature valid proof, chat waiver, wrong commit/tree/receipt/finding list, tampered or missing proof, major severity refused at authorization time), RED then GREEN, and the revert proof.
- `authorizeRecordedResidualAcceptance` (and chat variant) in `critical-action-authorization.mjs`, reusing `verifySignedAction` and `criticalProofWaiverFor`; acceptance record location next to the push approval records in the state file, bound to the exact candidate.
- Default wiring of `readOpenFindingsFn`, `residualAcceptance` lookup and `verifyResidualAcceptanceFn` in `critic-verify-readiness.mjs` (still only injectable; no readiness test file exists, so cases go into the lifecycle or authorization suite).
- Suite comparisons (lifecycle, critical-action-authorization, push-prepare, po-human-approval, session-critic-finalizer, kernel-closure, architecture overview check), still owed; C2 values above stand only for lifecycle and push-prepare.
- authorize-critical and pipeline-state command surface, the push-prepare closing sentence and its pin.

## C4 slice: CHECKPOINT at the tool budget (cases written and RED, NO production edit yet)

Status: setup done (clone = candidate + budget patch + this patch; clone2 = plain candidate; a third clone for the apply check). The patch in this directory was regenerated (git diff --binary --cached of the clone against the budget-patch commit): it now ALSO carries eight new RED cases RA1..RA8 in `plugins/pipeline-core/lib/critical-action-authorization.test.mjs`. Production edits for the new kind are NOT made. Batch Critic, Full Verify and PO acceptance stay pending. The held patch must not be applied as a complete feature: the authorization suite is RED until the functions below exist.

### RED evidence (clone)
`node plugins/pipeline-core/lib/critical-action-authorization.test.mjs` exit 1: `SyntaxError: ... does not provide an export named 'authorizeRecordedChatResidualAcceptance'` (whole file RED; the 8 cases RA1..RA8 are the contract). Cases: RA1 signature authorizes exact binding; RA2 other commit/tree/receipt/finding list (one id different, or one missing) refused; RA3 wrong key, tampered signature, missing proof, unconsumed proof refused (`RESIDUAL-PROOF-NOT-CONSUMED`); RA4 major and blocker severity refused with `RESIDUAL-PROOF-SEVERITY` in both modes; RA5 chat mode via `pipeline.user.yaml` `gates.push_approval: chat` (committed in a fixture git repo) with NO `project/critical-human-proof.json` edit authorizes (`RESIDUAL-PROOF-WAIVED`, mode `chat-attributed-unattested`); RA6 chat refusals; RA7 `gates.push_approval: signature` never authorizes through the chat route or the by-mode route; RA8 push still authorizes. No existing case was edited.

### Waiver finding (read end to end in the clone, no per-project edit needed)
`criticalProofWaiverFor(dir, kind)` in `critical-human-proof-policy.mjs`: (a) a committed global `gates.human_approval: chat` waives EVERY kind with no table lookup; (b) otherwise for a kind present in the frozen table `GATE_APPROVAL_MODE_KEYS` it reads `readHumanApprovalMode(dir, {legacyKind: kind})`, which falls back to that kind's `gates.*` key (push: `push_approval`) and returns a chat waiver when it is `chat`, and fails closed (`CRITICAL-PROOF-MODE-CONFLICT`) if a policy-file waiver disagrees with a configured source; (c) a kind outside that table only gets a waiver from `waivedKinds` in `project/critical-human-proof.json`. So the new kind gets the push waiver source (D187) with the smallest change: add `"accept-residual-critic-findings": "push_approval"` to BOTH `GATE_APPROVAL_MODE_KEYS` and `GATE_APPROVAL_MODE_DEFAULTS` (default `DEFAULT_PUSH_APPROVAL_MODE`) in `critical-human-proof-policy.mjs`. No project file edit, no file outside the briefed list. Not yet applied. Note: `readGateApprovalMode(dir, kind)` consumers other than the waiver (none found for this kind) are unaffected.

### Remaining work (exact next steps)
1. `critical-action-approval-request.mjs` line 24: add `"accept-residual-critic-findings"` to `CRITICAL_ACTION_KINDS`.
2. `critical-human-proof-policy.mjs`: the two table entries above. Check `critical-human-proof-policy.test.mjs` (exists; it is protected TP-9, so the Goldfish cannot edit it: a case pinning the table or kind list, if red, is a stop item for the PO) and the suites that name `CRITICAL_ACTION_KINDS` (check-auth-gate-inventory-drift, human-guard-override, governance-event-store, guard-maintenance-window, critical-action-approval-request, po-human-approval tests; `check-auth-gate-inventory-drift` may need an inventory entry).
3. `critical-action-authorization.mjs`: export `authorizeRecordedResidualAcceptance` (signature; prefix `RESIDUAL-PROOF`, modelled on `authorizeRecordedPush`: `trustAnchorsFor`, local anchor/TOFU check, binding check on the record `state.residualAcceptance.lastAccepted` {forCommit, forTree, criticReceiptSha256, findings, criticalProof}, severity check (every finding `minor` -> else `RESIDUAL-PROOF-SEVERITY`), `verifySignedAction` with kind `accept-residual-critic-findings` and subject `{criticReceiptSha256, findings}`, ledger entry of that kind, returns `{authorized, code: "RESIDUAL-PROOF-VERIFIED", mode: "signature"}`), `authorizeRecordedChatResidualAcceptance` (modelled on `authorizeRecordedChatPush`: `criticalProofWaiverFor(anchorDir, kind)`, `criticalProof === null`, recorded waiver kind/mode/source equal, `humanApproval` of the same kind for mode `chat-attributed-unattested`, plus commit, tree, receipt and finding-list equality; returns `{authorized, code: "RESIDUAL-PROOF-WAIVED", mode}`) and `authorizeRecordedResidualAcceptanceByMode` (picks chat when the waiver is waived, otherwise signature). The cases already use exactly these names and the record shape above.
4. `critic-verify-readiness.mjs`: `inspectCriticBoundVerify` calls `readLifecycle({repoRoot, gitCommonDir, id, candidate, evidencePath, evidence})` with no deps; `readCriticVerifyLifecycle(args, deps = {})` takes `deps.residualAcceptance`, `deps.verifyResidualAcceptanceFn({acceptance, candidate, criticReceiptSha256, findings})`, `deps.readOpenFindingsFn`. Wire a default: read `project/pipeline-state.json` under `repoRoot`, take `residualAcceptance.lastAccepted` as `residualAcceptance` (mapped to `{candidate: {commit: forCommit, tree: forTree}, criticReceiptSha256, findings, ...}`), and `verifyResidualAcceptanceFn` calling `authorizeRecordedResidualAcceptanceByMode` with that state (the lifecycle expects `{authorized: true, mode}`); the default stays inert when the record is absent so the passing path is byte-identical.
5. Then: RA1..RA8 GREEN; each touched suite whole in clone and clone2 with failing-name sets from FINISHED logs; revert proof for the production edits; regenerate the patch and `git apply --check` it on the third clone (it still applies at this checkpoint: the patch was generated from the clone against its own budget-patch commit).

### Not done in C4 (unchanged scope)
authorize-critical and pipeline-state command surface, the push-prepare closing sentence and its pin. Kernel production files for the PO under a Guard Maintenance Window once done: `critic-verify-lifecycle.mjs`, `critical-action-approval-request.mjs`, `critical-action-authorization.mjs`, `critical-human-proof-policy.mjs`, `critic-verify-readiness.mjs`. Suite comparisons (lifecycle 12/12 green earlier in C2; everything else) were NOT run in C4; the plain-candidate clone2 comparison is owed. No `git apply --check` was run for the C4 patch (budget).

CONTINUATION CARD -- done: setup, fact re-verification of C3 notes (kind list gate and waiver chain hold), RA1..RA8 written and RED, waiver design chosen; remaining: steps 1-5 above; next step: apply the four production edits in a fresh clone (setup mode of the scratch driver rebuilds clone, then git apply the stacked patches), run RA cases GREEN.

### Operator flow (unchanged)

Apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Kernel production file in the patch today: `critic-verify-lifecycle.mjs`, applied by the PO under a Guard Maintenance Window. An independent Critic review stays a parent-owned batch gate.
