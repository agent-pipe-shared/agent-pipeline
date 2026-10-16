// SPDX-License-Identifier: SUL-1.0
// Guard module "dispatch-record-lane" (layer 3), split out of guard-lifecycle-ready.mjs; declarations moved verbatim (s2-guard-split-plan.md).

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, lstatSync, realpathSync, openSync, closeSync, fstatSync, fsyncSync, unlinkSync, writeSync, readSync, constants as fsConstants } from "node:fs";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomBytes } from "node:crypto";
import { inspectSignedDescriptorCustodyRepository } from "../worktree-lifecycle.mjs";
import { createControlledMethodRuntimeFixture, inspectSourceOwnedCurrentAuthorityContext } from "../session-requester-bridge.mjs";
import { findResidualHostPath } from "../../scripts/capture-evidence.mjs";
import { join } from "node:path";
import { isTerminalOutcome } from "../dispatch-record.mjs";
import { resolveGitCommonDir } from "../../hooks/guard-dispatch-budget.mjs";
import { verdict } from "./verdict.mjs";
import { lifecycleSubagentIdentity } from "./bootstrap-receipt.mjs";
import { assessWindowsPrivatePath } from "../windows-private-state.mjs";

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
export const DISPATCH_RECORD_PATH_DENIAL_CODE = "GUARD-DISPATCH-RECORD-PATH";

// ALFRED-RECCOL: the OWNING dispatch may keep writing its own dispatch record after its own commit. Before this, once a commit cited the task id
// (Dispatch: <TASK_ID> (goldfish)) every further write was refused (git-history binding of an in-progress rewrite, or the interim outcome
// "committed-pending-report" being terminal by the denylist, or an Edit payload that is not JSON), so the template's "commit, checkpoint the record,
// ..., final outcome + report as last act" sequence could not complete. Ownership is the runtime agent identity the guard already resolves for the
// caller (lifecycleSubagentIdentity: agent_id + agent_type on the Claude PreToolUse payload). Native v1 retains the FIRST attempted write's
// compatibility claim, not a landed witness, under the git common dir (exclusive create, written by the guard,
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
    const path = dispatchRecordOwnerPath(commonDir, taskId);
    const claim = JSON.parse(dependencies.readFileSyncFn ? dependencies.readFileSyncFn(path, "utf8")
      : physicalCreationFile(path).bytes.toString("utf8"));
    if (claim?.schema === LANDED_DISPATCH_RECORD_OWNER_SCHEMA) {
      try {
        secureDirectory(commonDir); secureDirectory(join(commonDir, "agent-pipeline")); secureDirectory(dispatchRecordOwnerDir(commonDir));
        const actual = physicalCreationFile(dispatchRecordOwnerPath(commonDir, taskId));
        if (!closedKeys(claim, CLAIM_KEYS) || claim.taskId !== taskId || typeof claim.sessionId !== "string" || claim.sessionId === ""
          || ![claim.ownerNonceSha256, claim.creationDescriptorSha256, claim.creationInvocationBindingSha256, claim.recordSha256].every(value => /^[a-f0-9]{64}$/.test(value))
          || !closedKeys(claim.recordIdentity, ["dev", "ino"]) || ![claim.recordIdentity.dev, claim.recordIdentity.ino].every(Number.isSafeInteger)
          || typeof claim.createdAt !== "string" || !["controlled-unit-method", "physical-readback"].includes(claim.assurance)
          || dispatchRecordCanonicalJson(JSON.parse(actual.bytes.toString("utf8"))) !== dispatchRecordCanonicalJson(claim)) throw new Error("invalid landed claim");
        return claim;
      } catch { return { schema: "invalid-landed-claim" }; }
    }
    if (claim !== null && typeof claim === "object" && claim.schema === DISPATCH_RECORD_OWNER_SCHEMA && claim.taskId === taskId
      && typeof claim.agentId === "string" && claim.agentId !== "") return claim;
  } catch {
    if (!dependencies.readFileSyncFn && existsSync(dispatchRecordOwnerPath(commonDir, taskId))) return { schema: "invalid-landed-claim" };
  }
  return null;
}

