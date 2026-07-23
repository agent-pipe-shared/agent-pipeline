// SPDX-License-Identifier: SUL-1.0
import { createHash } from "node:crypto";
import { lstatSync, readFileSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const PHASE_MAP = JSON.parse(readFileSync(join(HERE, "..", "config", "gate-estimate-phase-map.v1.json"), "utf8"));
const SAFE_ID = /^[a-z0-9][a-z0-9._-]{1,79}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const BASIS_KINDS = new Set(["completed-contracts", "open-readiness-findings", "verify-run", "coordinator-observation"]);
export const GATE_ESTIMATE_SCHEMA = "pipeline.gate-estimate.v1";
export const GATE_ESTIMATE_EVIDENCE_SCHEMA = "pipeline.gate-estimate-evidence.v1";
export const GATE_ESTIMATE_PHASES = Object.freeze({ ...PHASE_MAP.phases });

function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function exactKeys(value, keys) { return isObject(value) && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key)); }
function hash(value) { return createHash("sha256").update(value).digest("hex"); }
function unknown(code) { return { state: "unknown", rangeMinutes: null, source: null, code }; }
export function deriveNextGate(phase) { return typeof phase === "string" ? GATE_ESTIMATE_PHASES[phase] ?? null : null; }
export function normalizeEvidencePath(value) {
  if (typeof value !== "string" || value.length === 0 || value.length > 240 || value.trim() !== value
    || value.includes("\\") || value.includes("\0") || isAbsolute(value) || value.startsWith("./") || value.endsWith("/")
    || value.split("/").some((part) => part === "" || part === "." || part === "..")) return null;
  return value;
}
function validTimestamp(value) { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function validateGateEstimateEvidence(value, expectedFeatureId, expectedGate) {
  if (!exactKeys(value, ["schema", "featureId", "gate", "observedAt", "basis", "note"])
    || value.schema !== GATE_ESTIMATE_EVIDENCE_SCHEMA || value.featureId !== expectedFeatureId || value.gate !== expectedGate
    || !validTimestamp(value.observedAt) || !Array.isArray(value.basis) || value.basis.length === 0
    || typeof value.note !== "string" || value.note.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.note)) return { ok: false, code: "GE-EVIDENCE-SHAPE" };
  const normalized = [];
  for (const basis of value.basis) {
    if (!exactKeys(basis, ["kind", "reference", "digest"]) || !BASIS_KINDS.has(basis.kind)
      || normalizeEvidencePath(basis.reference) === null || !SHA256.test(basis.digest)) return { ok: false, code: "GE-EVIDENCE-BASIS" };
    normalized.push(`${basis.kind}:${basis.reference}:${basis.digest}`);
  }
  if (new Set(normalized).size !== normalized.length || normalized.some((entry, index) => index > 0 && normalized[index - 1] >= entry)) {
    return { ok: false, code: "GE-EVIDENCE-ORDER" };
  }
  return { ok: true, code: "GE-EVIDENCE-VALID" };
}
export function readGateEstimateEvidence(root, path) {
  const normalized = normalizeEvidencePath(path);
  if (normalized === null) return { ok: false, code: "GE-EVIDENCE-PATH" };
  const repoRoot = realpathSync(root);
  const absolute = resolve(repoRoot, normalized);
  const rel = relative(repoRoot, absolute);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return { ok: false, code: "GE-EVIDENCE-PATH" };
  let cursor = repoRoot;
  for (const part of rel.split(sep)) {
    cursor = join(cursor, part);
    let info;
    try { info = lstatSync(cursor); } catch { return { ok: false, code: "GE-EVIDENCE-MISSING" }; }
    if (info.isSymbolicLink()) return { ok: false, code: "GE-EVIDENCE-SYMLINK" };
  }
  const info = lstatSync(absolute);
  if (!info.isFile() || info.size > 1024 * 1024) return { ok: false, code: info.size > 1024 * 1024 ? "GE-EVIDENCE-SIZE" : "GE-EVIDENCE-FILE" };
  const bytes = readFileSync(absolute);
  let value;
  try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { return { ok: false, code: "GE-EVIDENCE-JSON" }; }
  return { ok: true, path: normalized, sha256: hash(bytes), bytes, value };
}
export function projectGateEstimate(record, { activeFeature, observation, evidence } = {}) {
  if (!isObject(activeFeature)) return unknown("CS-ETA-FEATURE");
  const gate = deriveNextGate(activeFeature.phase);
  if (gate === null) return unknown("CS-ETA-NO-NEXT-GATE");
  if (!exactKeys(record, ["schema", "id", "featureId", "gate", "objectFormat", "sourceOid", "evidence", "rangeMinutes", "recordedBy", "recordedAt"])
    || record.schema !== GATE_ESTIMATE_SCHEMA || !SAFE_ID.test(record.id) || record.featureId !== activeFeature.id || record.gate !== gate
    || !["sha1", "sha256"].includes(record.objectFormat) || typeof record.sourceOid !== "string"
    || record.sourceOid.length !== (record.objectFormat === "sha1" ? 40 : 64) || !/^[a-f0-9]+$/.test(record.sourceOid)
    || !exactKeys(record.evidence, ["path", "sha256"]) || normalizeEvidencePath(record.evidence.path) === null || !SHA256.test(record.evidence.sha256)
    || !exactKeys(record.rangeMinutes, ["min", "max"]) || !Number.isSafeInteger(record.rangeMinutes.min) || !Number.isSafeInteger(record.rangeMinutes.max)
    || record.rangeMinutes.min < 0 || record.rangeMinutes.max < record.rangeMinutes.min || record.rangeMinutes.max > 10080
    || record.recordedBy !== "coordinator" || !validTimestamp(record.recordedAt)) return unknown("CS-ETA-RECORD");
  if (!observation?.ok || observation.objectFormat !== record.objectFormat || observation.sourceOid !== record.sourceOid) return unknown("CS-ETA-SOURCE-DRIFT");
  if (!evidence?.ok || evidence.path !== record.evidence.path || evidence.sha256 !== record.evidence.sha256) return unknown("CS-ETA-EVIDENCE-DRIFT");
  if (!validateGateEstimateEvidence(evidence.value, activeFeature.id, gate).ok) return unknown("CS-ETA-EVIDENCE");
  return { state: "known", rangeMinutes: { ...record.rangeMinutes }, source: { path: evidence.path, sha256: evidence.sha256 }, code: "CS-ETA-KNOWN" };
}

