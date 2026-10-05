// SPDX-License-Identifier: SUL-1.0
// Guard module "dispatch-record-lane" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isTerminalOutcome } from "../dispatch-record.mjs";
import { resolveGitCommonDir } from "../../hooks/guard-dispatch-budget.mjs";
import { verdict } from "./verdict.mjs";
import { lifecycleSubagentIdentity } from "./bootstrap-receipt.mjs";

export const EVIDENCE_HOST_PATH_DENIAL_CODE = "GUARD-EVIDENCE-HOST-PATH";

/**
 * Returns true if repoPath targets a tracked evidence directory:
 * - `backlog/evidence/**`
 * - `specs/*.../evidence/**`
 * - `evidence/**`
 */
export function isEvidenceArtifactPath(repoPath) {
  if (typeof repoPath !== "string") return false;
  const normalized = repoPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("backlog/evidence/")) return true;
  if (/^specs\/.*\/evidence\//.test(normalized)) return true;
  if (normalized.startsWith("evidence/")) return true;
  return false;
}

export function extractWritePayload(toolInput, toolName) {
  if (toolInput === null || typeof toolInput !== "object") return "";
  const candidates = [];
  if (typeof toolInput.content === "string") candidates.push(toolInput.content);
  if (typeof toolInput.new_string === "string") candidates.push(toolInput.new_string);
  if (typeof toolInput.CodeContent === "string") candidates.push(toolInput.CodeContent);
  if (typeof toolInput.ReplacementContent === "string") candidates.push(toolInput.ReplacementContent);
  if (typeof toolInput.new_source === "string") candidates.push(toolInput.new_source);
  return candidates.join("\n");
}

export const DISPATCH_RECORD_COLLISION_DENIAL_CODE = "GUARD-DISPATCH-RECORD-COLLISION";

// ALFRED-RECCOL: the OWNING dispatch may keep writing its own dispatch record after its own commit. Before this, once a commit cited the task id
// (Dispatch: <TASK_ID> (goldfish)) every further write was refused (git-history binding of an in-progress rewrite, or the interim outcome
// "committed-pending-report" being terminal by the denylist, or an Edit payload that is not JSON), so the template's "commit, checkpoint the record,
// ..., final outcome + report as last act" sequence could not complete. Ownership is the runtime agent identity the guard already resolves for the
// caller (lifecycleSubagentIdentity: agent_id + agent_type on the Claude PreToolUse payload). The FIRST admitted write of a dispatched subagent that
// CREATES the record (no record file yet) claims it in the guard's private state under the git common dir (exclusive create, written by the guard,
// not forgeable by a subagent: private state is refused to agents elsewhere in this file). Rules for a CLAIMED record:
//   - a caller whose resolved identity is not the owner (another dispatch, the orchestrator, an unresolved identity) is refused;
//   - the owner is admitted while the record is non-final (in-progress, or the interim outcome) -- log/commits/report appends, the interim checkpoint
//     and the final outcome -- without the git-history test (its own commits cite its own task id; the history test already ran when it claimed);
//   - a FINAL-terminal record (any terminal outcome except the interim one) is immutable: only the owner's identical-content re-write is admitted
//     (a no-op, so a retried finalising write is not mistaken for a failure); an Edit can never prove identity and is refused.
// An UNCLAIMED record (created by the orchestrator, before this fix, or by a runner whose payload carries no agent identity) keeps the previous
// logic unchanged. No identity is ever guessed.
export const DISPATCH_RECORD_OWNER_SCHEMA = "pipeline.dispatch-record-owner.v1";

export const DISPATCH_RECORD_INTERIM_OUTCOME = "committed-pending-report";

const DISPATCH_RECORD_PATH = /^evidence\/dispatch-record-([A-Za-z0-9._-]+)\.json$/;

function dispatchRecordCommonDir(root, dependencies) {
  try { return (dependencies.resolveGitCommonDirFn ?? resolveGitCommonDir)(root, dependencies) ?? null; } catch { return null; }
}

function dispatchRecordOwnerDir(commonDir) {
  return join(commonDir, "agent-pipeline", "dispatch-record-owner");
}

function dispatchRecordOwnerPath(commonDir, taskId) {
  return join(dispatchRecordOwnerDir(commonDir), taskId + ".json");
}