// "unclaimed" -> the previous logic decides; "admit" / "refuse" -> final for a claimed record.
function dispatchRecordOwnerDecision({ taskId, requested, incoming, input, root, dependencies }) {
  const claim = readDispatchRecordOwnerClaim(dispatchRecordCommonDir(root, dependencies), taskId, dependencies);
  if (claim === null) return { decision: "unclaimed" };
  let owns = false;
  if (claim.schema === LANDED_DISPATCH_RECORD_OWNER_SCHEMA) {
    try {
      const repository = inspectSignedDescriptorCustodyRepository(root);
      if (repository.commonDir !== dispatchRecordCommonDir(root, dependencies)) throw new Error("foreign common directory");
      const context = inspectSourceOwnedCurrentAuthorityContext({ repository });
      owns = context?.status === "bound" && context.currentRequester?.sessionId === claim.sessionId
        && context.currentRequester?.ownerNonceSha256 === claim.ownerNonceSha256;
    } catch {}
  } else if (claim.schema === DISPATCH_RECORD_OWNER_SCHEMA) {
    const identity = input === null || input === undefined ? { kind: "orchestrator" } : lifecycleSubagentIdentity(input, dependencies);
    owns = identity.kind === "subagent" && identity.agentId === claim.agentId;
  }
  if (!owns) {
    return {
      decision: "refuse",
      reason: "task ID \"" + taskId + "\" is owned by dispatch agent " + (claim.agentId ?? "a source-owned session") + ", which opened this record; only that dispatch may write it. "
        + "Amend or recover a record you do not own through the sanctioned record writer (dispatch-record-write.mjs) or the PO override route, and never reuse the task ID.",
    };
  }
  let existing = null;
  try {
    if (claim.schema === LANDED_DISPATCH_RECORD_OWNER_SCHEMA) {
      if (existsSync(requested)) existing = JSON.parse(physicalCreationFile(requested).bytes.toString("utf8"));
    } else if ((dependencies.existsSyncFn ?? existsSync)(requested)) existing = JSON.parse((dependencies.readFileSyncFn ?? readFileSync)(requested, "utf8"));
  } catch {
    if (claim.schema === LANDED_DISPATCH_RECORD_OWNER_SCHEMA) return { decision: "refuse", reason: "source-owned dispatch record physical readback is unavailable or aliased" };
  }
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
 * Retains the native attempted-write binding for evidence/dispatch-record-<TASK_ID>.json (exclusive create of one private file under the git
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
    const claim = { schema: DISPATCH_RECORD_OWNER_SCHEMA, bindingKind: "attempted-native-write", taskId: match[1], agentId: identity.agentId, agentType: identity.agentType, claimedAt: nowFn() };
    (dependencies.writeFileSyncFn ?? writeFileSync)(dispatchRecordOwnerPath(commonDir, match[1]), JSON.stringify(claim, null, 2) + "\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { status: "claimed", agentId: identity.agentId };
  } catch (error) {
    return { status: error?.code === "EEXIST" ? "claim-exists" : "error" };
  }
}

export function checkDispatchRecordCollision({ relPath, requested, payload, root, input = null, dependencies = {} }) {
  const match = /^evidence\/dispatch-record-([A-Za-z0-9._-]+)\.json$/.exec(relPath);
  if (!match) {
    const misplaced = /(?:^|\/)dispatch-record-([A-Za-z0-9._-]+)\.json$/.exec(relPath);
    if (!misplaced) return null;
    return {
      taskId: misplaced[1],
      code: DISPATCH_RECORD_PATH_DENIAL_CODE,
      reason: "Dispatch records must be written to repository-root evidence/dispatch-record-" + misplaced[1] + ".json, not a nested evidence directory.",
    };
  }
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

// A source-owned METHOD creation is distinct from the native PreToolUse v1 attempt.
export const LANDED_DISPATCH_RECORD_OWNER_SCHEMA = "pipeline.dispatch-record-owner.v2";
const creationFaults = new AsyncLocalStorage();
const CREATION_LIMIT = 16384;
const FIXTURE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{2,79}$/;
const CLAIM_KEYS = ["schema", "taskId", "sessionId", "ownerNonceSha256", "creationDescriptorSha256",
  "creationInvocationBindingSha256", "recordSha256", "recordIdentity", "createdAt", "assurance"];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const closedKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const sameFile = (a, b) => ["dev", "ino", "mode", "nlink", "uid", "gid", "size", "mtimeMs", "ctimeMs"]
  .every(key => a[key] === b[key]);
function creationFailure(code) { const error = new Error(code); error.code = code; throw error; }
function secureDirectory(path) {
  const stat = lstatSync(path);
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(path) !== path
    || (stat.mode & 0o022) !== 0 || (typeof process.getuid === "function" && stat.uid !== process.getuid())) creationFailure("DRO-PATH");
  return stat;
}
function syncCreationDirectory(path) {
  secureDirectory(path);
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | fsConstants.O_NOFOLLOW);
  try { fsyncSync(fd); } finally { closeSync(fd); }
}
function creationDirectories(repository, root, create = false) {
  secureDirectory(repository.commonDir); secureDirectory(root);
  const agentRoot = join(repository.commonDir, "agent-pipeline"), ownerRoot = dispatchRecordOwnerDir(repository.commonDir);
  for (const path of [agentRoot, ownerRoot]) {
    if (create && !existsSync(path)) { try { mkdirSync(path, { mode: 0o700 }); } catch (error) { if (error.code !== "EEXIST") throw error; } }
    secureDirectory(path);
  }
  secureDirectory(join(root, "evidence"));
}
// win32: the claim/record file is judged RIGHT NOW (fresh: true), never from the process-local DACL observation memo -- that memo is keyed by
// object identity and would keep honouring a claim whose DACL was loosened after an earlier "secure" observation in the same process.
function physicalCreationFile(path, expected = null) {
  const before = lstatSync(path);
  if (!before.isFile() || before.isSymbolicLink() || realpathSync(path) !== path || before.nlink !== 1 || before.size > CREATION_LIMIT
    || (process.platform === "win32" ? assessWindowsPrivatePath(path, { fresh: true }).status !== "secure" : ((before.mode & 0o022) !== 0 || (typeof process.getuid === "function" && before.uid !== process.getuid())))) creationFailure("DRO-RECORD");
  const fd = openSync(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = fstatSync(fd), buffer = Buffer.alloc(CREATION_LIMIT + 1);
    let length = 0;
    while (length < buffer.length) { const count = readSync(fd, buffer, length, buffer.length - length, length); if (count === 0) break; length += count; }
    if (length > CREATION_LIMIT) creationFailure("DRO-RECORD");
    const bytes = buffer.subarray(0, length), after = fstatSync(fd), named = lstatSync(path);
    if (!sameFile(before, opened) || !sameFile(opened, after) || !sameFile(after, named)
      || bytes.length !== named.size || (expected && (expected.dev !== named.dev || expected.ino !== named.ino
        || expected.sha256 !== sha256(bytes)))) creationFailure("DRO-RECORD");
    return { bytes, stat: named, sha256: sha256(bytes) };
  } finally { closeSync(fd); }
}
function liveCreationContext(repository) {
  const context = inspectSourceOwnedCurrentAuthorityContext({ repository });
  if (context?.status !== "bound" || !context.currentRequester || !context.currentInvocationHandle
    || !["controlled-unit-method", "physical-readback"].includes(context.assurance)) creationFailure("DRO-CONTEXT");
  return context;
}
function sameCreationContext(a, b) {
  return a.currentInvocationHandle === b.currentInvocationHandle && a.runtimePort === b.runtimePort
    && a.invocationBindingSha256 === b.invocationBindingSha256
    && a.currentRequester.sessionId === b.currentRequester.sessionId
    && a.currentRequester.ownerNonceSha256 === b.currentRequester.ownerNonceSha256
    && a.currentRequester.descriptorSha256 === b.currentRequester.descriptorSha256;
}
function applyCreationFault(stage, repository, context, recordPath, ownerPath, original) {
  const fault = creationFaults.getStore();
  if (!fault || !fault.live || fault.commonDir !== repository.commonDir
    || fault.invocation !== context.currentInvocationHandle) return;
  if (stage === "before-create" && fault.kind === "occupy-record-path") {
    writeFileSync(recordPath, "Controlled exclusive creation collision.\n", { flag: "wx", mode: 0o600 });
    return;
  }
  if (stage !== "before-owner" || fault.kind === "none" || fault.kind === "occupy-record-path") return;
  // Each interleave acts only on the inode/bytes this operation actually created.
  physicalCreationFile(recordPath, original);
  if (fault.kind === "remove-created-record") unlinkSync(recordPath);
  if (fault.kind === "replace-created-inode") {
    const bytes = physicalCreationFile(recordPath, original).bytes;
    unlinkSync(recordPath); writeFileSync(recordPath, bytes, { flag: "wx", mode: 0o600 });
  }
  if (fault.kind === "change-created-bytes") {
    const fd = openSync(recordPath, fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW);
    try { const stat = fstatSync(fd); if (stat.dev !== original.dev || stat.ino !== original.ino) creationFailure("DRO-RECORD");
      const drift = Buffer.from("Controlled byte drift.\n"); writeSync(fd, drift, 0, drift.length, 0); fsyncSync(fd);
    } finally { closeSync(fd); }
  }
  if (fault.kind === "occupy-owner-path") writeFileSync(ownerPath, "Controlled owner publication collision.\n", { flag: "wx", mode: 0o600 });
}

