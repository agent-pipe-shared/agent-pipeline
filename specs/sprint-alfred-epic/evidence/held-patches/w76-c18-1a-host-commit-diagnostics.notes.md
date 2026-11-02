# w76 — host-commit stop codes name their cause (candidate 18, C18-1A)

Applies on the applied chain at the candidate 18 base. Source binding: AC-164 is the closest existing accepted criterion; the PRD and the Spec are unchanged.

## What it adds

- A failed SubagentStop host-commit completion of a MARKED Goldfish now always leaves a stop-failure record in `native-goldfish-host-diagnostics` (the directory the reader already uses). Until now the writer returned early when no handback was read (`stop.viaHandback` false), so a contract that arrived as `last_assistant_message` failed silently.
- When the pending state cannot be resolved (`NGHF-STOP-UNRESOLVED`: meta file unreadable or agent type or spawn depth mismatch; `NGHF-PENDING-UNAVAILABLE`), a record keyed by a hash of `session_id` and `agent_id` is written, with the code and the dispatch id when the contract names one. It is written only when the stopping child is a Goldfish role AND itself carries the host-return contract (its last message or its own `SubagentHandback`). An unmarked or non-Goldfish child writes nothing. A foreground state (`NGHF-NOT-SUBAGENT-STOP-ROUTE`) is normal and stays silent. Nothing is written inside `native-goldfish-host-commit`, so the existing refusal pin (a stop refusal changes nothing in the private state) holds.
- A thrown exception of the finalizer is recorded too (code `NGHF-HOOK-EXCEPTION`) and then rethrown, so the hook behaves exactly as before.
- Results and records keep every existing `code` string. They gain an optional, closed, bounded `detail` (string slugs <= 200 chars, arrays <= 5 entries, repository-relative paths only, counts, no absolute host path, no exception message or stack):
  - `NGHR-FINAL-SHAPE`: `detail.condition` is one of `fields`, `schema`, `dispatch-id`, `candidate-commit`, `outcome`, `report-type`, `report-empty`, `report-oversize`, `changed-paths-type`, `changed-paths-empty`, `changed-paths-too-many`, `path-not-normalized`, `paths-duplicate`, `paths-unsorted`, `path-outside-allowed` (with `detail.paths`, at most 5). The checks and their order are those of the former single conjunction, so admission is unchanged. A path that is not normalized is never echoed.
  - `AGY-HOST-COMMIT-DRIFT`: `detail.conditions` (`top-level-differs`, `head-moved`, `unmerged-paths`, `index-staged`) and `detail.stagedPaths`.
  - `AGY-HOST-COMMIT-PATH-MISMATCH`: `detail.extraPaths` (changed but not claimed), `detail.missingPaths` (claimed but not changed), at most 5 each, plus `extraCount` and `missingCount`.
  - `AGY-HOST-COMMIT-CONSENT-PATH`: `detail.outsideAllowed`.
  - `NGHF-COMMIT-EXCEPTION`: `detail.errorName`, `detail.errorCode` (the error's short `code` property, for example `SDC-ROOT`) and `detail.reason` (its slug reason, for example `repository-binding-changed`).
- The stop-failure record schema `pipeline.native-goldfish-host-stop-failure.v1` gets an optional `detail`; readers that ignore it keep working. `readNativeGoldfishStopFailure` sanitizes it again on read. The hook notice (`stopFailureNotice`, and the generic recovery message) appends one sentence derived from the detail ("Cause: ...") and the advice not to edit the tree during a Goldfish run.
- SDC-ROOT is raised in `session-authority-registry.mjs` and `session-cleanup-recovery.mjs`, which are untouched. Its second argument already travels as `error.reason`: the post-commit and pre-commit stages already carried it as `causeReason` (existing cases NGHF26 and NGHF27); the bare catch of the commit stage dropped it and now carries it in `detail.reason`.
- Tests: `native-goldfish-host-return.test.mjs` NGHR10, `agy-host-commit-admission.test.mjs` AHC09-AHC12 (the corpus-size pin goes from 8 to 12), `native-goldfish-host-finalizer.test.mjs` NGHF28-NGHF32 (valid `last_assistant_message` plus admission failure, unresolved meta file, unmarked and non-Goldfish stop writes nothing, commit exception, refused contract shape).

## Host-commit stop codes: cause and repair

Source for a later docs slice. Causes are read from source; the consumer's own stop-failure records were not available, so each cause is a hypothesis the new `detail` makes visible.
For any row, the first Elephant action is the same: read the `detail` in the hook notice, and do not edit the tree during a Goldfish run.

| Code | Cause | How to tell | Repair |
| --- | --- | --- | --- |
| `NGHR-FINAL-SHAPE` | The returned contract is not admissible. Sub-conditions: wrong field set (`fields`), schema, dispatch id or candidate commit that differ from the briefing; outcome not `succeeded` (or `checkpoint` where allowed); report not a string, empty or over 1 MiB; `changedPaths` not an array, empty, more than 64, not normalized, duplicated, not sorted, or outside `allowedPaths`. | `detail.condition` names the one that fired; for `path-outside-allowed`, `detail.paths` lists up to 5 offending paths. | Re-brief or resume the Goldfish so that it returns the exact contract. A path outside the allowed scope is a scope question for the Elephant, not a contract typo. |
| `AGY-HOST-COMMIT-DRIFT` | The tree moved since the briefing's candidate: HEAD differs (for example an Elephant commit during the run), the index has staged paths, there are unmerged paths, or the top level differs. | `detail.conditions` lists each; `detail.stagedPaths` lists staged paths. | Restore the tree to the candidate state (unstage, finish the merge, return to the candidate commit) or re-dispatch against the current HEAD. Do not commit during a Goldfish run. |
| `AGY-HOST-COMMIT-PATH-MISMATCH` | The tree's actual change set (tracked diff plus new untracked, minus the baseline) is not exactly the claimed `changedPaths`, for example the Elephant edited `docs/` or `scratch/` files during the run. | `detail.extraPaths` changed but not claimed; `detail.missingPaths` claimed but not changed; counts when more than 5. | Remove or park the extra edits and re-run the stop, or have the Goldfish claim exactly what changed. A missing path means the claim was wrong. |
| `AGY-HOST-COMMIT-BASELINE-CHANGED` | An untracked file that existed at the baseline changed content. | No detail (unchanged). Compare untracked files with the pre-launch state. | Restore that file's baseline content. |
| `AGY-HOST-COMMIT-CONSENT-PATH` | The actual change set is empty or contains paths outside the briefing's allowed paths. | `detail.outsideAllowed` lists up to 5. | Revert those paths or widen the scope by a fresh briefing. |
| `NGHF-COMMIT-EXCEPTION` | The commit stage threw. Git may or may not have changed (the result carries `commit: "unknown"`). | `detail.errorName`, `detail.errorCode` and `detail.reason` (for example `SDC-ROOT` with `repository-binding-changed`). | Inspect `git status` and `git log` first, then recover explicitly. |
| `SDC-ROOT` | The session-authority registry saw a repository binding that differs from the one recorded (root, common directory or candidate). | `reason` carries its slug (for example `repository-binding-changed`, `record-repository`). | Re-establish the recorded repository binding (same checkout and common directory) and re-run the stop; do not hand-edit registry files. |
| `NGHF-STOP-UNRESOLVED` / `NGHF-PENDING-UNAVAILABLE` | A contract-bearing Goldfish stop could not be matched to pending state (meta file unreadable, agent type mismatch, no pending dispatch for the tool use, session differs). | A record keyed by session and agent with only the code and the dispatch id. | Check that the child's meta file and the pending state of its launching call exist; otherwise take the interim route of committing the diff as the Elephant with the `Dispatch:` trailer. |

## Checks (clone, serial)

- `native-goldfish-host-return.test.mjs`: 10 of 10. `agy-host-commit-admission.test.mjs`: 12 of 12. `native-goldfish-host-finalizer.test.mjs`, `native-goldfish-host-finalizer-regression.test.mjs` and `check-consumer-safe-paths.test.mjs`: see the dispatch report.
- RED first: NGHR10 and NGHF28 failed against the original code before the first production edit. AHC09-AHC12 were not observed red separately: the first run aborted on a case-id ordering error in the test file itself, before any assertion ran.

## Not changed / not proven

- No `code` string, admission decision or commit transaction changed. `session-authority-registry.mjs` and `session-cleanup-recovery.mjs` untouched.
- The unmarked-child rule for unresolvable stops rests on the contract appearing in the child's own output; a marked Goldfish that dies before returning any contract still leaves no record in that case.
- Not proven against a real consumer run; the causes in the table remain hypotheses until a record with a `detail` is read there.
- The `NGHF-HOOK-EXCEPTION` record-then-rethrow path has no dedicated case.
- The full Verify was not run.
