// SPDX-License-Identifier: SUL-1.0
/**
 * Pure Nova B1-C local worker-pool contract.
 *
 * This module deliberately has no process, filesystem, clock, or durable-state
 * dependency.  It models only portable declarations and synthetic observations;
 * B1-I remains the separately-authorized supervisor boundary.
 */
import { createHash } from "node:crypto";

export const LOCAL_WORKER_POOL_SCHEMA = "pipeline.local-worker-pool.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PATH = (v) => typeof v === "string" && v.length > 0 && v.length <= 512 && !v.startsWith("/") && !v.includes("\\") && !v.split("/").some((part) => !part || part === "." || part === "..");
const ORPHAN_AFTER_MAX = 600000;
const WORKER_STATES = new Set(["created", "admitted", "running", "cancel-requested", "cancelled", "timed-out", "orphan-suspected", "orphaned", "recovered", "completed", "rejected"]);
const ACTIVE_WORKER_STATES = new Set(["admitted", "running", "cancel-requested", "orphan-suspected"]);
const TRANSITIONS = {
  created: new Set(["admitted", "rejected"]), admitted: new Set(["running", "cancel-requested", "cancelled", "timed-out", "orphan-suspected"]),
  running: new Set(["cancel-requested", "cancelled", "timed-out", "orphan-suspected", "completed"]), "cancel-requested": new Set(["cancelled", "orphan-suspected", "completed"]),
  "orphan-suspected": new Set(["orphaned", "recovered"]), recovered: new Set(["running", "cancel-requested", "cancelled", "timed-out", "completed"]),
};
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const clone = (value) => structuredClone(value);
function freeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
export function canonicalLocalWorkerPoolJson(value) { if (Array.isArray(value)) return `[${value.map(canonicalLocalWorkerPoolJson).join(",")}]`; if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalLocalWorkerPoolJson(value[key])}`).join(",")}}`; return JSON.stringify(value); }
const hash = (value) => createHash("sha256").update(canonicalLocalWorkerPoolJson(value), "utf8").digest("hex");
const sorted = (values, predicate) => Array.isArray(values) && values.length <= 256 && values.every(predicate) && values.every((value, index) => index === 0 || canonicalLocalWorkerPoolJson(values[index - 1]) < canonicalLocalWorkerPoolJson(value));
const bound = (value) => exact(value, ["concurrentTasks", "required"]) && (value.concurrentTasks === null || (Number.isSafeInteger(value.concurrentTasks) && value.concurrentTasks >= 0)) && typeof value.required === "boolean";
const reserved = (value) => exact(value, ["elephant", "verify", "critic"]) && Object.values(value).every((entry) => Number.isSafeInteger(entry) && entry >= 0);
const lease = (value) => exact(value, ["leaseId", "subjectSha256", "repository", "baseCommit", "candidateCommit", "worktreePathSha256", "writePaths", "ownerNonce", "issuedMonotonicMs", "expiresMonotonicMs", "cleanupState", "evidenceSha256"])
  && ID.test(value.leaseId) && SHA.test(value.subjectSha256) && SHA.test(value.repository) && OID.test(value.baseCommit) && OID.test(value.candidateCommit) && SHA.test(value.worktreePathSha256)
  && sorted(value.writePaths, PATH) && value.writePaths.length > 0 && ID.test(value.ownerNonce) && Number.isSafeInteger(value.issuedMonotonicMs) && value.issuedMonotonicMs >= 0
  && Number.isSafeInteger(value.expiresMonotonicMs) && value.expiresMonotonicMs > value.issuedMonotonicMs && ["active", "cleanup-pending", "cleaned", "blocked"].includes(value.cleanupState) && SHA.test(value.evidenceSha256);
const heartbeat = (value) => exact(value, ["intervalMs", "orphanAfterMs", "lastObservedMonotonicMs", "evidenceSha256"])
  && Number.isSafeInteger(value.intervalMs) && value.intervalMs >= 1000 && value.intervalMs <= 60000
  && Number.isSafeInteger(value.orphanAfterMs) && value.orphanAfterMs >= 3 * value.intervalMs && value.orphanAfterMs <= ORPHAN_AFTER_MAX
  && Number.isSafeInteger(value.lastObservedMonotonicMs) && value.lastObservedMonotonicMs >= 0 && SHA.test(value.evidenceSha256);