/** Bounded exclusive record creation: caller data cannot issue requester authority. */
export async function createSourceOwnedDispatchRecord(input) {
  let reservation = null, landed = null, recordFd = null;
  let code = "DRO-INPUT";
  try {
    if (!closedKeys(input, ["rootDir", "taskId", "content"]) || typeof input.rootDir !== "string" || typeof input.taskId !== "string"
      || !/^[A-Za-z0-9._-]+$/.test(input.taskId) || typeof input.content !== "string"
      || Buffer.byteLength(input.content, "utf8") > CREATION_LIMIT) creationFailure(code);
    const content = Buffer.from(input.content, "utf8");
    if (content.toString("utf8") !== input.content) creationFailure(code);
    const value = JSON.parse(input.content);
    if (value === null || typeof value !== "object" || Array.isArray(value) || value.taskId !== input.taskId) creationFailure(code);
    code = "DRO-CONTEXT";
    const root = realpathSync(input.rootDir), repository = inspectSignedDescriptorCustodyRepository(root);
    const context = liveCreationContext(repository);
    code = "DRO-PATH";
    secureDirectory(root); secureDirectory(join(root, "evidence")); secureDirectory(repository.commonDir);
    const relPath = `evidence/dispatch-record-${input.taskId}.json`, recordPath = join(root, relPath);
    code = "DRO-GUARD";
    const { evaluateLifecycleReadyGuard } = await import("./evaluate.mjs");
    const admission = evaluateLifecycleReadyGuard({ tool_name: "Write", tool_input: { file_path: recordPath, content: input.content } }, { projectDir: root });
    if (admission?.exitCode !== 0 || findResidualHostPath(input.content)
      || checkDispatchRecordCollision({ relPath, requested: recordPath, payload: input.content, root })) creationFailure(code);
    code = "DRO-OWNER-EXISTS";
    creationDirectories(repository, root, true);
    const ownerPath = dispatchRecordOwnerPath(repository.commonDir, input.taskId);
    if (existsSync(ownerPath)) creationFailure(code);
    code = "DRO-RESERVATION";
    const pendingPath = join(dispatchRecordOwnerDir(repository.commonDir), `${input.taskId}.pending`);
    const pendingBytes = Buffer.from(JSON.stringify({ taskId: input.taskId, operation: randomBytes(24).toString("hex") }) + "\n");
    const pendingFd = openSync(pendingPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    try { writeFileSync(pendingFd, pendingBytes); fsyncSync(pendingFd); } finally { closeSync(pendingFd); }
    const pending = physicalCreationFile(pendingPath);
    reservation = { path: pendingPath, dev: pending.stat.dev, ino: pending.stat.ino, sha256: pending.sha256 };
    syncCreationDirectory(dispatchRecordOwnerDir(repository.commonDir));
    code = "DRO-WRITE";
    applyCreationFault("before-create", repository, context, recordPath, ownerPath, null);
    creationDirectories(repository, root);
    recordFd = openSync(recordPath, fsConstants.O_RDWR | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    writeFileSync(recordFd, content); fsyncSync(recordFd);
    const created = fstatSync(recordFd), actual = physicalCreationFile(recordPath);
    if (created.dev !== actual.stat.dev || created.ino !== actual.stat.ino || actual.sha256 !== sha256(content)) creationFailure("DRO-RECORD");
    landed = { dev: created.dev, ino: created.ino, sha256: actual.sha256 };
    syncCreationDirectory(join(root, "evidence"));
    code = "DRO-CLAIM-PUBLICATION";
    applyCreationFault("before-owner", repository, context, recordPath, ownerPath, landed);
    creationDirectories(repository, root);
    physicalCreationFile(recordPath, landed); physicalCreationFile(reservation.path, reservation);
    if (!sameCreationContext(context, liveCreationContext(repository))) creationFailure(code);
    const claim = { schema: LANDED_DISPATCH_RECORD_OWNER_SCHEMA, taskId: input.taskId,
      sessionId: context.currentRequester.sessionId, ownerNonceSha256: context.currentRequester.ownerNonceSha256,
      creationDescriptorSha256: context.currentRequester.descriptorSha256,
      creationInvocationBindingSha256: context.invocationBindingSha256, recordSha256: landed.sha256,
      recordIdentity: { dev: landed.dev, ino: landed.ino }, createdAt: new Date().toISOString(), assurance: context.assurance };
    const claimBytes = Buffer.from(JSON.stringify(claim, null, 2) + "\n");
    const ownerFd = openSync(ownerPath, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
    try { writeFileSync(ownerFd, claimBytes); fsyncSync(ownerFd); } finally { closeSync(ownerFd); }
    const owner = physicalCreationFile(ownerPath);
    if (owner.sha256 !== sha256(claimBytes)) creationFailure(code);
    return { status: "created-and-owned", taskId: input.taskId, recordSha256: landed.sha256, assurance: context.assurance };
  } catch {
    return landed ? { status: "landed-unclaimed", code: "DRO-CLAIM-PUBLICATION", recordSha256: landed.sha256 }
      : { status: "unavailable-or-refused", code };
  } finally {
    if (recordFd !== null) closeSync(recordFd);
    if (reservation) {
      // Never remove a foreign reservation, including one replaced during an interleave.
      try { physicalCreationFile(reservation.path, reservation); unlinkSync(reservation.path); } catch {}
    }
  }
}

/** Controlled METHOD constructor: genuine private requester context, physical faults only. */
export function createControlledDispatchRecordCreationFixture(input) {
  const faults = ["none", "occupy-record-path", "remove-created-record", "replace-created-inode", "change-created-bytes", "occupy-owner-path"];
  if (!closedKeys(input, ["rootDir", "fixtureId", "sessionId", "fault"]) || typeof input.rootDir !== "string"
    || typeof input.fixtureId !== "string" || typeof input.sessionId !== "string" || !FIXTURE_ID.test(input.fixtureId)
    || !FIXTURE_ID.test(input.sessionId) || !faults.includes(input.fault)) creationFailure("DRO-INPUT");
  const repository = inspectSignedDescriptorCustodyRepository(input.rootDir);
  const runtime = createControlledMethodRuntimeFixture({ repository,
    fixtureRoot: join(repository.commonDir, "agent-pipeline", "controlled-method-fixtures", input.fixtureId), sessionId: input.sessionId });
  const scope = { live: true, kind: input.fault, commonDir: repository.commonDir, invocation: runtime.currentInvocationHandle };
  return Object.freeze({ assurance: "controlled-unit-method",
    run: callback => { if (!scope.live || typeof callback !== "function") creationFailure("DRO-CONTEXT");
      return runtime.run(() => creationFaults.run(scope, callback)); },
    dispose: async () => { scope.live = false; return runtime.dispose(); },
  });
}

export function blockedDispatchRecordCollision(relPath, hit, overrideGuidance = "") {
  return verdict(
    2,
    "BLOCKED (guard-lifecycle-ready, plugin pipeline-core): "
      + `${hit.code ?? DISPATCH_RECORD_COLLISION_DENIAL_CODE}: ${hit.reason}\n`
      + `Target: ${relPath}\n`
      + (hit.code === DISPATCH_RECORD_PATH_DENIAL_CODE
        ? "Why: dispatch authorship consumers use repository-root evidence/dispatch-record-<TASK_ID>.json. Use that canonical path.\n"
        : "Why: task IDs must uniquely identify exactly one dispatch package. Reusing a task ID permanently breaks deterministic commit authorship verification (dispatch-authorship-verify.mjs: record-names-different-commit).\n")
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
