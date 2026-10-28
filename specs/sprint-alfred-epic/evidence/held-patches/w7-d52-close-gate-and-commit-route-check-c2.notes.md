# D52 close gate (c2): clause B implemented and verified, patch applies

Slice W7-D52-CLOSE-GATE-AND-COMMIT-ROUTE-CHECK-C2-C1-20261027, candidate 8bbf027d79c6289a7c34ce12d25fd3f042a84162. Targeted delivery: **blocked at the budget checkpoint** (new pin RED then GREEN; whole-file baseline-versus-patched failing-name comparison started but its logs were not read). Batch Critic, Full Verify and PO acceptance stay parent-owned and pending. This note supersedes the first notes for clause B; clause A finding of the first notes is kept (preflight pins HOOK-SNAPSHOT-STALE only for the pre-push hook; those files were not edited).

Proposed commit message: `fix(close): the close coordinator refuses while a Critic slice of the feature course is still scheduled (D52)`

## Cause and change
`assertCourseCriticEvidence` in `plugins/pipeline-core/scripts/close-coordinator.mjs` gated only on dispatch records that require a Critic. Added (patch lines): `import { isTerminalOutcome }` from `../lib/dispatch-record.mjs`; helper `hasTerminalRecord(root, taskId)` (reads `evidence/dispatch-record-<id>.json` via `readJsonFile`, unreadable counts as not terminal); `legacyCourse` flag (`course.schema === "pipeline.slice-queue.v1"`); and, directly after the `requiredTaskIds` refusal, a refusal `CLOSE-CRITIC-SLICE-SCHEDULED` naming every slice with `tier === "critic"`, `state === "ready"` and no terminal record, with both repairs (run the Critic review and record its evidence, or cancel the slice through the sanctioned slice-queue route). Zero mutation; the same function runs in the plan and the apply re-check. Item-owned (v2) courses are left alone. Known gap: a hand-back terminal record counts as done.

## RED and GREEN
New file `plugins/pipeline-core/lib/pins/close-coordinator-refuses-a-scheduled-critic-slice.test.mjs` (7 tests: fixture validity incl. a valid cancelled row, cases a-f). Cancelled fixture defect of the earlier attempt: a cancelled row needs a `holdReason`.
- RED on the unchanged clone (log `scratch/agent-out/w7cc/red.close-coordinator-refuses-a-scheduled-critic-slice.test.mjs.log`): tests 7, pass 4, fail 3 ((a), (b), (e)).
- GREEN on the patched clone (`green.close-coordinator-refuses-a-scheduled-critic-slice.test.mjs.log`): tests 7, pass 7, fail 0.
- Apply check in clone2 at the candidate: `git apply --check` exit 0.

## Not done
- Nothing of the comparison remains open: the parent read the logs after the slice stopped. Whole `close-coordinator.test.mjs`: baseline (clone2) tests 35, pass 35, fail 0; patched (clone) tests 35, pass 35, fail 0, so the failing-name sets are both empty. Existing pin `close-coordinator-refuses-a-required-critic-without-evidence.test.mjs` on the patched clone: tests 14, pass 14, fail 0. The delivery is therefore verified apart from the batch gates (the parent-read counts are the only post-slice addition to this note).
- Both clones and the driver still exist (`node scratch/agent-out/w7cc/driver.mjs cleanup`).
- The new pin file needs Verify-suite registration (`harness/verify-suite-list` is a protected surface, TP-13, not touched).
- Independent Critic review: parent-owned batch gate.

## Operator flow
Apply the patch, `git add -u` with a path limit plus the new pin file, `--no-verify` commit, stamp, install. Protected-path classification: no touched file matches TP-1..TP-13.
