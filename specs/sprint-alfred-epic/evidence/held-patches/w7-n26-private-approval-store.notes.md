# W7 N26 / D206 -- private approval store (held patch notes, cumulative patch, slice 2)

Patch: `w7-n26-private-approval-store.patch` (cumulative: slice 1 production change + slice 1 tests + this slice's restated cases, N26-h and the regenerated vendored doc; built in the prepared clone against the candidate; `git apply --check` on the plain clone: exit 0). The slice-1 patch under the same file name is SUPERSEDED by this cumulative patch; slice-1 checkpoint notes are folded into the sections below. Nothing committed; Critic, full Verify and PO acceptance stay pending (parent-owned).

## What the patch does

- ONE owner of the record format and of every read/write: a block in `lib/critical-action-authorization.mjs` (`writeCriticalApproval`, `readLastPrivateApproval`, `readPrivateCriticalConsumption`, `isCriticalProofConsumedPrivately`, `withPrivateCriticalApprovals`, `resolveCriticalApprovalCommonDir`, `criticalApprovalStoreRoot`). Store: `<git common dir>/agent-pipeline/critical-approvals/{approvals/<kind>/<approvedAtMs>-<digest16>.json, consumed/<proofSha256>.json}`; dirs 0700, files 0600, markers exclusive (`wx`), approval record via exclusive temp + rename. Record bound to kind, forCommit and (push) remote + destination.
- Readers never open files: they call `withPrivateCriticalApprovals(state, projectDir)` (private record wins; legacy tracked record is the fallback; legacy consumption list merged).
- Writers: `approve-push` and `defaultFeaturePackageReconcileApproval` (exported for the test). Neither writes the tracked state file. Replay: legacy tracked list, private marker and (before any write) the external ledger are all refused.
- The module is hosted in `critical-action-authorization.mjs` because the write scope names no new file (pure relocation to `lib/critical-approval-store.mjs` later).

## Readers / writers and the test that pins each

| Site | Change | Pinned by |
| --- | --- | --- |
| `pipeline-state.mjs` approve-push | writes private; replay legacy + private + external pre-check | N26-a, c, d, e; PSXL03/04 (restated); C14 (restated); K52-1 (restated); proof-gate (restated); PSDR01/02 (restated); PSG04/05 (restated) |
| `pipeline-state.mjs` reconcile approval closure | writes private; shared replay | N26-f |
| `pipeline-state.mjs` inspect (`inspectPushApproval`) | overlay | inspect suite 26/26 |
| `pipeline-state.mjs` residual-acceptance replay check (`runApproveResidualAcceptance`) | also refuses a proof consumed privately | N26-h (new, this slice) |
| `lib/critical-action-authorization.mjs` `authorizeRecordedPush`, `authorizeRecordedChatPush` | overlay at entry | N26-b |
| `lib/checkpoint-push-approval.mjs` `checkCheckpointPushApproval` | overlay at entry | N26-b |
| `hooks/guard-push.mjs` `attestedMainPublication` and general (c) | overlay after state parse | guard-push suites (same failing set as baseline, see below) |
| generated pre-push hook (`pre-push-hook-install.mjs`) | imports the shared overlay | `pre-push-hook-install.test.mjs` 45/45 |
| `push-prepare.mjs` | `--close` exits 0 for reason `clean`; fold kept for a legacy pending tracked record | N26-g; `push-prepare.test.mjs` 88/88 |
| `docs/push-release-flow.md` and vendored `plugins/pipeline-core/docs/push-release-flow.md` | D206 text | `push-release-flow-docs-contract.test.mjs` 11/11; `generate-vendored-canon.test.mjs` 8/8; `check-doc-contracts.test.mjs` 76/76 |

### Restated existing cases (slice 2; QG-04: each names its old and new intent in a comment in the test)

Common shape: the approval and the consumption are read through the store owner (`withPrivateCriticalApprovals`, plus `isCriticalProofConsumedPrivately` / `resolveCriticalApprovalCommonDir` in the ledger suite), never by opening store files; the tracked state file stays byte-identical; `git status` stays clean where the fixture is committed; replay stays refused. The suites import the owner dynamically with an identity fallback so that against a build without the store they still load and fail on their assertions, not at link time.

| Case | Old intent | New intent |
| --- | --- | --- |
| `critical-human-proof-gate.test.mjs` (approve-push block) | record, `criticalProofConsumption` length 1 and `before !== after` read from the tracked file | tracked file byte-identical to `before` (also after the refused replay); record bound to commit/remote/threat model and consumption length 1 read through the owner; replay still exit 2 |
| `pipeline-state-push-anchor.test.mjs` K52-1 | approval read from the tracked state | tracked file holds no approval; approval bound to the candidate read through the owner |
| `pipeline-state-push-anchor.test.mjs` K52-2 (four tamper cases) | no approval in the tracked state | same, now read through the owner (strictly stronger; they were vacuous after D206) |
| `guard-push-checkpoint-approval.test.mjs` C14 (title updated; the old title is referenced nowhere else, rg-checked) | real writer leaves exactly ` M project/pipeline-state.json` with `pendingAuditWrite: true`, read by the classifier as the one tolerated entry | porcelain empty, tracked bytes unchanged, approval and consumption (length 1) read through the owner, no `pendingAuditWrite` on the private record, classifier reads the real porcelain as clean (the tolerated ` M` shape stays pinned by the other C cases that fabricate it) |
| `pipeline-state-gate-action-event.test.mjs` PSG04 | push approval in the tracked state after the plain call path | read through the owner; tracked file has no `pushApproval`; porcelain empty (global chat mode, no challenge, takes no tracked write) |
| `pipeline-state-gate-action-event.test.mjs` PSG05 | durable approval in the tracked state although the event readback failed | read through the owner; refusal text names the private recording |
| `pipeline-state-decision-reference.test.mjs` PSDR01 | record keys incl. `pendingAuditWrite`, from the tracked state | same keys minus `pendingAuditWrite` (nothing in the tree to fold), via the owner; tracked file carries no approval |
| PSDR02 | `decisionReference` read from the tracked state | read through the owner |
| PSDR03-07 | tracked state holds no approval | no approval exists anywhere (owner overlay) |
| `pipeline-state-external-push-ledger.test.mjs` PSXL03 | "the local write already happened" after the external ledger refused | STRICTER: the external-ledger replay is refused BEFORE any write; no approval, no private marker, tracked file untouched |
| PSXL04 | local tracked approval present when the ledger append fails | approval present in the private store (owner), tracked file untouched, marker consumed, and a retry of the same proof is `CRITICAL-PROOF-REPLAY` (fail closed) |
| `pipeline-state.test.mjs` N26-h (new) | -- | a residual-acceptance proof consumed ONLY in the private approval store (residual store empty) is refused `CRITICAL-PROOF-REPLAY`, zero mutation |

## Evidence (finished logs, scratch; exact commands are `driver.mjs run LABEL FILE...`)

- Clone (`c6`, `c7`, `c8`) vs baseline (`base6`), same file lists: failing-name sets IDENTICAL. Pre-existing reds only: `guard-push.test` (PG30, D4a, D4b, D4c), `guard-push-external-ledger` (PGXL01/02/04), `guard-push-decision-reference` (GPDR01/02) -- all `verify-evidence-not-exact-green`; `harness/scripts/pipeline-state.test.mjs` TypeError at its line 1252.
- GREEN in clone on final test bytes: critical-human-proof-gate (20 assertions passed), push-anchor 10/10, guard-push-checkpoint-approval 43 passed 0 failed, gate-action-event 8/8, decision-reference 11 passed 0 failed, external-push-ledger 5/5, `scripts/pipeline-state.test.mjs` exit 0 (N26 a..h complete), push-prepare 88/88, pre-push-hook-install 45/45, push-release-flow-docs-contract 11/11, pipeline-state-inspect 26/26, chat-catalogue-repair 1/1, attestation-diagnostics 4/4, critical-action-authorization 49/49, -chat 3/3, checkpoint-push-approval 41/41, generate-vendored-canon 8/8. The six restated suites were re-run (`c7`) after the final import form; `scripts/pipeline-state.test.mjs` re-run (`c8`) after the mutation proof.
- Revert proof (`driver.mjs revert`, production files back to the candidate, restored byte-equal: true): proof-gate, K52-1, C14, PSG04, PSG05, PSDR01, PSXL03, PSXL04 each fail on a D206 assertion ("tracked state file must not receive the approval", porcelain/`pendingAuditWrite`/classifier problems in C14); N26-a, c..h fail. PSDR02 and PSDR03-07 do not fail on the old code by design (legacy-fallback read; zero-mutation refusals unchanged). N26-h fails at revert only because the owner functions are absent, so it was additionally proven with a one-clause mutation (`mut1`): with the private-store clause of the residual replay check removed, N26-h alone fails (`0 !== 2`); clause restored, `c8` green.
- Patch: 15 files, `git apply --check` on the plain clone exit 0; no machine-specific path inside.

## Downstream sweep

- Real `approve-push` callers/readers of the tracked record checked: `push-init.test` 32/32, `pipeline-state-approve-push-argv-closure.test` 3/3, `feature-branch-push-admitted-without-signature-approval` pin 16/16, `design-course-command-admission.test`, `rebind-approval.test` all exit 0 in the clone. `measure-tofu-push-e2e.test` (1 red) and `three-runner-happy-path-with-two-po-approvals` pin (3 red) fail identically on baseline (`base6s`): pre-existing, unrelated.
- Unaffected, with reason: `lib/onboarding-continuity.test.mjs` (~5437) and the feature-branch pin (~161) FABRICATE a legacy tracked record (reader-fallback path, honoured by the overlay; N26-e pins it); vendored `docs/operating-model.md` (line ~230, a prohibition on using mutable `pushApproval` as authority), `docs/adr/0056-push-approval-mode.md` (~143, historical rationale for the committed anchor) and `templates/prompts/goldfish-task.md` (~105, names the inspect output field) only name the field. `nova-candidate-freeze.mjs` and `onboarding-continuity.mjs` tolerate a tracked approval transition that no longer occurs; `human-guard-override.mjs` ~1869 effect text names `pushApproval.lastApproved` (text only, out of scope).
- The action-local chat ceremony (`pendingPushChallenge` present) still writes the tracked record and `pendingAuditWrite` by design (Source-owned state-push authority checks that write); cases on that route keep their tracked assertions.

## Open

1. Critic, full Verify and PO acceptance: parent-owned, pending.
2. Optional relocation of the store block to its own lib module (needs a write scope naming a new file; no registration needed for test files, none were added).