const worker = (value) => exact(value, ["subjectSha256", "workspaceLease", "process", "heartbeat", "state", "lastTransitionMonotonicMs", "stateEvidenceSha256"])
  && SHA.test(value.subjectSha256) && lease(value.workspaceLease) && value.workspaceLease.subjectSha256 === value.subjectSha256
  && exact(value.process, ["identitySha256", "separation", "assuranceEvidenceSha256"]) && SHA.test(value.process.identitySha256) && ["observed", "not-observed", "unavailable"].includes(value.process.separation) && SHA.test(value.process.assuranceEvidenceSha256)
  && heartbeat(value.heartbeat) && WORKER_STATES.has(value.state) && Number.isSafeInteger(value.lastTransitionMonotonicMs) && value.lastTransitionMonotonicMs >= 0 && SHA.test(value.stateEvidenceSha256);
const admission = (value) => exact(value, ["taskId", "subjectSha256", "requestSha256", "baseCommit", "candidateCommit", "writePaths", "state"])
  && ID.test(value.taskId) && SHA.test(value.subjectSha256) && SHA.test(value.requestSha256) && OID.test(value.baseCommit) && OID.test(value.candidateCommit) && sorted(value.writePaths, PATH) && value.writePaths.length > 0 && ["pending", "admitted", "rejected", "completed", "invalidated"].includes(value.state);
