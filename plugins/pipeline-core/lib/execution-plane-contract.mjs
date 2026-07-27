// SPDX-License-Identifier: SUL-1.0
/** Pure Nova A4 execution identity, request, and synthetic-state contracts. */
import { createHash } from "node:crypto";

export const NOVA_EXECUTION_SUBJECT_SCHEMA = "pipeline.nova-execution-subject.v1";
export const EXECUTION_PLANE_REQUEST_SCHEMA = "pipeline.execution-plane-request.v1";
export const NOVA_EXECUTION_STATE_SCHEMA = "pipeline.nova-execution-state.v1";
const SHA = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const STATES = new Set(["created", "admitted", "rejected", "running", "paused", "cancel-requested", "cancelled", "succeeded-unverified", "verified", "failed", "timed-out", "lost", "completed-undelivered", "unavailable", "invalidated"]);
const TERMINAL = new Set(["rejected", "cancelled", "failed", "timed-out", "lost", "unavailable", "invalidated"]);
const TRANSITIONS = {
  created: new Set(["admitted", "rejected"]), admitted: new Set(["running", "cancel-requested", "failed", "timed-out", "unavailable"]),
  running: new Set(["running", "paused", "cancel-requested", "succeeded-unverified", "failed", "timed-out", "lost", "completed-undelivered"]),
  paused: new Set(["running", "cancel-requested", "failed", "timed-out", "lost"]), cancelRequested: new Set(),
  "cancel-requested": new Set(["cancelled", "succeeded-unverified", "failed", "timed-out", "lost"]),
  "succeeded-unverified": new Set(["verified", "invalidated"]), "completed-undelivered": new Set(["succeeded-unverified", "invalidated", "timed-out"]), verified: new Set(["invalidated"]),
};
const exact = (v, keys) => v !== null && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === keys.length && keys.every((k) => Object.hasOwn(v, k));
const clone = (v) => structuredClone(v);
function freeze(v) { if (v && typeof v === "object" && !Object.isFrozen(v)) { Object.values(v).forEach(freeze); Object.freeze(v); } return v; }
export function canonicalExecutionJson(v) { if (Array.isArray(v)) return `[${v.map(canonicalExecutionJson).join(",")}]`; if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalExecutionJson(v[k])}`).join(",")}}`; return JSON.stringify(v); }
const hash = (v) => createHash("sha256").update(canonicalExecutionJson(v), "utf8").digest("hex");
const sorted = (v, predicate) => Array.isArray(v) && v.length <= 256 && v.every(predicate) && v.every((x, i) => i === 0 || canonicalExecutionJson(v[i - 1]) < canonicalExecutionJson(x));
const path = (v) => typeof v === "string" && v.length > 0 && v.length <= 512 && !v.startsWith("/") && !v.includes("\\") && !v.split("/").some((x) => !x || x === "." || x === "..");
const authority = (v) => exact(v, ["kind", "sha256"]) && ID.test(v.kind) && SHA.test(v.sha256);
const capacity = (v) => exact(v, ["unit", "limit"]) && ID.test(v.unit) && Number.isSafeInteger(v.limit) && v.limit >= 0;
function subjectCode(v) {
  if (!exact(v, ["schema", "repository", "baseCommit", "baseTree", "candidateCommit", "candidateTree", "packageId", "dispatchId", "attempt", "queueRevision", "authorityDigests", "writePaths", "resources"])) return "SHAPE:subject";
  if (v.schema !== NOVA_EXECUTION_SUBJECT_SCHEMA) return "SCHEMA:subject";
  if (!exact(v.repository, ["identitySha256"]) || !SHA.test(v.repository.identitySha256) || ![v.baseCommit, v.baseTree, v.candidateCommit, v.candidateTree].every((x) => OID.test(x)) || ![v.packageId, v.dispatchId, v.attempt].every((x) => ID.test(x)) || !Number.isSafeInteger(v.queueRevision) || v.queueRevision < 0) return "SHAPE:subject-fields";
  if (!sorted(v.authorityDigests, authority) || v.authorityDigests.length === 0 || !sorted(v.writePaths, path) || !sorted(v.resources, (x) => ID.test(x))) return "BOUND:subject-sets";
  return null;
}
export function validateExecutionSubject(v) { const code = subjectCode(v); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createExecutionSubject(input) { const v = { schema: NOVA_EXECUTION_SUBJECT_SCHEMA, ...clone(input) }; if (Object.hasOwn(input, "schema") || subjectCode(v)) throw new Error(subjectCode(v) ?? "SHAPE:subject-input"); return freeze(v); }
export function executionSubjectDigest(v) { return subjectCode(v) ? null : hash(v); }

function requestCode(v, digest = true) {
  const keys = ["schema", "requestId", "subject", "adapter", "locality", "workspace", "network", "mounts", "writePaths", "resources", "sidecars", "credentialLease", "heartbeat", "timeout", "cancellation", "resultDelivery", "frozenBinding", "requestSha256"];
  if (!exact(v, keys)) return "SHAPE:request"; if (v.schema !== EXECUTION_PLANE_REQUEST_SCHEMA) return "SCHEMA:request";
  if (!ID.test(v.requestId) || subjectCode(v.subject) || !exact(v.adapter, ["kind", "version", "implementationSha256"]) || !ID.test(v.adapter.kind) || !ID.test(v.adapter.version) || !SHA.test(v.adapter.implementationSha256) || !["in-process", "local-process", "local-isolated", "external-synthetic"].includes(v.locality)) return "AUTHORITY:request-adapter";
  if (!exact(v.workspace, ["identitySha256", "separation", "assuranceEvidenceSha256"]) || !SHA.test(v.workspace.identitySha256) || !["observed", "not-observed", "unavailable"].includes(v.workspace.separation) || !SHA.test(v.workspace.assuranceEvidenceSha256) || !exact(v.network, ["mode", "egressClasses"]) || !["none", "restricted", "open"].includes(v.network.mode) || !sorted(v.network.egressClasses, (x) => ID.test(x))) return "SHAPE:request-environment";
  if (!sorted(v.mounts, (x) => exact(x, ["sourceClass", "targetClass", "mode", "evidenceSha256"]) && [x.sourceClass, x.targetClass].every((y) => ID.test(y)) && ["read-only", "read-write"].includes(x.mode) && SHA.test(x.evidenceSha256)) || !sorted(v.writePaths, path) || canonicalExecutionJson(v.writePaths) !== canonicalExecutionJson(v.subject.writePaths) || !sorted(v.resources, capacity) || !sorted(v.sidecars, (x) => exact(x, ["kind", "evidenceSha256"]) && ID.test(x.kind) && SHA.test(x.evidenceSha256))) return "AUTHORITY:request-capability";
  if (!(v.credentialLease === null || (exact(v.credentialLease, ["leaseSha256"]) && SHA.test(v.credentialLease.leaseSha256))) || !exact(v.heartbeat, ["intervalMs", "orphanAfterMs"]) || !Number.isSafeInteger(v.heartbeat.intervalMs) || !Number.isSafeInteger(v.heartbeat.orphanAfterMs) || v.heartbeat.intervalMs < 1 || v.heartbeat.orphanAfterMs < v.heartbeat.intervalMs || !exact(v.timeout, ["absoluteMs", "maxPauseMs"]) || !Number.isSafeInteger(v.timeout.absoluteMs) || !Number.isSafeInteger(v.timeout.maxPauseMs) || v.timeout.absoluteMs < 1 || v.timeout.maxPauseMs < 0 || !exact(v.cancellation, ["supported", "deadlineMs"]) || typeof v.cancellation.supported !== "boolean" || !Number.isSafeInteger(v.cancellation.deadlineMs) || v.cancellation.deadlineMs < 0 || !exact(v.resultDelivery, ["mode", "maxBytes", "destinationClass"]) || !["inline-digest", "import-only"].includes(v.resultDelivery.mode) || !Number.isSafeInteger(v.resultDelivery.maxBytes) || v.resultDelivery.maxBytes < 0 || !ID.test(v.resultDelivery.destinationClass)) return "BOUND:request-contract";
  if (!exact(v.frozenBinding, ["controlExecutionExchangeSha256", "invocationRequestSha256"]) || !SHA.test(v.frozenBinding.controlExecutionExchangeSha256) || !SHA.test(v.frozenBinding.invocationRequestSha256) || !SHA.test(v.requestSha256)) return "AUTHORITY:request-frozen";
  if (digest && executionRequestDigest(v) !== v.requestSha256) return "CONFLICT:request-digest"; return null;
}
export function executionRequestDigest(v) { if (!v || typeof v !== "object") return null; const { requestSha256, ...body } = v; return hash(body); }
export function validateExecutionPlaneRequest(v) { const code = requestCode(v); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createExecutionPlaneRequest(input) { const v = { schema: EXECUTION_PLANE_REQUEST_SCHEMA, ...clone(input), requestSha256: "0".repeat(64) }; if (Object.hasOwn(input, "schema") || Object.hasOwn(input, "requestSha256") || requestCode(v, false)) throw new Error(requestCode(v, false) ?? "SHAPE:request-input"); v.requestSha256 = executionRequestDigest(v); return freeze(v); }

function validObservation(v) { return v === null || (exact(v, ["monotonicMs", "adapterState", "rawStateSha256"]) && Number.isSafeInteger(v.monotonicMs) && v.monotonicMs >= 0 && ID.test(v.adapterState) && SHA.test(v.rawStateSha256)); }
function validResult(v) { return v === null || (exact(v, ["resultSha256", "bytes", "status"]) && SHA.test(v.resultSha256) && Number.isSafeInteger(v.bytes) && v.bytes >= 0 && ["delivered", "verified"].includes(v.status)); }
function stateCode(v) { if (!exact(v, ["schema", "subject", "subjectSha256", "state", "revision", "observation", "result", "reason", "previousSha256"])) return "SHAPE:state"; if (v.schema !== NOVA_EXECUTION_STATE_SCHEMA) return "SCHEMA:state"; if (subjectCode(v.subject) || executionSubjectDigest(v.subject) !== v.subjectSha256 || !STATES.has(v.state) || !Number.isSafeInteger(v.revision) || v.revision < 0 || !validObservation(v.observation) || !validResult(v.result) || !(v.reason === null || (typeof v.reason === "string" && v.reason.length > 0 && v.reason.length <= 512)) || !(v.previousSha256 === null || SHA.test(v.previousSha256))) return "BOUND:state"; if (v.state === "verified" && v.result?.status !== "verified") return "AUTHORITY:verifier"; return null; }
export function executionStateDigest(v) { return stateCode(v) ? null : hash(v); }
export function validateExecutionState(v) { const code = stateCode(v); return code ? { ok: false, code } : { ok: true, code: null }; }
export function createExecutionState(subject) { if (subjectCode(subject)) throw new Error("SHAPE:state-subject"); return freeze({ schema: NOVA_EXECUTION_STATE_SCHEMA, subject: clone(subject), subjectSha256: executionSubjectDigest(subject), state: "created", revision: 0, observation: null, result: null, reason: null, previousSha256: null }); }
export function normalizeSyntheticExecutionOutcome(expected, outcome) {
  if (!expected || subjectCode(expected.subject) || !exact(outcome, ["dispatchId", "attempt", "candidateCommit", "kind", "evidenceSha256", "result"]) || ![outcome.dispatchId, outcome.attempt].every((x) => ID.test(x)) || !OID.test(outcome.candidateCommit) || !SHA.test(outcome.evidenceSha256) || !validResult(outcome.result)) return { ok: false, code: "SHAPE:outcome", state: null };
  const s = expected.subject; if (outcome.dispatchId !== s.dispatchId || outcome.attempt !== s.attempt || outcome.candidateCommit !== s.candidateCommit) return { ok: false, code: "STALE:outcome", state: null };
  const map = { admitted: "admitted", running: "running", success: "succeeded-unverified", failure: "failed", timeout: "timed-out", lostHeartbeat: "lost", completedUndelivered: "completed-undelivered", verifierPassed: "verified" };
  if (outcome.kind === "duplicate") return { ok: true, code: "REPLAY:duplicate", state: null }; if (outcome.kind === "outOfOrder") return { ok: false, code: "STALE:out-of-order", state: null }; if (outcome.kind !== "cancel" && !Object.hasOwn(map, outcome.kind)) return { ok: false, code: "SHAPE:outcome-kind", state: null };
  if (outcome.kind === "cancel") return { ok: true, code: "OUTCOME:normalized", state: expected.state === "cancel-requested" ? "cancelled" : "cancel-requested", result: null, reason: null, observation: { monotonicMs: expected.revision + 1, adapterState: outcome.kind, rawStateSha256: outcome.evidenceSha256 } };
  if (outcome.kind === "verifierPassed" && (!expected.result || outcome.result?.resultSha256 !== expected.result.resultSha256)) return { ok: false, code: "AUTHORITY:verifier", state: null };
  if (outcome.kind === "success" && outcome.result === null) return { ok: false, code: "SHAPE:success-result", state: null };
  return { ok: true, code: "OUTCOME:normalized", state: map[outcome.kind], result: outcome.kind === "verifierPassed" ? { ...outcome.result, status: "verified" } : outcome.result, reason: null, observation: { monotonicMs: expected.revision + 1, adapterState: outcome.kind, rawStateSha256: outcome.evidenceSha256 } };
}
export function reduceExecutionState(current, outcome) { if (stateCode(current)) throw new Error("SHAPE:state-current"); const n = normalizeSyntheticExecutionOutcome(current, outcome); if (!n.ok || n.state === null) return n; if (TERMINAL.has(current.state) || !TRANSITIONS[current.state]?.has(n.state)) return { ok: false, code: "CONFLICT:transition", state: null }; const next = { ...clone(current), state: n.state, revision: current.revision + 1, observation: n.observation, result: n.result ?? current.result, reason: n.reason, previousSha256: executionStateDigest(current) }; return stateCode(next) ? { ok: false, code: "INTERNAL:state", state: null } : { ok: true, code: "STATE:applied", state: freeze(next) }; }