function dispatchRecordCanonicalJson(value) {
  if (Array.isArray(value)) return "[" + value.map(dispatchRecordCanonicalJson).join(",") + "]";
  if (value !== null && typeof value === "object") {
    return "{" + Object.keys(value).sort().map((key) => JSON.stringify(key) + ":" + dispatchRecordCanonicalJson(value[key])).join(",") + "}";
  }
  return JSON.stringify(value);
}

function readDispatchRecordOwnerClaim(commonDir, taskId, dependencies) {
  if (commonDir === null) return null;
  try {
    const claim = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(dispatchRecordOwnerPath(commonDir, taskId), "utf8"));
    if (claim !== null && typeof claim === "object" && claim.schema === DISPATCH_RECORD_OWNER_SCHEMA && claim.taskId === taskId
      && typeof claim.agentId === "string" && claim.agentId !== "") return claim;
  } catch {}
  return null;
}

// "unclaimed" -> the previous logic decides; "admit" / "refuse" -> final for a claimed record.
function dispatchRecordOwnerDecision({ taskId, requested, incoming, input, root, dependencies }) {
  const claim = readDispatchRecordOwnerClaim(dispatchRecordCommonDir(root, dependencies), taskId, dependencies);
  if (claim === null) return { decision: "unclaimed" };
  const identity = input === null || input === undefined ? { kind: "orchestrator" } : lifecycleSubagentIdentity(input, dependencies);
  if (identity.kind !== "subagent" || identity.agentId !== claim.agentId) {
    return {
      decision: "refuse",
      reason: "task ID \"" + taskId + "\" is owned by dispatch agent " + claim.agentId + ", which opened this record; only that dispatch may write it. "
        + "Amend or recover a record you do not own through the sanctioned record writer (dispatch-record-write.mjs) or the PO override route, and never reuse the task ID.",
    };
  }
  let existing = null;
  try {
    if ((dependencies.existsSyncFn ?? existsSync)(requested)) existing = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(requested, "utf8"));
  } catch {}
  const isTerminalFn = dependencies.isTerminalOutcomeFn ?? isTerminalOutcome;
  const isFinal = existing !== null && typeof existing === "object" && isTerminalFn(existing.outcome)
    && String(existing.outcome).trim().toLowerCase() !== DISPATCH_RECORD_INTERIM_OUTCOME;
  if (!isFinal) return { decision: "admit" };
  if (incoming !== null && typeof incoming === "object" && dispatchRecordCanonicalJson(incoming) === dispatchRecordCanonicalJson(existing)) return { decision: "admit" };
  return {
    decision: "refuse",
    reason: "task ID \"" + taskId + "\" has already been used by a completed dispatch (outcome: \"" + existing.outcome + "\"). A final dispatch record is immutable: "
      + "only an identical-content re-write by its owner is admitted, because overwriting it orphans prior commit authorship.",
  };
}

/**
 * Records the dispatched subagent that CREATES evidence/dispatch-record-<TASK_ID>.json as its owner (exclusive create of one private file under the git
 * common dir). Called by the guard AFTER the collision check admitted the write; a pure side effect that never changes a verdict. Never adopts an
 * existing record, never replaces a claim, never guesses: no resolvable subagent identity (orchestrator, unresolved, other runners) means no claim.
 */