function capacityCode(value) {
  if (!exact(value, ["configured", "operator", "certified", "observed", "pressure", "reserved", "effective"]) || ![value.configured, value.operator, value.certified, value.observed, value.pressure].every(bound) || !reserved(value.reserved) || !exact(value.effective, ["status", "concurrentTasks", "reasonCodes"]) || !["available", "unavailable"].includes(value.effective.status) || !(value.effective.concurrentTasks === null || (Number.isSafeInteger(value.effective.concurrentTasks) && value.effective.concurrentTasks >= 0)) || !sorted(value.effective.reasonCodes, (code) => ID.test(code))) return "SHAPE:capacity";
  const calculated = computeEffectiveCapacity(value);
  if (calculated.status !== value.effective.status || calculated.concurrentTasks !== value.effective.concurrentTasks || canonicalLocalWorkerPoolJson(calculated.reasonCodes) !== canonicalLocalWorkerPoolJson(value.effective.reasonCodes)) return "CONFLICT:effective-capacity";
  return null;
}
function poolCode(value) {
  if (!exact(value, ["schema", "poolId", "candidate", "queueRevision", "capacity", "workers", "admissionSet", "cleanupOwner", "serialFallback"])) return "SHAPE:pool";
  if (value.schema !== LOCAL_WORKER_POOL_SCHEMA) return "SCHEMA:pool";
  if (!ID.test(value.poolId) || !exact(value.candidate, ["repositorySha256", "baseCommit", "candidateCommit"]) || !SHA.test(value.candidate.repositorySha256) || !OID.test(value.candidate.baseCommit) || !OID.test(value.candidate.candidateCommit) || !Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0 || capacityCode(value.capacity)) return "BOUND:pool";
  if (!sorted(value.workers, worker) || new Set(value.workers.map((entry) => entry.subjectSha256)).size !== value.workers.length || new Set(value.workers.map((entry) => entry.workspaceLease.leaseId)).size !== value.workers.length || !sorted(value.admissionSet, admission) || new Set(value.admissionSet.map((entry) => entry.taskId)).size !== value.admissionSet.length) return "BOUND:pool-members";
  if (!exact(value.cleanupOwner, ["subjectSha256", "ownerNonce", "evidenceSha256"]) || !SHA.test(value.cleanupOwner.subjectSha256) || !ID.test(value.cleanupOwner.ownerNonce) || !SHA.test(value.cleanupOwner.evidenceSha256) || typeof value.serialFallback !== "boolean") return "AUTHORITY:pool-owner";
  if (!value.workers.every((entry) => entry.workspaceLease.repository === value.candidate.repositorySha256 && entry.workspaceLease.baseCommit === value.candidate.baseCommit && entry.workspaceLease.candidateCommit === value.candidate.candidateCommit)) return "AUTHORITY:workspace-binding";
  const owner = value.workers.find((entry) => entry.subjectSha256 === value.cleanupOwner.subjectSha256 && entry.workspaceLease.ownerNonce === value.cleanupOwner.ownerNonce);
  if (!owner) return "STALE:cleanup-owner";
  if (!value.admissionSet.every((entry) => { const assigned = value.workers.find((candidate) => candidate.subjectSha256 === entry.subjectSha256); return assigned && entry.baseCommit === value.candidate.baseCommit && entry.candidateCommit === value.candidate.candidateCommit && entry.writePaths.every((path) => assigned.workspaceLease.writePaths.includes(path)); })) return "AUTHORITY:admission-binding";
  const active = value.workers.filter((entry) => ACTIVE_WORKER_STATES.has(entry.state));
  if (value.capacity.effective.status === "unavailable" && active.length > 0) return "AUTHORITY:parallel-unavailable";
  if (value.capacity.effective.status === "available" && active.length > value.capacity.effective.concurrentTasks) return "BOUND:capacity-exceeded";
  if (value.serialFallback && active.length > 1) return "BOUND:serial-fallback";
  return null;
}
export function validateLocalWorkerPool(value) { const code = poolCode(value); return code ? { ok: false, code } : { ok: true, code: null }; }
export function localWorkerPoolDigest(value) { return poolCode(value) ? null : hash(value); }
/** Derive the only portable capacity claim: minimum known bound less reserved slots. */
export function computeEffectiveCapacity(capacity) {
  if (!capacity || typeof capacity !== "object" || ![capacity.configured, capacity.operator, capacity.certified, capacity.observed, capacity.pressure].every(bound) || !reserved(capacity.reserved)) return { status: "unavailable", concurrentTasks: null, reasonCodes: ["SHAPE:capacity"] };
  const named = Object.entries({ configured: capacity.configured, operator: capacity.operator, certified: capacity.certified, observed: capacity.observed, pressure: capacity.pressure });
  const unknown = named.filter(([, entry]) => entry.required && entry.concurrentTasks === null).map(([name]) => `UNKNOWN:${name}`);
  if (unknown.length) return { status: "unavailable", concurrentTasks: null, reasonCodes: unknown.sort() };
  const known = named.map(([, entry]) => entry.concurrentTasks).filter((entry) => entry !== null);
  if (!known.length) return { status: "unavailable", concurrentTasks: null, reasonCodes: ["UNKNOWN:all"] };
  return { status: "available", concurrentTasks: Math.max(0, Math.min(...known) - capacity.reserved.elephant - capacity.reserved.verify - capacity.reserved.critic), reasonCodes: [] };
}
export function createLocalWorkerPool(input) {
  const value = { schema: LOCAL_WORKER_POOL_SCHEMA, ...clone(input) };
  if (Object.hasOwn(input, "schema") || poolCode(value)) throw new Error(poolCode(value) ?? "SHAPE:pool-input");
  return freeze(value);
}
/**
 * Reference-only adapter choice.  It is a capacity projection, never a launch
 * instruction: production process supervision belongs to B1-I.
 */
export function selectLocalWorkerPoolReferenceAdapter(pool, kind) {
  if (poolCode(pool)) return { status: "unavailable", kind: null, concurrentTasks: null, reasonCode: "SHAPE:pool" };
  if (!["serial", "in-process"].includes(kind)) return { status: "unavailable", kind: null, concurrentTasks: null, reasonCode: "SHAPE:adapter" };
  if (kind === "serial") return { status: "available", kind, concurrentTasks: 1, reasonCode: null };
  if (pool.serialFallback || pool.capacity.effective.status !== "available" || pool.capacity.effective.concurrentTasks < 1) return { status: "unavailable", kind, concurrentTasks: null, reasonCode: "UNAVAILABLE:parallel-admission" };
  return { status: "available", kind, concurrentTasks: pool.capacity.effective.concurrentTasks, reasonCode: null };
}
/**
 * Apply one synthetic observation. This cannot launch, cancel, clean up, or
 * import anything; callers must separately prove those effects in B1-I.
 */
