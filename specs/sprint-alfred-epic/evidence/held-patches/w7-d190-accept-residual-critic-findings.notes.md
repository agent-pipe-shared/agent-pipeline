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
authorize-critical and pipeline-state command surface, the push-prepare closing sentence and its pin. Kernel production files for the PO under a Guard Maintenance Window once done: `critic-verify-lifecycle.mjs`, `critical-action-approval-request.mjs`, `critical-action-authorization.mjs`, `critical-human-proof-policy.mjs`, `critic-verify-readiness.mjs`. Suite comparisons (lifecycle 12/12 green earlier in C2; everything else) were NOT run in C4; the plain-candidate clone2 comparison is owed.
CONTINUATION CARD -- done: setup, fact re-verification of C3 notes (kind list gate and waiver chain hold), RA1..RA8 written and RED, waiver design chosen; remaining: steps 1-5 above; next step: apply the four production edits in a fresh clone (setup mode of the scratch driver rebuilds clone, then git apply the stacked patches), run RA cases GREEN.

### Operator flow (unchanged)

Apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Kernel production file in the patch today: `critic-verify-lifecycle.mjs`, applied by the PO under a Guard Maintenance Window. An independent Critic review stays a parent-owned batch gate.

## C5 slice: production edits made, RA1..RA8 GREEN, two suites RED (pins outside scope), checkpoint at the budget

Status: targeted delivery for the eight authorization cases and the five lifecycle cases: green. Not complete as a feature: two suites are red because they pin the kind list and are outside the briefed files (below). Batch Critic, Full Verify and PO acceptance stay pending.

### Changed (cumulative patch, regenerated: 7 files, +421/-9; `git apply --check` of the stack on a third clone of candidate plus budget patch: exit 0)
- critical-action-approval-request.mjs: member `accept-residual-critic-findings` added to `CRITICAL_ACTION_KINDS` (+1).
- critical-human-proof-policy.mjs: `accept-residual-critic-findings: push_approval` in `GATE_APPROVAL_MODE_KEYS` and `DEFAULT_PUSH_APPROVAL_MODE` in `GATE_APPROVAL_MODE_DEFAULTS` (+2). No project file edit.
- critical-action-authorization.mjs (+123): exports `authorizeRecordedResidualAcceptance` (prefix RESIDUAL-PROOF, record `state.residualAcceptance.lastAccepted`, trust anchors, binding on commit, tree, receipt and sorted `{id, severity}` list, `verifySignedAction`, ledger entry, TOFU pin; major or blocker refused with `RESIDUAL-PROOF-SEVERITY` first), `authorizeRecordedChatResidualAcceptance` (`criticalProofWaiverFor`, same bindings, waiver and attribution block) and `authorizeRecordedResidualAcceptanceByMode`. Design note: the per-kind chat waiver for this kind carries mode `chat`; the function maps it to `chat-attributed-unattested` and always requires a `humanApproval` block (the RA5 contract), so a residual acceptance is always an attribution record.
- critic-verify-readiness.mjs (+27): inert-by-default `residualAcceptanceDeps` reads `project/pipeline-state.json` under `repoRoot`; only when `residualAcceptance.lastAccepted` is bound to the candidate does it pass `{residualAcceptance, verifyResidualAcceptanceFn}` (calling the by-mode function) as the second argument to the lifecycle reader; otherwise the call is byte-identical to before. `readOpenFindingsFn` keeps the lifecycle default.

### Evidence (clone, finished logs; logs live in the removed scratch dir)
- `critical-action-authorization.test.mjs`: RED first (missing export, whole file); after edits exit 0, 49/49 checks, RA1..RA8 all ok. One own-error was fixed on the way (RA5: waiver mode `chat` vs recorded mode; mapping above).
- `critic-verify-lifecycle.test.mjs`: tests 12, pass 12, fail 0 (run once with the first production edits, readiness wiring was added afterwards and this suite was NOT re-run).
- `critical-human-proof-policy.test.mjs` (read only): 35 passed, 0 failed, so the table entry breaks no pin there; no PO edit needed for it.
- `guard-maintenance-window-kernel-closure.test.mjs`: 11 passed, 0 failed (run before the readiness import edit landed in the same clone state? it ran after all four edits; yes after).
- RED: `critical-action-approval-request.test.mjs` exit 1, `assert.deepEqual` at line 37 pins the exact `CRITICAL_ACTION_KINDS` list; the only difference is the new last member. Exact fix: append `"accept-residual-critic-findings"` to the expected array in that test (file is not protected TP but is outside the briefed files).
- RED: `harness/scripts/check-auth-gate-inventory-drift.test.mjs` exit 1, case "the real repository state passes clean today"; cause NOT diagnosed (budget). Likely the same kind-list or inventory entry; read its log first next time. It was not compared with clone2.