export function claimDispatchRecordOwnership({ relPath, requested, root, input, dependencies = {} }) {
  const match = DISPATCH_RECORD_PATH.exec(relPath);
  if (!match) return { status: "not-a-dispatch-record" };
  if (input === null || input === undefined) return { status: "no-identity" };
  const identity = lifecycleSubagentIdentity(input, dependencies);
  if (identity.kind !== "subagent") return { status: "no-identity" };
  const commonDir = dispatchRecordCommonDir(root, dependencies);
  if (commonDir === null) return { status: "no-common-dir" };
  try {
    if ((dependencies.existsSyncFn ?? existsSync)(requested)) return { status: "record-exists" };
    (dependencies.mkdirSyncFn ?? mkdirSync)(dispatchRecordOwnerDir(commonDir), { recursive: true, mode: 0o700 });
    const nowFn = dependencies.nowFn ?? (() => new Date().toISOString());
    const claim = { schema: DISPATCH_RECORD_OWNER_SCHEMA, taskId: match[1], agentId: identity.agentId, agentType: identity.agentType, claimedAt: nowFn() };
    (dependencies.writeFileSyncFn ?? writeFileSync)(dispatchRecordOwnerPath(commonDir, match[1]), JSON.stringify(claim, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { status: "claimed", agentId: identity.agentId };
  } catch (error) {
    return { status: error?.code === "EEXIST" ? "claim-exists" : "error" };
  }
}

export function checkDispatchRecordCollision({ relPath, requested, payload, root, input = null, dependencies = {} }) {
  const match = /^evidence\/dispatch-record-([A-Za-z0-9._-]+)\.json$/.exec(relPath);
  if (!match) return null;
  const taskId = match[1];

  let incoming = null;
  try {
    if (typeof payload === "string" && payload.trim() !== "") {
      incoming = JSON.parse(payload);
    }
  } catch {}

  const existsSyncFn = dependencies.existsSyncFn ?? existsSync;
  const readFileSyncFn = dependencies.readFileSyncFn ?? readFileSync;

  // ALFRED-RECCOL: a CLAIMED record is decided by its owner binding; an unclaimed one falls through to the previous logic below, unchanged.
  const ownership = dispatchRecordOwnerDecision({ taskId, requested, incoming, input, root, dependencies });
  if (ownership.decision === "admit") return null;
  if (ownership.decision === "refuse") return { taskId, reason: ownership.reason };

  if (existsSyncFn(requested)) {
    let existing = null;
    try {
      existing = JSON.parse(readFileSyncFn(requested, "utf8"));
    } catch {}

    if (existing && typeof existing === "object") {
      const isTerminalFn = dependencies.isTerminalOutcomeFn ?? isTerminalOutcome;
      if (isTerminalFn(existing.outcome)) {
        if (!incoming || incoming.outcome === "in-progress" || (incoming.candidateCommit && incoming.candidateCommit !== existing.candidateCommit)) {
          return {
            taskId,
            reason: `task ID "${taskId}" has already been used by a completed dispatch (outcome: "${existing.outcome}"). Overwriting a completed dispatch record orphans prior commit authorship. Choose a fresh, unique task ID.`,
          };
        }
      }
    }
  }

  if (incoming && incoming.outcome === "in-progress") {
    const gitLogFn = dependencies.gitCommitForTaskIdFn ?? ((id, repo) => {
      const res = spawnSync("git", ["log", "-1", "--format=%H", `--grep=^Dispatch:[ \t]*${id}[ \t]*(`], {
        cwd: repo,
        encoding: "utf8",
        timeout: 3000,
      });
      return (res.status === 0 && res.stdout) ? res.stdout.trim() : null;
    });
    const priorSha = gitLogFn(taskId, root);
    if (priorSha && priorSha.length >= 7) {
      return {
        taskId,
        reason: `task ID "${taskId}" is already bound to commit ${priorSha.slice(0, 12)} in git history. Reusing a task ID orphans commit authorship. Choose a fresh, unique task ID.`,
      };
    }
  }

  return null;
}

export function blockedDispatchRecordCollision(relPath, hit, overrideGuidance = "") {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${DISPATCH_RECORD_COLLISION_DENIAL_CODE}: ${hit.reason}\n`
      + `Target: ${relPath}\n`
      + "Why: task IDs must uniquely identify exactly one dispatch package. Reusing a task ID permanently breaks deterministic commit authorship verification (dispatch-authorship-verify.mjs: record-names-different-commit).\n"
      + overrideGuidance,
  );
}

export function blockedEvidenceHostPath(relPath, hit, overrideGuidance = "") {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${EVIDENCE_HOST_PATH_DENIAL_CODE}: Evidence artifact write into ${relPath} contains an absolute host path.\n`
      + `Matched pattern: ${hit.name} at character offset ${hit.offset}.\n`
      + "Evidence artifacts must never embed absolute host paths (POSIX user home, macOS home, WSL paths, or Windows drive paths).\n"
      + "Redact host paths using <repo-root>, <home>, or relative paths before writing to disk, or use plugins/pipeline-core/scripts/capture-evidence.mjs to capture command output safely.\n"
      + overrideGuidance,
  );
}
