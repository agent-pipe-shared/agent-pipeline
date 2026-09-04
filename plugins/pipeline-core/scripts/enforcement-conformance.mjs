#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

const TOP_LEVEL_KEYS = Object.freeze([
  "schema", "recordId", "candidate", "runner", "layer", "probeSurface",
  "measurement", "observation", "evaluator", "staleness", "sanitization",
  "provenance", "measuredAt",
]);
const NESTED_KEYS = Object.freeze({
  candidate: ["commit", "tree", "artifactSha256"],
  runner: ["name", "version", "pluginVersion"],
  measurement: ["status", "values"],
  observation: ["hookObservation", "evidenceKind", "exitCode", "markerSha256"],
  evaluator: ["outcome", "basis", "acceptanceSha256"],
  staleness: ["status", "runnerVersion", "pluginVersion", "invalidatedBy"],
  sanitization: ["policy", "redactions"],
  provenance: ["commandSha256", "fixtureIds", "sourceSha256"],
});

export const MEASUREMENT_STATUSES = Object.freeze(["measured", "estimated", "unavailable", "unknown"]);
export const EVALUATOR_OUTCOMES = Object.freeze(["pass", "finding", "unavailable", "unsupported", "unknown", "excepted"]);
export const HOOK_OBSERVATIONS = Object.freeze(["fires", "fires-not", "unknown"]);
export const ENFORCEMENT_LAYERS = Object.freeze(["git-hook", "tool-scope", "runner-hook", "posthoc-verify", "prose"]);
export const PROBE_SURFACES = Object.freeze(["runner-hook/orchestrator", "runner-hook/subagent", "payload-indirection", "git-hook"]);
export const EVIDENCE_KINDS = Object.freeze(["deterministic-execution", "model-attestation", "self-attestation", "human-acceptance", "unavailable"]);