### NOT done
- Revert proof for this slice's production edits (RA cases RED without them): not run; the earlier RED-against-original run (missing export) stands as the only RED evidence.
- Clone2 (plain candidate) comparison of failing-name sets: not run for any suite; push-prepare, po-human-approval, session-critic-finalizer suites, the readiness-wired path, `generate-architecture-overview.mjs --check`, and a re-run of the lifecycle suite after the readiness edit are open.
- Pin updates: the approval-request test above and the drift case (diagnose first).
- authorize-critical and pipeline-state command surface, the push-prepare closing sentence and its pin.
- Kernel production files for the PO under a Guard Maintenance Window: critic-verify-lifecycle.mjs, critical-action-approval-request.mjs, critical-action-authorization.mjs, critical-human-proof-policy.mjs, critic-verify-readiness.mjs. Operator flow: apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Independent Critic review stays a parent-owned batch gate.

Proposed commit message unchanged: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

CONTINUATION CARD -- done: four production edits, RA1..RA8 and lifecycle cases green, stacked patch regenerated and apply-checked; remaining: pin update in the approval-request test and the drift case diagnosis (briefing must add those files), re-run lifecycle and readiness path, revert proof, clone2 comparison, remaining suites; next step: rebuild clone with setup, apply the patch stack, read the drift test log first.

## C6 slice: pins and verification done; ONE stop item (drift case needs a docs file outside the allowed list)

Status: targeted delivery green for lifecycle and authorization; NOT complete as a feature: `harness/scripts/check-auth-gate-inventory-drift.test.mjs` case "the real repository state passes clean today" stays RED with this patch (stop condition: file outside allowed list). Batch Critic, Full Verify and PO acceptance stay pending.

