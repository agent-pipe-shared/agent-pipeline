// SPDX-License-Identifier: SUL-1.0
/**
 * Which record carries the authorship of each slice of a feature's delivery course at close
 * (D27 / D55 Q1).
 *
 * A background Goldfish dispatch never leaves the pending host observation a dispatch record needs,
 * so its slice is recorded only by its commit: `Dispatch: <slice> (goldfish)`, usually with
 * `Commit-Act: orchestrator`. The close route used to scope its Critic gate by dispatch records
 * alone, so such a slice passed it unseen. This module names the three kinds instead:
 *   - `dispatchRecord`: an `evidence/dispatch-record-*.json` names the slice; the existing Critic
 *     gate applies unchanged;
 *   - `orchestratorCommit`: no record, but the commit evidence of
 *     `readOrchestratorCommitIntegratedSlices` integrates it. That reader also counts a stopped
 *     `ready` attempt superseded by an integrated same-item dependent; such a slice rides along as
 *     work delivered by the dependent's commit;
 *   - `unrecorded`: neither. Not gated here (a held, deferred or not yet delivered slice has
 *     nothing behind it either); the close reports it in the transition plan's `courseAuthorship`.
 * The orchestrator's per-commit counted runs are not persisted anywhere, so the close cannot read
 * them. Its persisted equivalent is the candidate-bound Verify and Critic receipt of the audit
 * route, which the coordinator therefore requires once any slice is `orchestratorCommit`.
 * Read-only; it imports the kernel readers and changes none of them.
 */
import { spawnSync } from "node:child_process";
import { walkDispatchRecords } from "../scripts/check-critic-skip-coverage.mjs";
import { readOrchestratorCommitIntegratedSlices } from "./native-goldfish-host-state.mjs";

export const CLOSE_AUTHORSHIP_SCHEMA = "pipeline.close-course-authorship.v1";
const FULL_COMMIT = /^[a-f0-9]{40}$/u;

/** True when `commit` is `candidate` or one of its ancestors; any unreadable object reads as not contained. */
function commitContained(root, commit, candidate) {
  if (!FULL_COMMIT.test(commit ?? "")) return false;
  return spawnSync("git", ["-C", root, "merge-base", "--is-ancestor", commit, candidate], { shell: false, timeout: 30_000 }).status === 0;
}

/**
 * `deps.records(root)`, `deps.commitIntegrated(input)` and `deps.commitContained(commit)` are injectable for tests.
 * An orchestrator-attested record (the host-commit recover helper writes one for the commit it made) is the authorship of a slice
 * only for exactly the commit it names: when the course candidate does not contain that commit, the record is not counted.
 * Every other record kind is counted as before.
 */
export function classifyCourseAuthorship({ root, slices, candidateCommit }, deps = {}) {
  const live = (slices ?? []).filter((slice) => slice && slice.state !== "cancelled" && slice.tier !== "critic");
  const scan = (deps.records ?? walkDispatchRecords)(root);
  const contained = deps.commitContained ?? ((commit) => commitContained(root, commit, candidateCommit));
  const checkable = FULL_COMMIT.test(candidateCommit ?? "") || typeof deps.commitContained === "function";
  const counts = (record) => record?.outcomeClassification?.kind !== "orchestrator-attested" || !checkable || contained(record.candidateCommit);
  const owners = new Set(scan.records.filter(({ record }) => counts(record)).map(({ record }) => (typeof record?.sliceId === "string" ? record.sliceId : record?.taskId)).filter((id) => typeof id === "string"));
  const committed = new Set((deps.commitIntegrated ?? readOrchestratorCommitIntegratedSlices)({ root, candidateCommit, slices: live }));
  const result = { schema: CLOSE_AUTHORSHIP_SCHEMA, dispatchRecord: [], orchestratorCommit: [], unrecorded: [] };
  for (const slice of live) {
    if (owners.has(slice.id)) result.dispatchRecord.push(slice.id);
    else if (committed.has(slice.id)) result.orchestratorCommit.push(slice.id);
    else result.unrecorded.push(slice.id);
  }
  for (const list of [result.dispatchRecord, result.orchestratorCommit, result.unrecorded]) list.sort();
  return result;
}