function validStoredGateEstimate(record) {
  return exactKeys(record, ["schema", "id", "featureId", "gate", "objectFormat", "sourceOid", "evidence", "rangeMinutes", "recordedBy", "recordedAt"])
    && record.schema === GATE_ESTIMATE_SCHEMA && SAFE_ID.test(record.id) && typeof record.featureId === "string" && record.featureId.length > 0
    && ["prd", "security", "merge"].includes(record.gate)
    && ["sha1", "sha256"].includes(record.objectFormat) && typeof record.sourceOid === "string"
    && record.sourceOid.length === (record.objectFormat === "sha1" ? 40 : 64) && /^[a-f0-9]+$/.test(record.sourceOid)
    && exactKeys(record.evidence, ["path", "sha256"]) && normalizeEvidencePath(record.evidence.path) !== null && SHA256.test(record.evidence.sha256)
    && exactKeys(record.rangeMinutes, ["min", "max"]) && Number.isSafeInteger(record.rangeMinutes.min) && Number.isSafeInteger(record.rangeMinutes.max)
    && record.rangeMinutes.min >= 0 && record.rangeMinutes.max >= record.rangeMinutes.min && record.rangeMinutes.max <= 10080
    && record.recordedBy === "coordinator" && validTimestamp(record.recordedAt);
}

/** Pure CAS contract consumed by the protected pipeline-state writer at its integration gate. */
export function prepareGateEstimateMutation(state, request, { observation, evidence, now = new Date() } = {}) {
  if (!isObject(state) || !isObject(state.activeFeature)) return { ok: false, code: "PS-GATE-ESTIMATE-FEATURE" };
  const gate = deriveNextGate(state.activeFeature.phase);
  if (gate === null || request?.gate !== gate || request.featureId !== state.activeFeature.id) return { ok: false, code: "PS-GATE-ESTIMATE-GATE" };
  if (!SAFE_ID.test(request.id) || typeof request.expectedCurrentId !== "string"
    || request.recordedBy !== "coordinator" || !observation?.ok || !evidence?.ok) return { ok: false, code: "PS-GATE-ESTIMATE-ARGUMENT" };
  if (state.gateEstimate !== undefined && !validStoredGateEstimate(state.gateEstimate)) return { ok: false, code: "PS-GATE-ESTIMATE-EXISTING" };
  const currentId = state.gateEstimate?.id ?? "absent";
  if (request.expectedCurrentId !== currentId) return { ok: false, code: "PS-GATE-ESTIMATE-CAS" };
  if (!exactKeys(request.rangeMinutes, ["min", "max"]) || !Number.isSafeInteger(request.rangeMinutes.min) || !Number.isSafeInteger(request.rangeMinutes.max)
    || request.rangeMinutes.min < 0 || request.rangeMinutes.max < request.rangeMinutes.min || request.rangeMinutes.max > 10080) return { ok: false, code: "PS-GATE-ESTIMATE-RANGE" };
  if (request.sourceOid !== observation.sourceOid || request.objectFormat !== observation.objectFormat
    || request.evidencePath !== evidence.path || request.evidenceSha256 !== evidence.sha256
    || !validateGateEstimateEvidence(evidence.value, state.activeFeature.id, gate).ok) return { ok: false, code: "PS-GATE-ESTIMATE-EVIDENCE" };
  const candidate = {
    schema: GATE_ESTIMATE_SCHEMA, id: request.id, featureId: request.featureId, gate,
    objectFormat: observation.objectFormat, sourceOid: observation.sourceOid,
    evidence: { path: evidence.path, sha256: evidence.sha256 }, rangeMinutes: { ...request.rangeMinutes },
    recordedBy: "coordinator", recordedAt: now.toISOString(),
  };
  if (state.gateEstimate?.id === request.id) {
    const { recordedAt: ignoredCurrent, ...currentSemantics } = state.gateEstimate;
    const { recordedAt: ignoredCandidate, ...candidateSemantics } = candidate;
    return JSON.stringify(currentSemantics) === JSON.stringify(candidateSemantics)
      ? { ok: true, code: "PS-GATE-ESTIMATE-IDEMPOTENT", zeroWrite: true, state }
      : { ok: false, code: "PS-GATE-ESTIMATE-ID-CONFLICT" };
  }
  return { ok: true, code: "PS-GATE-ESTIMATE-PREPARED", zeroWrite: false, state: { ...state, gateEstimate: candidate } };
}

/** Every successful non-idempotent state mutation clears the estimate in the same replacement. */
export function clearGateEstimateForMutation(state) {
  if (!isObject(state) || state.gateEstimate === undefined) return state;
  const { gateEstimate: ignored, ...cleared } = state;
  return cleared;
}