### Changed in this slice (patch regenerated: 8 files, +422/-10; `git apply --check` on a clone of candidate plus budget patch: exit 0)
- plugins/pipeline-core/lib/critical-action-approval-request.test.mjs line 37: `"accept-residual-critic-findings"` appended as the new LAST member of the expected array in the `CRITICAL_ACTION_KINDS` deepEqual. Deliberate pin change tied to the new kind, not a weakening (the check title still says "seven members"; left unchanged on purpose, rename is the PO's call). The file is not in the protected list (TP-1..TP-13) of the agent-obligations protected paths.

### Pin two: baseline comparison and diagnosis
- Baseline: the drift suite is GREEN (35/35) in clone2 (plain candidate) and clone3 (budget patch only). It is RED only with the acceptance patch, so it is not a baseline red.
- Failure text: `AUTH-GATE-UNDOCUMENTED accept-residual-critic-findings (discovered in plugins/pipeline-core/lib/critical-action-approval-request.mjs / plugins/pipeline-core/scripts/po-human-approval.mjs kind family) is not acknowledged in docs/human-authorization-inventory.md`.
- Exact change needed (PO or a dispatch whose scope includes it): `docs/human-authorization-inventory.md` needs an acknowledgement of the new kind: a row with an `<!-- inventory-id: ... -->` marker modelled on the `interruption-promotion` row (line ~45), the kind added to the enumerated `CRITICAL_ACTION_KINDS` list in the `critical-action-family` row (line ~46), and, if the check then demands it, a disposition row in the table at line ~132 (`interruption-promotion | legacy-renderer`) plus the terminal catalog entry. The doc was not edited; the exact set of required rows is found by re-running the drift suite after each addition.

### GREEN (clone, finished logs)
- critic-verify-lifecycle: tests 12, pass 12, fail 0 (after the readiness edit).
- critical-action-authorization: 49/49 checks passed (RA1..RA8 included).
- critical-action-approval-request: 7 tests passed (with the pin).
- critical-human-proof-policy (read only): 35 passed, 0 failed.
- push-prepare: 88/88. po-human-approval: 185/185. session-critic-finalizer: 90/90. guard-maintenance-window-kernel-closure: 11 passed, 0 failed (no kernel path added to its expectations; the suite did not demand it). generate-architecture-overview --check: exit 0.
- Failing-name sets: clone (patched) = {the drift case above}; clone3 (budget patch) = empty; clone2 (plain candidate) = empty. Same suite list, finished logs.

### Revert proof
With the four production files (approval-request, human-proof-policy, authorization, readiness) restored to the budget-patch state and every test kept, `critical-action-authorization.test.mjs` exits 1: `SyntaxError: The requested module './critical-action-authorization.mjs' does not provide an export named 'authorizeRecordedChatResidualAcceptance'` (whole file RED, so RA1..RA8 cannot pass). Restore proof: after copying the files back, the same suite exits 0 (49/49).

### NOT done
- Drift-case fix (docs file above).
- authorize-critical and pipeline-state command surface; push-prepare closing sentence and its pin.
- Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

### Kernel production files and operator flow
Kernel production files the PO applies under a Guard Maintenance Window: critic-verify-lifecycle.mjs, critical-action-approval-request.mjs, critical-action-authorization.mjs, critical-human-proof-policy.mjs, critic-verify-readiness.mjs. Flow: apply-diff the budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Do not apply this patch without the docs acknowledgement above, or the drift suite stays red.

Proposed commit message unchanged: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

CONTINUATION CARD -- done: pins, comparisons, revert proof, patch; remaining: docs/human-authorization-inventory.md acknowledgement (scope must add it), command surface, push-prepare sentence; next step: setup clones, apply the stack, add the doc rows, re-run the drift suite.

## C7 slice: inventory rows added, drift suite STILL RED on a second out-of-list file; command surface and push-prepare sentence NOT done (checkpoint at the budget)

Status: partial. Batch Critic, Full Verify and PO acceptance stay pending. Patch regenerated: 9 files, +425/-11; `git apply --check` on a clone of candidate plus budget patch (committed): exit 0. docs/human-authorization-inventory.md is not a protected path (agent-obligations section 2).

### Changed in this slice (docs/human-authorization-inventory.md, in the patch)
- New row `accept-residual-critic-findings` with the inventory-id marker, placed before the `critical-action-family` row.
- Kind added to the enumerated `CRITICAL_ACTION_KINDS` list in the `critical-action-family` row.
- Disposition row `accept-residual-critic-findings | legacy-renderer | -` after the `interruption-promotion` row.

### STOP item 1 (drift suite still RED)
After the docs edits the AUTH-GATE-UNDOCUMENTED finding is gone; the remaining finding (finished log, twice) is `AUTH-GATE-TERMINAL-CATALOG-MISSING accept-residual-critic-findings`. The drift check reads `plugins/pipeline-core/templates/human-terminal-actions/catalog.json` (parsed by `plugins/pipeline-core/lib/human-terminal-action-catalog.mjs`): it needs an entry for inventoryId `accept-residual-critic-findings` whose disposition and templateId match the docs disposition row (`legacy-renderer`, no template). That file is outside the allowed list: the next slice must add it to scope and model the entry on the `interruption-promotion` entry. If an entry is added, keep the disposition row; if not, the drift suite stays red.

### Findings that shape the command surface (not implemented)
- `CRITICAL_COMMAND_KINDS` is at po-human-approval.mjs line ~1026; the USAGE text (line ~70) lists the kinds too, and `criticalApprovalRequest` builds the request for them.
- The signature route of `authorizeRecordedResidualAcceptance` verifies a record at `state.residualAcceptance.lastAccepted` plus a `criticalProofConsumption` ledger entry. The existing writers for that shape live in pipeline-state.mjs (`approve-push`, about lines 12287-12550, with a mutation-catalog/entry frame) and are large. po-human-approval.mjs itself writes no repository state. A residual-acceptance writer (computing the finding list from the consumed Critic receipt via `residualFindingId` and the open-findings reader, refusing any non-minor finding) therefore needs a new pipeline-state subcommand or a decision on where the state write happens: a design question for the next slice, not guessed here.

### NOT done
- Terminal catalog entry (stop item 1), po-human-approval kind and cases, pipeline-state printing, writer for `state.residualAcceptance.lastAccepted`.
- push-prepare closing sentence: target is the first remedy string at push-prepare.mjs line ~752 (the `private-critic-binding-unavailable` branch); the pinning case is the test at push-prepare.test.mjs line ~818 (append a `assert.match` for `accept-residual-critic-findings` and `CCA-REVIEW-BUDGET-EXHAUSTED`; neither file is protected). Not started.
- Suite comparison in this slice: only the drift suite was run (clone: RED as above; baseline clone2/clone3 GREEN 35/35 per C6). Other suites unchanged since C6 (the docs edit cannot affect them) and were not re-run. Revert proof for this slice: none (no production code edited).
- Independent Critic review (parent-owned batch gate), Full Verify, PO acceptance.

### Kernel production files and operator flow
Unchanged: critic-verify-lifecycle.mjs, critical-action-approval-request.mjs, critical-action-authorization.mjs, critical-human-proof-policy.mjs, critic-verify-readiness.mjs under a Guard Maintenance Window. Flow: apply-diff budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install. Do not apply without the catalog entry or the drift suite stays red.

Proposed commit message unchanged: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

CONTINUATION CARD -- done: docs inventory rows, patch regenerated and apply-checked; remaining: catalog.json entry (scope), po-human-approval kind plus state writer plus cases, pipeline-state printing, push-prepare sentence plus case; next step: add catalog.json, push-prepare.mjs/.test.mjs, po-human-approval.mjs/.test.mjs, pipeline-state.mjs to scope, set up clones with the stack, add the catalog entry modelled on interruption-promotion, rerun the drift suite.

## C8 slice: orientation only, NO production or test edit made, patch unchanged (checkpoint at the budget)

Status: no progress on the deliverable beyond reconnaissance. The patch file is byte-identical to the C7 patch (not regenerated). Nothing was run GREEN or RED; no suite comparison, no revert proof. Batch Critic, Full Verify and PO acceptance stay pending.

### Findings that shape the next slice (verified by reading the candidate plus budget plus acceptance stack in a scratch clone)
- Catalog entry: model exactly on the `interruption-promotion` entry of `plugins/pipeline-core/templates/human-terminal-actions/catalog.json` (fields: id, inventoryId, revision 1, purpose, audience "user", disposition "legacy-renderer", templateId null, builderId null, producerRefs, boundary/mutation/requiresPoApproval/slots/expectedReadback/runners/platforms all null). Insert before the `critical-action-family` entry. Suggested producerRef: `plugins/pipeline-core/scripts/pipeline-state.mjs#approve-residual-acceptance`. No companion file was identified yet; the drift suite run will tell.
- Existing suite for pipeline-state: `plugins/pipeline-core/scripts/pipeline-state.test.mjs` (NOT protected; the protected pattern TP-5 is `harness/scripts/pipeline-state.test.mjs`, which must not be touched). It is a flat script of braced blocks using helpers `freshFixture()`, `mktempProjectDir()`, `capturedStderr()`, `run([...], deps)` with `deps = { dir, now, gitHead, gitCandidate }`; chat mode is set by a committed `pipeline.user.yaml` with `gates.push_approval: chat` (or `human_approval: chat`); signature cases build `createCriticalActionApprovalRequest` + an Ed25519 proof (see the first block near line 134). Other suites that enumerate subcommands and may need the new name: `pipeline-state-approve-push-argv-closure.test.mjs`, and anything reading `PIPELINE_STATE_COMMANDS` (pipeline-state.mjs line ~740).
- Writer wiring: a subcommand that is NOT in `STATE_AUTHORITY_ENTRIES` (pipeline-state.mjs line ~13413) runs through the legacy `runStateSource` route (as `approve-deploy` does), so no state-authority frame is needed. Add `"approve-residual-acceptance"` to `PIPELINE_STATE_COMMANDS` and a `case "approve-residual-acceptance":` next to `case "approve-push":` (line ~12287). `approve-push` itself has a special push frame (`frame.push`, lines ~13494, ~13627, ~14001); do not copy that part.
- Structure to copy from approve-push (lines ~12287-12557): `criticalProofWaiverFor(dir, kind)` for the mode, `parseExactFlags` with `by` (+ `critic-packet`, and `proof-request/proof-authority/proof` in signature mode), `gitHead`/`gitCandidate`, `verifyCriticalHumanProof({ dir, state: base, kind, candidate, subject: { criticReceiptSha256, findings }, flags, now, required: true })`, the `criticalProofConsumption` replay check and ledger append (`kind: "accept-residual-critic-findings"`), then `writeState(dir, { ...base, schema: SCHEMA_ID, residualAcceptance: { lastAccepted: record }, criticalProofConsumption, updatedAt }, base)`.
- Required small production edit: `verifyCriticalHumanProof` (line ~4752) demands the kind be in `policy.requiredKinds` unless it is in `ALWAYS_REQUIRED_KINDS` (line ~4750, currently only `feature-package-reconcile`); `project/critical-human-proof.json` may not be edited, so add `"accept-residual-critic-findings"` to `ALWAYS_REQUIRED_KINDS`. Chat mode returns waived before that check.
- Record shape to write (from `authorizeRecordedResidualAcceptance` / `...Chat...` in critical-action-authorization.mjs): `{ approvedBy, approvedAt, forCommit, forTree, criticReceiptSha256, findings: [{id, severity}] sorted by id, criticProof: verified.proof (null in chat), criticProofWaiver: verified.waived (when waived), humanApproval: chatAttributionRecord({ kind, by }) (chat only) }`. The lifecycle reader additionally takes `acceptance.candidate` and `acceptance.mode` (see `residualAcceptanceFor` in critic-verify-lifecycle.mjs); confirm the field names against the RA cases in critic-verify-lifecycle.test.mjs (`residualSetup`, line ~73) before writing the record, because the verifier calls require `candidate`, `criticReceiptSha256` and `findings`.
- Finding list computation: use `readConsumedCandidateReceipt` and `readConsumedCandidateResult` from `plugins/pipeline-core/scripts/critic-packet-preflight.mjs` (control root `<git common dir>/agent-pipeline/critic-packets`, packet id from a `--critic-packet` flag), `criticReceiptSha256 = sha256(canonicalJson(receipt))`, findings = `residualFindingId(finding)` plus severity over `result.verdict.findings`; refuse non-minor with the RESIDUAL-PROOF-SEVERITY text and write nothing. For the test, inject the reader through `deps` (a legacy-route subcommand accepts extra deps) instead of building a real consumed packet journal.
- Printing next to `authorize-critical` (about line 4570 area): not inspected, still open.

### NOT done (everything of the C8 briefing)
Catalog entry, drift suite, writer, new pipeline-state cases (RED then GREEN), ALWAYS_REQUIRED_KINDS edit, suite comparison across clone, clone2, clone3, revert proof, regenerated patch. Also still open from C7: po-human-approval kind routing for prepare-critical and authorize-critical, push-prepare closing sentence with its case. Independent Critic review stays a parent-owned batch gate.

### Kernel production files and operator flow
Unchanged from C7. Flow: apply-diff the budget patch, then this patch; `git add -u` with a path limit; commit as the PO; stamp; install.

Proposed commit message unchanged: feat(critic): let the PO accept residual minor findings through the configured approval mode so the push gate can qualify the candidate

CONTINUATION CARD -- done: setup driver (scratch only, cleaned up), reading of catalog, approve-push, authorization functions, lifecycle reader and the existing suite helpers; remaining: all of the C8 briefing; next step: re-run a driver setup (clone, clone2, clone3 at the candidate, budget patch in clone and clone3, acceptance patch in clone), write the pipeline-state cases first and run them RED, then catalog entry, ALWAYS_REQUIRED_KINDS edit and the writer, then the suite comparison and the patch, within a larger tool budget (suggest 60).

## C9 slice: setup done and design refined, NO production or test edit made, patch unchanged (checkpoint at the budget)

Status: the setup driver worked (clone and clone3 at the candidate, budget patch in both, base commit of the budget state plus the acceptance patch in clone, all git apply exit 0). The budget went into reading; no case was written, nothing RED or GREEN, patch file byte-identical to C7. Clones were left in place under scratch/ (untracked) for the next slice, with the driver at scratch/agent-out/w7ar9/driver.mjs (modes setup, run LABEL files, patch [install], cleanup; patch mode diffs the clone against its local base commit and apply-checks in clone3).

### Additional verified facts for the writer (beyond C8)
- Gitless common dir: use the existing `defaultGitCommonDir(dir)` helper of pipeline-state.mjs (line ~3136, returns {ok, path}); control root is `<path>/agent-pipeline/critic-packets`. Receipt reader: `readConsumedCandidateReceipt({controlRoot, packetId})` returns {packet, receipt}; `criticReceiptSha256 = sha256(canonicalJson(receipt))` using canonicalJson/sha256 exported by critic-packet-preflight.mjs (this equals `bytesSha256(canonicalJson(critic))` in critic-verify-lifecycle.mjs line 109). Open findings: `readConsumedCandidateResult(...).result.verdict.findings`; id = `residualFindingId(finding)` (critic-verify-lifecycle.mjs).
- `criticalHumanProofPolicy` maps the kind to `gates.push_approval` already (critical-human-proof-policy.mjs lines 48-55 in the stack), so `criticalProofWaiverFor(dir, "accept-residual-critic-findings")` follows the push setting.
- MODE NORMALISATION REQUIRED: `authorizeRecordedChatResidualAcceptance` demands `approval.criticalProofWaiver.mode === "chat-attributed-unattested"` and `humanApproval.mode === "chat-attributed-unattested"`, while an action-local `gates.push_approval: chat` yields `verified.waived.mode === "chat"`. The writer must therefore store `criticalProofWaiver: { ...verified.waived, mode: "chat-attributed-unattested" }` for that case, and `humanApproval: chatAttributionRecord({kind, by})` (check it yields that mode). Chat mode must also keep the attended-terminal boundary: use `isAttendedTerminal` / `requireAttendedChatGateConfirmation` from lib/chat-gate-ceremony.mjs (tests inject `isattyFn: () => true`, `readLineFn`); the approve-push challenge flow (pendingPushChallenge, lines ~12388-12431) is push-specific and should not be copied.
- RECORD FIELDS the lifecycle reader and the authorizer need together: authorizer reads `forCommit`, `forTree`, `criticReceiptSha256`, `findings`, `criticalProof`, `criticalProofWaiver`, `humanApproval`; the lifecycle fragment (`residualAcceptanceFor`) reads `acceptance.candidate {commit, tree}`, `acceptance.criticReceiptSha256`, `acceptance.findings`, `acceptance.mode` via `verifyResidualAcceptanceFn`. The stored record should carry BOTH `forCommit/forTree` and `candidate: {commit, tree}` plus `schema: "pipeline.critic-residual-acceptance.v1"` and `mode`; the reader passes the stored record as `deps.residualAcceptance` (see `residualSetup` in critic-verify-lifecycle.test.mjs line 73 for the shape).
- Template for the simplest consumption-ledger writer: `defaultFeaturePackageReconcileApproval` (pipeline-state.mjs line ~9205) is shorter than the approve-push case and shows the exact replay check, ledger append and `writeState` shape; the signature path also needs `ALWAYS_REQUIRED_KINDS` (line 4750) extended.
- Test pattern: signature case = block at pipeline-state.test.mjs lines 134-156 (generateKeyPairSync, createCriticalActionApprovalRequest with action kind "accept-residual-critic-findings" and `subjectSha256 = criticalActionSubjectSha256({kind, candidate, subject: {criticReceiptSha256, findings}})`); chat pattern = lines 167-260 but with the attended seam only; inject the receipt reader through `deps` (the writer must read it from a deps field such as `deps.readConsumedCandidateReceiptFn` / `readOpenFindingsFn`, mirroring the lifecycle names).
- Guard grammar note for the next slice: `cd X && rg` chains are refused (cd is not an admitted segment); address clone paths directly; `rg -A/-B` flags are refused, use Read with offset instead.

### NOT done
Everything in steps 1-4 of the C9 briefing: new pipeline-state cases (RED/GREEN), ALWAYS_REQUIRED_KINDS edit, subcommand and case, catalog entry, drift suite, enumerating-suite runs, failing-name comparison, regenerated patch. Still open from C7: po-human-approval kind routing, pipeline-state printing, push-prepare closing sentence. Batch Critic, Full Verify and PO acceptance stay pending.

CONTINUATION CARD -- done: setup (clone and clone3 exist under scratch/agent-out/w7ar9/ with the driver) and full design reading; remaining: all of steps 1-4; next step: write the five pipeline-state cases in clone first and run them RED via the driver (run mode), then the production edits following the facts above, then the drift suite, the enumerating suites, the clone vs clone3 failing-name comparison and `driver patch install`, with a budget of at least 60 tool uses and no further orientation.
