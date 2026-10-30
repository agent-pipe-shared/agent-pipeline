# W7 N26 / D206 -- private approval store (held patch notes, CHECKPOINT state)

Patch: `w7-n26-private-approval-store.patch` (built in the prepared clone against the candidate; `git apply --check` on the plain clone: exit 0). Status: partial, budget checkpoint. NOT all targeted checks are green (see "Open"). Nothing committed.

## What the patch does

- ONE owner of the record format and of every read/write: a new block in `lib/critical-action-authorization.mjs` (`writeCriticalApproval`, `readLastPrivateApproval`, `readPrivateCriticalConsumption`, `isCriticalProofConsumedPrivately`, `withPrivateCriticalApprovals`, `resolveCriticalApprovalCommonDir`, `criticalApprovalStoreRoot`). Store: `<git common dir>/agent-pipeline/critical-approvals/{approvals/<kind>/<approvedAtMs>-<digest16>.json, consumed/<proofSha256>.json}`; dirs 0700, files 0600, markers exclusive (`wx`), approval record via exclusive temp + rename. Record is bound to kind, forCommit and (push) remote + destination; an envelope that disagrees with the record inside it is ignored.
- Readers never open files: they call `withPrivateCriticalApprovals(state, projectDir)` (returns the same object when nothing private exists; private record wins; legacy tracked record is the fallback and the legacy consumption list is merged).
- Writers: `approve-push` (pipeline-state.mjs) and `defaultFeaturePackageReconcileApproval` (now exported, for the test). Neither writes the tracked state file any more (no `updatedAt` bump). Replay: legacy tracked list, private marker, and (new, before any write) the external ledger are all refused.

## Readers / writers and the test that pins each

| Site | Change | Pinned by |
| --- | --- | --- |
| `pipeline-state.mjs` approve-push | writes private; replay legacy+private+external pre-check | N26-a, N26-c, N26-d, N26-e |
| `pipeline-state.mjs` reconcile approval closure | writes private; shared replay | N26-f |
| `pipeline-state.mjs` inspect (`inspectPushApproval`) | overlay | existing inspect suite green in clone |
| `pipeline-state.mjs` residual replay check | also refuses a proof consumed privately | not separately pinned (open) |
| `lib/critical-action-authorization.mjs` `authorizeRecordedPush`, `authorizeRecordedChatPush` | overlay at entry (covers ledger NOT-CONSUMED check) | N26-b |
| `lib/checkpoint-push-approval.mjs` `checkCheckpointPushApproval` | overlay at entry (serves guard + hook checkpoint lane) | N26-b |
| `hooks/guard-push.mjs` `attestedMainPublication` and general (c) | overlay after state parse (also feeds the external-ledger proof digest read) | existing guard-push suites with legacy fixtures (open: run result pending) |
| generated pre-push hook (`pre-push-hook-install.mjs` renderImpl) | imports the shared overlay, applies it before the general-mode approval read; refresh path unchanged (lib tree digest changes with this patch, so `assessHookCurrentness` reports updateRequired) | `pre-push-hook-install.test.mjs` 45/45 green in clone |
| `push-prepare.mjs` | comments only; fold kept for a legacy pending tracked record | `push-prepare.test.mjs` 88/88 green in clone |
| `docs/push-release-flow.md` | D206 text, fold marked legacy | `push-release-flow-docs-contract.test.mjs` 11/11 green in clone |

Unaffected (reason): `pipeline-state.mjs` ~13992 / ~14272 (`statePushObservation`, `statePushAfterWrite`) observe the action-local chat ceremony's tracked write; that ceremony (a `pendingPushChallenge` present in tracked state) still writes the tracked record AND the private record, because the Source-owned state-push authority checks that exact write. `nova-candidate-freeze.mjs` and `onboarding-continuity.mjs` tolerate a tracked approval transition that no longer occurs (benign). `human-guard-override.mjs` ~1869 effect text names `pushApproval.lastApproved` (text only, out of scope).

## Evidence in hand

- RED (before wiring, via `driver.mjs revert` against candidate production bytes): N26-a, N26-c, N26-d, N26-e, N26-f fail (log `revert.pipeline-state.test.mjs.log`); N26-c fails at "a reset of the tracked file must not reopen the replay" (the original defect).
- Clone, finished logs (`c1*.log`): push-prepare 88/88, pre-push-hook-install 45/45, push-release-flow-docs-contract 11/11, inspect 26/26, chat-catalogue-repair 1/1, attestation-diagnostics 4/4 green.
- Baseline (clone2, `base1x*.log`): guard-push-decision-reference GPDR01/02 red and `harness/scripts/pipeline-state.test.mjs` red (TypeError at line 1252) BEFORE the patch -- pre-existing, same failing names in the clone.

## Update after grant 1 (second checkpoint)