const HEX64 = /^[0-9a-f]{64}$/;
const GIT_OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const RUNNER_NAME = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has non-canonical keys`);
  }
}

function enumValue(value, values, label) {
  if (!values.includes(value)) throw new TypeError(`${label} is not an approved enum value`);
}

function hash(value, label, { oid = false, nullable = false } = {}) {
  if (nullable && value === null) return;
  if (typeof value !== "string" || !(oid ? GIT_OID : HEX64).test(value)) throw new TypeError(`${label} is not a lowercase hash`);
}

function string(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(`${label} must be a non-empty string`);
}

export function createRecordId(runnerName, layer) {
  string(runnerName, "runner.name");
  enumValue(layer, ENFORCEMENT_LAYERS, "layer");
  if (!RUNNER_NAME.test(runnerName)) throw new TypeError("runner.name is not a canonical identifier");
  return `${runnerName}:${layer}`;
}

export function validateRecord(record) {
  exactKeys(record, TOP_LEVEL_KEYS, "record");
  if (record.schema !== "pipeline.enforcement-conformance.v1") throw new TypeError("schema mismatch");
  exactKeys(record.candidate, NESTED_KEYS.candidate, "candidate");
  hash(record.candidate.commit, "candidate.commit", { oid: true });
  hash(record.candidate.tree, "candidate.tree", { oid: true });
  hash(record.candidate.artifactSha256, "candidate.artifactSha256");
  exactKeys(record.runner, NESTED_KEYS.runner, "runner");
  string(record.runner.name, "runner.name");
  string(record.runner.version, "runner.version");
  string(record.runner.pluginVersion, "runner.pluginVersion");
  if (record.recordId !== createRecordId(record.runner.name, record.layer)) throw new TypeError("recordId mismatch");
  enumValue(record.layer, ENFORCEMENT_LAYERS, "layer");
  enumValue(record.probeSurface, PROBE_SURFACES, "probeSurface");

  exactKeys(record.measurement, NESTED_KEYS.measurement, "measurement");
  enumValue(record.measurement.status, MEASUREMENT_STATUSES, "measurement.status");
  if (!Array.isArray(record.measurement.values)) throw new TypeError("measurement.values must be an array");
  for (const [index, item] of record.measurement.values.entries()) {
    exactKeys(item, ["name", "value", "unit"], `measurement.values[${index}]`);
    string(item.name, "measurement value name");
    string(item.unit, "measurement value unit");
    if (typeof item.value !== "number" || !Number.isFinite(item.value)) throw new TypeError("measurement value must be finite");
  }
  if (["unavailable", "unknown"].includes(record.measurement.status) && record.measurement.values.length !== 0) {
    throw new TypeError("absent telemetry must not be represented as values");
  }

  exactKeys(record.observation, NESTED_KEYS.observation, "observation");
  enumValue(record.observation.hookObservation, HOOK_OBSERVATIONS, "observation.hookObservation");
  enumValue(record.observation.evidenceKind, EVIDENCE_KINDS, "observation.evidenceKind");
  if (!Number.isInteger(record.observation.exitCode) && record.observation.exitCode !== null) throw new TypeError("observation.exitCode must be an integer or null");
  hash(record.observation.markerSha256, "observation.markerSha256", { nullable: true });

  exactKeys(record.evaluator, NESTED_KEYS.evaluator, "evaluator");
  enumValue(record.evaluator.outcome, EVALUATOR_OUTCOMES, "evaluator.outcome");
  string(record.evaluator.basis, "evaluator.basis");
  hash(record.evaluator.acceptanceSha256, "evaluator.acceptanceSha256", { nullable: true });
  if (record.evaluator.outcome === "pass" &&
      !(record.observation.evidenceKind === "deterministic-execution" ||
        (record.observation.evidenceKind === "human-acceptance" && record.evaluator.acceptanceSha256 !== null))) {
    throw new TypeError("pass requires deterministic execution or bound human acceptance");
  }
  if (record.observation.evidenceKind === "human-acceptance" &&
      ["pass", "excepted"].includes(record.evaluator.outcome) && record.evaluator.acceptanceSha256 === null) {
    throw new TypeError("human acceptance pass/excepted requires bound acceptance");
  }
  if (record.observation.evidenceKind !== "human-acceptance" && record.evaluator.acceptanceSha256 !== null) {
    throw new TypeError("acceptance hash requires human acceptance evidence");
  }
  if (["model-attestation", "self-attestation"].includes(record.observation.evidenceKind) &&
      ["pass", "excepted"].includes(record.evaluator.outcome)) {
    throw new TypeError("model and self-attestation cannot produce pass or excepted");
  }

  exactKeys(record.staleness, NESTED_KEYS.staleness, "staleness");
  enumValue(record.staleness.status, ["current", "stale"], "staleness.status");
  string(record.staleness.runnerVersion, "staleness.runnerVersion");
  string(record.staleness.pluginVersion, "staleness.pluginVersion");
  if (record.staleness.invalidatedBy !== null) string(record.staleness.invalidatedBy, "staleness.invalidatedBy");
  if (record.staleness.runnerVersion !== record.runner.version || record.staleness.pluginVersion !== record.runner.pluginVersion) throw new TypeError("staleness version drift");
  if (record.staleness.status === "current" && record.staleness.invalidatedBy !== null) throw new TypeError("current record cannot be invalidated");
  if (record.staleness.status === "stale" && (record.staleness.invalidatedBy === null || record.staleness.invalidatedBy.length === 0)) throw new TypeError("stale record requires invalidation reason");
  if (record.staleness.status === "stale" && record.evaluator.outcome === "pass") throw new TypeError("stale record cannot pass");

  exactKeys(record.sanitization, NESTED_KEYS.sanitization, "sanitization");
  string(record.sanitization.policy, "sanitization.policy");
  if (!Array.isArray(record.sanitization.redactions) || record.sanitization.redactions.some((item) => typeof item !== "string")) throw new TypeError("sanitization.redactions must be string[]");
  exactKeys(record.provenance, NESTED_KEYS.provenance, "provenance");
  hash(record.provenance.commandSha256, "provenance.commandSha256", { nullable: true });
  hash(record.provenance.sourceSha256, "provenance.sourceSha256", { nullable: true });
  if (!Array.isArray(record.provenance.fixtureIds) || record.provenance.fixtureIds.some((item) => typeof item !== "string" || item.length === 0)) throw new TypeError("provenance.fixtureIds must be string[]");
  if (!ISO_UTC.test(record.measuredAt) || new Date(record.measuredAt).toISOString() !== record.measuredAt) throw new TypeError("measuredAt must be canonical UTC ISO-8601");
  return true;
}

export function classifyHookObservation({ fired, markerAvailable = false } = {}) {
  if (fired === true) return "fires";
  if (fired === false && markerAvailable) return "fires-not";
  return "unknown";
}

export function checkCandidateBinding(record, expected) {
  // This function validates and qualifies a complete record; malformed input throws, while
  // a well-formed but non-qualifying record returns a typed false reason.
  try {
    validateRecord(record);
  } catch (error) {
    if (error instanceof TypeError && error.message === "staleness version drift") return { qualifies: false, reason: "staleness-version-mismatch" };
    throw error;
  }
  if (record.evaluator.outcome !== "pass") return { qualifies: false, reason: "evaluator-outcome-not-pass" };
  const fields = ["commit", "tree", "artifactSha256"];
  const mismatch = fields.find((field) => record.candidate[field] !== expected[field]);
  if (mismatch) return { qualifies: false, reason: `candidate.${mismatch}-mismatch` };
  if (record.runner.version !== expected.runnerVersion || record.runner.pluginVersion !== expected.pluginVersion) return { qualifies: false, reason: "runner-or-plugin-version-mismatch" };
  if (record.staleness.runnerVersion !== expected.runnerVersion || record.staleness.pluginVersion !== expected.pluginVersion) return { qualifies: false, reason: "staleness-version-mismatch" };
  if (record.staleness.status !== "current") return { qualifies: false, reason: "stale-record" };
  return { qualifies: true, reason: null };
}

export function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    let safe = value;
    safe = safe.replace(/-----BEGIN[\s\S]*?-----END[^-]*-----/gi, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/\bbearer\s+[^\s,;]+/gi, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/\b(?:token|password|passwd|secret|api[_-]?key)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?:^|\s)(?:[A-Za-z]:[\\/]|\/)(?:Users|home|private|tmp|var|root)(?:[\\/][^\s]*)?/gi, " [REDACTED-PATH]");
    safe = safe.replace(/(?:git@|https?:\/\/)?github\.com[:/][^\s]+/gi, "[REDACTED-ORG-COORDINATE]");
    safe = safe.replace(/(?:^|\s)(?:assistant|user|system)\s*:/gi, " [REDACTED-TRANSCRIPT]:");
    return safe;
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested)]));
}

export function sanitizeRecord(record) {
  const safe = sanitizeValue(record);
  validateRecord(safe);
  return safe;
}