export function reduceLocalWorkerPool(current, observation) {
  if (poolCode(current)) throw new Error("SHAPE:pool-current");
  if (!exact(observation, ["kind", "subjectSha256", "candidateCommit", "monotonicMs", "evidenceSha256"]) || !["heartbeat", "cancel", "cancelled", "timeout", "orphan-suspected", "orphaned", "recovered", "completed", "stale-candidate", "result-import"].includes(observation.kind) || !SHA.test(observation.subjectSha256) || !OID.test(observation.candidateCommit) || !Number.isSafeInteger(observation.monotonicMs) || observation.monotonicMs < 0 || !SHA.test(observation.evidenceSha256)) return { ok: false, code: "SHAPE:observation", pool: null };
  const index = current.workers.findIndex((entry) => entry.subjectSha256 === observation.subjectSha256);
  if (index < 0) return { ok: false, code: "STALE:worker", pool: null };
  const prior = current.workers[index];
  if (observation.monotonicMs < Math.max(prior.heartbeat.lastObservedMonotonicMs, prior.lastTransitionMonotonicMs)) return { ok: false, code: "STALE:observation", pool: null };
  if (observation.kind === "stale-candidate") {
    if (observation.candidateCommit === current.candidate.candidateCommit) return { ok: false, code: "CONFLICT:current-candidate", pool: null };
    const pool = clone(current); pool.workers[index].state = "rejected"; pool.workers[index].lastTransitionMonotonicMs = observation.monotonicMs; pool.workers[index].stateEvidenceSha256 = observation.evidenceSha256;
    pool.admissionSet = pool.admissionSet.map((entry) => entry.subjectSha256 === observation.subjectSha256 ? { ...entry, state: "invalidated" } : entry);
    return poolCode(pool) ? { ok: false, code: "INTERNAL:pool", pool: null } : { ok: true, code: "STATE:stale-candidate", pool: freeze(pool) };
  }
  if (observation.candidateCommit !== current.candidate.candidateCommit) return { ok: false, code: "STALE:candidate", pool: null };
  if (observation.kind === "result-import") return { ok: false, code: "UNAVAILABLE:result-import-authority", pool: null };
  if (observation.kind === "heartbeat") {
    if (!ACTIVE_WORKER_STATES.has(prior.state) || observation.monotonicMs < prior.heartbeat.lastObservedMonotonicMs) return { ok: false, code: "STALE:heartbeat", pool: null };
    const pool = clone(current); pool.workers[index].heartbeat.lastObservedMonotonicMs = observation.monotonicMs; pool.workers[index].heartbeat.evidenceSha256 = observation.evidenceSha256;
    return poolCode(pool) ? { ok: false, code: "INTERNAL:pool", pool: null } : { ok: true, code: "STATE:heartbeat", pool: freeze(pool) };
  }
  if (observation.kind === "orphan-suspected" && observation.monotonicMs - prior.heartbeat.lastObservedMonotonicMs < prior.heartbeat.orphanAfterMs) return { ok: false, code: "BOUND:orphan-deadline", pool: null };
  const nextState = { cancel: "cancel-requested", cancelled: "cancelled", timeout: "timed-out", "orphan-suspected": "orphan-suspected", orphaned: "orphaned", recovered: "recovered", completed: "completed" }[observation.kind];
  if (!TRANSITIONS[prior.state]?.has(nextState)) return { ok: false, code: "CONFLICT:transition", pool: null };
  const pool = clone(current); pool.workers[index].state = nextState; pool.workers[index].lastTransitionMonotonicMs = observation.monotonicMs; pool.workers[index].stateEvidenceSha256 = observation.evidenceSha256;
  return poolCode(pool) ? { ok: false, code: "INTERNAL:pool", pool: null } : { ok: true, code: `STATE:${nextState}`, pool: freeze(pool) };
}
