// SPDX-License-Identifier: SUL-1.0
/**
 * Atomic dispatch recovery state (backlog item pipeline.role-route-preflight-with-self-dispatch-fallback,
 * "Observed 2026-10-17", added acceptance 3): when a role dispatch fails or is refused, the course keeps ONE
 * explicit recovery state per task identity, with a bounded attempt history. Neither a chat message nor a
 * renamed task can stand in for it: the state is a file bound to {dispatchId, role, candidate}, an attempt is
 * accepted only from a real `pipeline.canonical-role-fallback.v1` result of that very task, and every write
 * is one temp-file + fsync + rename (`writeAtomic`) guarded by a compare-and-swap on the attempt count.
 *
 * Standalone and additive: no caller imports this module yet, so it is not a kernel path (GMWKC01). It has a
 * single-writer discipline (the Coordinator); the attempt-count compare-and-swap detects a lost update after the
 * fact, it is not a lock.
 */
import { createHash } from "node:crypto";
import { existsSync, lstatSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { writeAtomic } from "./governance-event-store.mjs";

export const DISPATCH_RECOVERY_STATE_SCHEMA = "pipeline.dispatch-recovery-state.v1";
export const MAX_RECOVERY_ATTEMPTS = 8;
export const MAX_RECOVERY_STDERR_BYTES = 1024;

const FALLBACK_SCHEMA = "pipeline.canonical-role-fallback.v1";
const ID = /^[a-z0-9][a-z0-9._-]{0,79}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const CODE = /^[A-Z][A-Z0-9-]{1,63}$/u;
const REASON = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;
const TRUNCATED = "[truncated]";
const ABSOLUTE_PATH = /[A-Za-z]:\\\S*|\/(?:home|Users)\/\S*/gu;

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");
const exactKeys = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const refusal = (code, extra = {}) => ({ schema: DISPATCH_RECOVERY_STATE_SCHEMA, ok: false, code, ...extra });
const identityDigest = (identity) => sha256(JSON.stringify([identity.dispatchId, identity.role, identity.candidateCommit, identity.candidateTree]));
const historyDigest = (attempts) => sha256(JSON.stringify(attempts));

/** The task identity of a role-dispatch packet, or null when the packet cannot carry one. */
export function taskIdentityOf(packet) {
  if (packet === null || typeof packet !== "object" || !ID.test(packet.dispatchId ?? "")
    || typeof packet.role !== "string" || packet.role.trim() === ""
    || !exactKeys(packet.candidate, ["commit", "tree"]) || !OID.test(packet.candidate.commit) || !OID.test(packet.candidate.tree)) return null;
  return { dispatchId: packet.dispatchId, role: packet.role, candidateCommit: packet.candidate.commit, candidateTree: packet.candidate.tree };
}

function statePath(root, dispatchId) {
  return join(root, "evidence", `dispatch-recovery-${dispatchId}.json`);
}

function boundedStderr(text) {
  const clean = text.replace(ABSOLUTE_PATH, "<path>");
  if (Buffer.byteLength(clean) <= MAX_RECOVERY_STDERR_BYTES) return clean;
  const room = MAX_RECOVERY_STDERR_BYTES - Buffer.byteLength(TRUNCATED);
  return `${Buffer.from(clean).subarray(0, room).toString("utf8").replace(/�+$/u, "")}${TRUNCATED}`;
}

/** One attempt row from a `runCanonicalRoleFallback` result of this task, or null. */
function attemptFrom(result, identity, attempt, now) {
  if (result === null || typeof result !== "object" || result.schema !== FALLBACK_SCHEMA
    || !["returned", "failed", "unavailable"].includes(result.status)
    || typeof result.code !== "string" || !CODE.test(result.code) || result.route !== "fallback-self-dispatch") return null;
  const reasonCode = result.reasonCode ?? null;
  if (reasonCode !== null && (typeof reasonCode !== "string" || !REASON.test(reasonCode))) return null;
  const bound = result.preparation?.packet;
  if (bound !== undefined && (bound?.dispatchId !== identity.dispatchId || bound?.role !== identity.role)) return null;
  const output = result.output;
  return {
    attempt,
    outcome: result.status === "returned" ? "returned" : "failed",
    code: result.code,
    route: "fallback-self-dispatch",
    reasonCode,
    exitCode: Number.isInteger(output?.exitCode) ? output.exitCode : null,
    stderr: boundedStderr(typeof output?.stderr === "string" ? output.stderr : ""),
    recordedAt: now(),
  };
}

function seal(identity, attempts) {
  return {
    schema: DISPATCH_RECOVERY_STATE_SCHEMA,
    taskIdentity: identity,
    taskIdentitySha256: identityDigest(identity),
    status: attempts.at(-1).outcome === "returned" ? "resolved" : "open",
    attempts,
    historySha256: historyDigest(attempts),
  };
}

function validState(state, dispatchId) {
  if (!exactKeys(state, ["schema", "taskIdentity", "taskIdentitySha256", "status", "attempts", "historySha256"])
    || state.schema !== DISPATCH_RECOVERY_STATE_SCHEMA
    || !exactKeys(state.taskIdentity, ["dispatchId", "role", "candidateCommit", "candidateTree"])
    || state.taskIdentity.dispatchId !== dispatchId || taskIdentityOf({ dispatchId, role: state.taskIdentity.role,
      candidate: { commit: state.taskIdentity.candidateCommit, tree: state.taskIdentity.candidateTree } }) === null
    || state.taskIdentitySha256 !== identityDigest(state.taskIdentity)
    || !Array.isArray(state.attempts) || state.attempts.length < 1 || state.attempts.length > MAX_RECOVERY_ATTEMPTS
    || state.historySha256 !== historyDigest(state.attempts)) return false;
  for (const [index, row] of state.attempts.entries()) {
    if (!exactKeys(row, ["attempt", "outcome", "code", "route", "reasonCode", "exitCode", "stderr", "recordedAt"])
      || row.attempt !== index + 1 || !["failed", "returned"].includes(row.outcome)
      || !CODE.test(row.code) || row.route !== "fallback-self-dispatch"
      || (row.reasonCode !== null && !REASON.test(row.reasonCode))
      || (row.exitCode !== null && !Number.isInteger(row.exitCode))
      || typeof row.stderr !== "string" || Buffer.byteLength(row.stderr) > MAX_RECOVERY_STDERR_BYTES
      || typeof row.recordedAt !== "string") return false;
    if (row.outcome === "returned" && index !== state.attempts.length - 1) return false;
  }
  return state.status === (state.attempts.at(-1).outcome === "returned" ? "resolved" : "open");
}

/** Reads and verifies the recovery state of one task; never throws. */
export function readDispatchRecovery({ root, dispatchId } = {}) {
  if (typeof root !== "string" || root === "" || typeof dispatchId !== "string" || !ID.test(dispatchId)) return refusal("DRS-INPUT");
  const path = statePath(root, dispatchId);
  let bytes;
  try {
    if (!lstatSync(path).isFile()) return refusal("DRS-CORRUPT");
    bytes = readFileSync(path, "utf8");
  } catch (error) {
    return error?.code === "ENOENT" ? refusal("DRS-NO-RECOVERY") : refusal("DRS-CORRUPT");
  }
  let state;
  try { state = JSON.parse(bytes); } catch { return refusal("DRS-CORRUPT"); }
  return validState(state, dispatchId) ? { schema: DISPATCH_RECOVERY_STATE_SCHEMA, ok: true, state } : refusal("DRS-CORRUPT");
}

async function persist(root, state, io) {
  try {
    mkdirSync(join(root, "evidence"), { recursive: true });
    await writeAtomic(statePath(root, state.taskIdentity.dispatchId), `${JSON.stringify(state)}\n`, io);
  } catch { return refusal("DRS-WRITE-FAILED"); }
  return { schema: DISPATCH_RECOVERY_STATE_SCHEMA, ok: true, state };
}

/** Opens the recovery state of a task from its first failed fallback result. Never replaces an existing state. */
export async function openDispatchRecovery({ root, packet, result, now = () => new Date().toISOString(), io } = {}) {
  const identity = taskIdentityOf(packet);
  if (typeof root !== "string" || root === "" || identity === null) return refusal("DRS-INPUT");
  const row = attemptFrom(result, identity, 1, now);
  if (row === null) return refusal("DRS-ATTEMPT-INVALID");
  if (existsSync(statePath(root, identity.dispatchId))) return refusal("DRS-EXISTS");
  return persist(root, seal(identity, [row]), io);
}

/**
 * Appends one attempt to the existing state of the same task. `expectedAttempts` is mandatory: the count the
 * caller read, so a lost update is refused (DRS-STALE) instead of silently overwriting history.
 */
export async function recordRecoveryAttempt({ root, packet, result, expectedAttempts, now = () => new Date().toISOString(), io } = {}) {
  const identity = taskIdentityOf(packet);
  if (typeof root !== "string" || root === "" || identity === null) return refusal("DRS-INPUT");
  const read = readDispatchRecovery({ root, dispatchId: identity.dispatchId });
  if (!read.ok) return read;
  if (read.state.taskIdentitySha256 !== identityDigest(identity)) return refusal("DRS-IDENTITY-MISMATCH");
  if (read.state.status === "resolved") return refusal("DRS-TERMINAL");
  const count = read.state.attempts.length;
  const row = attemptFrom(result, identity, count + 1, now);
  if (row === null) return refusal("DRS-ATTEMPT-INVALID");
  if (!Number.isInteger(expectedAttempts) || expectedAttempts !== count) return refusal("DRS-STALE", { attempts: count });
  if (count >= MAX_RECOVERY_ATTEMPTS) return refusal("DRS-ATTEMPT-LIMIT", { attempts: count });
  return persist(root, seal(identity, [...read.state.attempts, row]), io);
}