- Re-run of `scripts/pipeline-state.test.mjs` (log `c2.*`): everything green except N26-f, which failed only because my test passed the subcommand name inside argv (closure re-parses flags only: `CRITICAL-PROOF-FLAGS-BY-REQUIRED`). Fixed in the test; N26-a..e were green in that run.
- Patch changed: with `--action-event-out`, `approve-push` now still consults the injectable `deps.physicalStateReadback` (refuses `PS-STATE-POSTIMAGE-READBACK`) before reading the private record back -- aimed at PSG05. The patch was regenerated after both edits.
- READ after the above (run `c3`): `scripts/pipeline-state.test.mjs` exit 0 = N26-a..f GREEN with the restated cases (the in-run `fatal: ambiguous argument 'HEAD'` lines are existing fixtures' stderr, exit 0). `pipeline-state-gate-action-event`: PSG05 now reaches `PS-STATE-POSTIMAGE-READBACK` with no event and fails ONLY at its final assertion that the TRACKED state holds `pushApproval.lastApproved` (test line 174); PSG04 fails only at its tracked-record assertion (line 156). Both are old-behaviour pins in a suite outside the write scope: restate to read through `withPrivateCriticalApprovals`.
- Pending at hand-off (results NOT read): `base1.*.log` (clone2: guard-push, guard-push-external-ledger, guard-push-checkpoint-approval, push-anchor, proof-gate).
- hooks/lib group in clone (`c1.*`): critical-action-authorization 49/49, -chat 3/3, checkpoint-push-approval 41/41 green. guard-push.test (PG30, D4a-c ...) and guard-push-external-ledger (PGXL01/02/04) show `verify-evidence-not-exact-green` refusals -- the same cause as the baseline GPDR01/02 red, so very likely pre-existing; base1 comparison pending. guard-push-checkpoint-approval: 42/43, the single red is C14 ("the real approve-push writer leaves exactly ` M project/pipeline-state.json`", reads the tracked record) -- an old-behaviour pin in a suite outside the write scope; add it to the out-of-scope restatement list below.

## Update after grant 2 (third checkpoint)

- Baseline comparison (clone2, `base1.*.log`, read): guard-push.test fails the SAME names as in the clone (PG30, D4a-c ... all `verify-evidence-not-exact-green`) and guard-push-external-ledger fails the same PGXL01/02/04 -- both pre-existing, not caused by the patch. On baseline these are GREEN and in the clone RED, i.e. caused by the patch (old pins of the tracked write, suites outside scope): guard-push-checkpoint-approval C14, pipeline-state-push-anchor K52-1, critical-human-proof-gate lines 52-58.
- Revert proof on final production bytes (`revert.pipeline-state.test.mjs.log`): N26-a, N26-c, N26-d, N26-e, N26-f fail without the production change; restored byte-equal true. (Run started before N26-g existed.)
- New dead end found by the follow-up-path sweep and fixed: documented step 5c `push-prepare.mjs --close` exited 1 with reason `clean` once nothing is left to fold. The patch now exits 0 for reason `clean` (every other no-fold reason still exits 1); pinned by N26-g (spawns the real script). N26-g is written and the fix is in the patch, but its GREEN run (`c4`/rerun) was NOT read at hand-off; `c4` started before the fix was applied and so should show N26-g red.
- Header comments of `pipeline-state.mjs` (state shape, approve-push verb) updated for D206. Sweep of skills/templates/agents for text about a dirty tree or the fold after approve-push: no hits.

## Open (continuation card)

1. Re-run `scripts/pipeline-state.test.mjs` in the clone after the last test restatements (line ~396 global-chat case and the three signature cases now read through `approvalReadThroughStore`); expect N26-a..f green. Not re-run after the last edit.
2. The hooks/lib group (guard-push, guard-push-external-ledger, guard-push-checkpoint-approval, critical-action-authorization, -chat, checkpoint-push-approval) was still running at hand-off: read `c1.<name>.log` and run the same files as `base1` in clone2 for the failing-name comparison; likewise `base1` for the script group.
3. `pipeline-state-gate-action-event.test.mjs` PSG04 and PSG05 are green on baseline and RED in the clone (the patch caused it): PSG05 injects `deps.physicalStateReadback` to fail the tracked-state readback and expects no event; with no state write that readback is never consulted. Decide: route `--action-event-out` through the injected `deps.physicalStateReadback` against the private record (the patch currently reads the private record back itself), then re-run. PSG04 not yet analysed.
4. Existing suites OUTSIDE the write scope assert the old tracked write and must be restated by a follow-up slice (read the approval through `withPrivateCriticalApprovals` instead of `state.pushApproval`): `scripts/critical-human-proof-gate.test.mjs` (lines 52-58: record, `criticalProofConsumption.length === 1`, `before !== after`), `scripts/pipeline-state-push-anchor.test.mjs` (K52-1), `harness/scripts/pipeline-state-decision-reference.test.mjs` (PSDR01/02), `harness/scripts/pipeline-state-external-push-ledger.test.mjs` (PSXL03/04, read at lines 241/266 -- note the patch now refuses the external-ledger replay BEFORE writing the local record, which is stricter than the old after-write refusal). All four go red with the patch as shipped; they are the "any other test file needed means STOP" case.
5. Not done: downstream rg sweep of help/repair text beyond the lists above; revert proof re-run on the final bytes; `plugins/pipeline-core/docs/push-release-flow.md` is a vendored copy of `docs/push-release-flow.md` and needs the canon regeneration; a pin for the residual replay line; the module is hosted in `critical-action-authorization.mjs` because the write scope names no new file (briefing contradiction; moving the block to `lib/critical-approval-store.mjs` is a pure relocation).
6. Known limit: the action-local chat ceremony still writes the tracked record (and `pendingAuditWrite`); the fold is therefore kept for it.
