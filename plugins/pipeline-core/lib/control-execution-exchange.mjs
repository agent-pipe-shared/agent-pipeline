// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateContinuityState } from "./continuity-state.mjs";

const SCHEMA = "pipeline.control-execution-exchange.v1";
const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EXT_KEY = /^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9-]*)+$/;
const CLASSES = {
  admission: new Set(["admitted", "rejected", "unknown", "unavailable"]),
  progress: new Set(["running", "blocked", "unknown", "unavailable"]),
  terminal: new Set(["succeeded", "failed", "cancelled", "unknown", "unavailable"]),
  cancellation: new Set(["requested", "acknowledged", "rejected", "unknown", "unavailable"]),
  verification: new Set(["passed", "failed", "unknown", "unavailable"]),
  "review-handoff": new Set(["ready", "rejected", "unknown", "unavailable"]),
};
const registry = JSON.parse(readFileSync(fileURLToPath(new URL("../config/control-execution-extension-namespaces.json", import.meta.url)), "utf8"));
if (!exact(registry, ["schema", "namespaces"]) || registry.schema !== "pipeline.control-execution-extension-namespaces.v1" || !Array.isArray(registry.namespaces) || [...registry.namespaces].sort().join("\0") !== registry.namespaces.join("\0") || new Set(registry.namespaces).size !== registry.namespaces.length || !registry.namespaces.every((n) => EXT_KEY.test(n))) throw new Error("CEX-REGISTRY");
const NAMESPACES = new Set(registry.namespaces);

function object(v) { return v !== null && typeof v === "object" && !Array.isArray(v); }
function exact(v, keys) { return object(v) && Object.keys(v).length === keys.length && Object.keys(v).every((k) => keys.includes(k)); }
function sha(v, nullable = false) { return (nullable && v === null) || (typeof v === "string" && SHA256.test(v)); }
function oid(v) { return typeof v === "string" && OID.test(v); }
function id(v) { return typeof v === "string" && ID.test(v); }
function canonicalJson(v) {
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  if (object(v)) return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(v[k])}`).join(",")}}`;
  return JSON.stringify(v);
}
function authorityDigest(digests, routeRequestSha256) {
  const body = canonicalJson({ authorityDigests: digests, routeRequestSha256 });
  return createHash("sha256").update(`pipeline.control-execution-authority.v1\0${body}`, "utf8").digest("hex");
}
function deepFreeze(v, seen = new Set()) {
  if (v && typeof v === "object" && !seen.has(v)) { seen.add(v); Object.values(v).forEach((x) => deepFreeze(x, seen)); Object.freeze(v); }
  return v;
}
function validEvent(v) { return exact(v, ["class", "status", "observedAt", "evidenceSha256"]) && CLASSES[v.class]?.has(v.status) && typeof v.observedAt === "string" && sha(v.evidenceSha256); }
function jsonData(v, seen = new Set()) { if (v === null || typeof v === "string" || typeof v === "boolean") return true; if (typeof v === "number") return Number.isFinite(v); if (typeof v !== "object" || seen.has(v) || Object.getPrototypeOf(v) !== Object.prototype && !Array.isArray(v)) return false; seen.add(v); if (Array.isArray(v)) return v.every((x) => jsonData(x, seen)); return Object.keys(v).every((k) => !["__proto__", "constructor", "prototype"].includes(k) && jsonData(v[k], seen)); }
function validInvalidation(v, revision) {
  if (!exact(v, ["state", "reasonCode", "supersededByQueueRevision"]) || !new Set(["valid", "invalidated"]).has(v.state)) return false;
  if (v.state === "valid") return v.reasonCode === null && v.supersededByQueueRevision === null;
  return new Set(["queue-advanced", "authority-drift", "base-drift", "candidate-superseded", "cancelled"]).has(v.reasonCode)
    && (v.supersededByQueueRevision === null || (v.reasonCode === "queue-advanced" && Number.isSafeInteger(v.supersededByQueueRevision) && v.supersededByQueueRevision > revision));
}
function validExtensions(v) { return object(v) && Object.keys(v).every((k) => EXT_KEY.test(k) && NAMESPACES.has(k) && jsonData(v[k])); }

export function createControlExecutionExchange(input) {
  if (!object(input) || Object.keys(input).length !== 6 || Object.keys(input).some((k) => !["continuityState", "gitBinding", "orchestrationAssignment", "invalidation", "event", "extensions"].includes(k))) throw new Error("CEX-INPUT");
  const { continuityState, gitBinding, orchestrationAssignment, invalidation, event, extensions } = input;
  const checked = validateContinuityState(continuityState);
  if (!checked.ok || continuityState.queueHead === null || continuityState.queueHead.dispatch === null) throw new Error("CEX-CONTINUITY");
  if (!exact(gitBinding, ["baseCommit", "candidateCommit", "candidateTree"]) || !Object.values(gitBinding).every(oid)) throw new Error("CEX-GIT");
  if (!exact(orchestrationAssignment, ["parentOrchestrationId", "workerId", "correlationId"]) || !Object.values(orchestrationAssignment).every(id)) throw new Error("CEX-ORCHESTRATION");
  const dispatch = continuityState.queueHead.dispatch;
  if (!exact(invalidation, ["state", "reasonCode", "supersededByQueueRevision"]) || !validInvalidation(invalidation, continuityState.revision)) throw new Error("CEX-INVALIDATION");
  if (!validEvent(event) || !validExtensions(extensions)) throw new Error("CEX-PROJECTION");
  const authoritySha256 = authorityDigest(dispatch.authorityDigests, dispatch.routeRequestSha256);
  const exchange = { schema: SCHEMA, package: { featureId: continuityState.featureId, packageId: dispatch.packageId, baseCommit: gitBinding.baseCommit, candidateCommit: gitBinding.candidateCommit, candidateTree: gitBinding.candidateTree, queueRevision: dispatch.queueRevision, authoritySha256, invalidation }, orchestration: { parentOrchestrationId: orchestrationAssignment.parentOrchestrationId, dispatchId: dispatch.dispatchId, workerId: orchestrationAssignment.workerId, correlationId: orchestrationAssignment.correlationId, attemptId: dispatch.attemptId, mayDelegate: false }, event, extensions };
  return deepFreeze(exchange);
}

export function validateControlExecutionExchange(value) {
  try {
    if (!exact(value, ["schema", "package", "orchestration", "event", "extensions"]) || value.schema !== SCHEMA) return { ok: false, code: "CEX-SCHEMA" };
    const p = value.package; const o = value.orchestration;
    if (!exact(p, ["featureId", "packageId", "baseCommit", "candidateCommit", "candidateTree", "queueRevision", "authoritySha256", "invalidation"]) || !id(p.featureId) || !id(p.packageId) || !oid(p.baseCommit) || !oid(p.candidateCommit) || !oid(p.candidateTree) || !Number.isSafeInteger(p.queueRevision) || !sha(p.authoritySha256) || !validInvalidation(p.invalidation, p.queueRevision)) return { ok: false, code: "CEX-PACKAGE" };
    if (!exact(o, ["parentOrchestrationId", "dispatchId", "workerId", "correlationId", "attemptId", "mayDelegate"]) || ![o.parentOrchestrationId, o.dispatchId, o.workerId, o.correlationId, o.attemptId].every(id) || o.mayDelegate !== false || !validEvent(value.event) || !validExtensions(value.extensions)) return { ok: false, code: "CEX-ORCHESTRATION" };
    return { ok: true, code: "CEX-VALID" };
  } catch { return { ok: false, code: "CEX-SCHEMA" }; }
}

export { canonicalJson };
