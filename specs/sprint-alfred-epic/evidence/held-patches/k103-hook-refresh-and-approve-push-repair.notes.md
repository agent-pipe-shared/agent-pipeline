# K103-APPLY-HOOK-REFRESH-AND-APPROVE-PUSH-REPAIR notes (implementation complete in clone; independent Critic read, operator commit of the protected part and PO acceptance pending)

Clone: scratch/clones/k103 (base: rehearsal clone, HEAD c22912b0a). Runner: scratch/k103-run.mjs (private TMPDIR, one file at a time). Results log: scratch/agent-out/k103-results.txt.

## Part C (decisions batch 7 row 10): apply refreshes stale hook snapshots - BUILT, unprotected
Cause (read from code): `clone-hook-readiness.mjs --apply` installed missing hooks only. `assessMandatoryHookReadiness` maps a stale hook (`refresh`) to `current`, so apply left it stale (the old partial test even pinned "hop 1 must not refresh"); the next preflight then reported `hook-refresh-required` (pipeline-start-preflight.mjs `planMandatoryHookRefresh`) and the refresh-mandatory-hooks.mjs hop was needed. onboarding-init.mjs / project-onboarding-v3.mjs call no readiness apply (no change there: fresh installs are current); install-agy has no repo root.
Change: `clone-hook-readiness.mjs` `applyMandatoryHookReadiness` = old body (renamed `applyMandatoryHookInstalls`) then `refreshStaleHooks`: when the result is `ready` and a mandatory hook is stale, it calls `refreshMandatoryHooks(root)` (injectable via `dependencies.refreshMandatoryHooks`), re-reads, adds `refreshResult`. Nothing stale: no call, result byte-identical. Failed/throwing/non-ready refresh: `status: "refresh-failed"`, `code: HOOK-READINESS-REFRESH-FAILED`, `reason` naming `node .../refresh-mandatory-hooks.mjs --root <root>`, `refreshResult`; exit 2 via existing main.
Not protected, not kernel (checked kernel list, protected-baseline, threat model: no hit for either script).
Commit 745e27a1e (3 files). New scripts/clone-hook-readiness.refresh.test.mjs (4 cases): RED 1/4 pass (a, b, c failed on the intended assertions: marker not rebound, refreshResult undefined, status ready instead of refresh-failed), GREEN 4/4.
QG-04 re-point (bounded, cites the PO decision, in the commit message): partial.test case "RED F1 (g)" asserted `hop 1 must not refresh the stale hook`; restated to: the apply rebound the marker, refreshResult ready, no refreshAvailable left, explicit helper is `current` (no-op). Provisioning-first assertions unchanged.
Counts (alone, `node scratch/k103-run.mjs <label> "--test <file>"`, run in the clone):
- before: partial 8/8, readiness.test 1/1, rollback 9/9, refresh-mandatory-hooks.test 8/8, refresh.test 1/4 (RED)
- after: refresh.test 4/4, readiness.test 1/1, partial 8/8, rollback 9/9, refresh-mandatory-hooks.test 8/8; pins auto-install-pre-push 6/6, returned-refusal-skips-rollback 8/8, bootstrap-should-refresh-hooks 18/18 (pins measured after only)
- pipeline-start-preflight not touched, not run.

## Part D1 (rows 1, 2): chat-mode approve-push refusal with a catalogue - REPRODUCED and BUILT, protected
Reproduction (real CLI `run`, governed throwaway repo, `gates.push_approval: chat`, catalogue initialised): exit 2, stderr `State authority route unavailable (SDC-AUTHORITY-UNAVAILABLE: state-push-source-requester) ... Repair: node .../session-authority-repair.mjs inspect --root <dir> names the cause and the command that clears it.` The command is named with --root, but its output is `status inspected`, every producer ok, drifted [], and its only `next` is an unrelated scratch-binding heal: the pointer names no repair for this cause. Cause: chat push approval with a catalogue goes to the State push producer route, which needs a host-bound requester; a shell binds none (K52 comment in pipeline-state-push-anchor.test.mjs).
Change (protected `plugins/pipeline-core/scripts/pipeline-state.mjs`, +11/-1): for `approve-push` with reason `state-push-source-requester` the refusal text states cause, "no approval was recorded", the repair (signature route: set gates.push_approval to signature in pipeline.user.yaml, then `node plugins/pipeline-core/scripts/pipeline-state.mjs approve-push --by <name> --remote <remote> --destination <ref> --proof-request <file> --proof-authority <file> --proof <file>` from the project dir; docs/push-release-flow.md) and keeps the inspect command (with --root) as the registry health check. All other reasons keep the old sentence. Code, exit 2, zero mutation unchanged.
Open reading (smallest chosen): the runnable repair is the signature route (the only route K52 pins as working while a catalogue exists); I did not offer `move-aside` of the registry. If the PO wants a chat-mode route to work in a shell with a catalogue, that is a design decision, not a message change.
Protected diff: scratch/agent-out/K103-D1-k103-protected.diff (pipeline-state.mjs). `git apply --check` clean against the main checkout AND against scratch/clones/k91 (applies after the bundle). The clone STILL CARRIES this edit in its working tree (uncommitted).
New test scripts/pipeline-state-approve-push-chat-catalogue-repair.test.mjs, committed 8f8c1e1c5 (unprotected path; green only with the protected diff): RED on unchanged source at "names the mode" (code 2, empty stdout, healthy-registry assertions passed first), GREEN 1/1 with the diff.
After (with diff, alone): D1 test 1/1; pipeline-state-push-anchor 10/10; harness/scripts/pipeline-state.test.mjs 1/1; pipeline-state-external-push-ledger 1/1 (no before counts for these three: reverting the protected edit to measure was not done). check-consumer-safe-paths 9/9.

## Diffs
- scratch/agent-out/K103-k103-unprotected.diff = both clone commits (c22912b0a..HEAD).
- scratch/agent-out/K103-D1-k103-protected.diff = pipeline-state.mjs.

## Risks / not measured
- architecture-boundary-check not run (budget): pipeline-state.mjs +11 lines and clone-hook-readiness.mjs +34 lines may touch line-bound ratchets; report only.
- New tests are not registered in harness/verify-suites.json (protected); partial.test is not either, so same status.
- refresh-failed keeps the installed hooks (no rollback of the install by design; the repair command is named).
- Tool budget exceeded base 70 by a few calls (grammar refusals cost 4).

## Proposed commit messages (trailers exactly)
Part C: committed as 745e27a1e (message in clone scratch/commit-msg/k103-c.txt).
Part D1 protected: fix(refusals): name cause and signature-route repair in the chat-mode approve-push refusal with a catalogue

PO decision 2026-10-23 (tiles batch 7 rows 1, 2; D74). Message-only; code, exit and zero-mutation unchanged; pinned by pipeline-state-approve-push-chat-catalogue-repair.test.mjs.

AI-Assisted: true
Dispatch: K103-APPLY-HOOK-REFRESH-AND-APPROVE-PUSH-REPAIR (goldfish)
