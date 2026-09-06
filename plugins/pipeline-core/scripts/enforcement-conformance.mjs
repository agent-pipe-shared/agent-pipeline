#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

const TOP_LEVEL_KEYS = Object.freeze([
  "schema", "recordId", "candidate", "runner", "layer", "probeSurfaces",
  "measurement", "observations", "evaluator", "staleness", "sanitization",
  "provenance", "measuredAt",
]);
const NESTED_KEYS = Object.freeze({
  candidate: ["commit", "tree", "artifactSha256"],
  runner: ["name", "version", "pluginVersion"],
  measurement: ["status", "values"],
  observation: ["probeSurface", "hookObservation", "evidenceKind", "exitCode", "markerSha256"],
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
const PROBE_REQUEST_SCHEMA = "pipeline.enforcement-probe-request.v1";
const PROBE_RECEIPT_SCHEMA = "pipeline.enforcement-probe-receipt.v1";
const ARTIFACT_PREIMAGE_HEADER = "pipeline.enforcement-conformance.v1/a1-2-artifact-preimage";

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
  if (!Array.isArray(record.probeSurfaces) || record.probeSurfaces.length === 0) {
    throw new TypeError("probeSurfaces must be a non-empty array");
  }
  let previousSurfaceIndex = -1;
  for (const [index, probeSurface] of record.probeSurfaces.entries()) {
    enumValue(probeSurface, PROBE_SURFACES, `probeSurfaces[${index}]`);
    const surfaceIndex = PROBE_SURFACES.indexOf(probeSurface);
    if (surfaceIndex <= previousSurfaceIndex) {
      throw new TypeError("probeSurfaces must be unique and in canonical order");
    }
    previousSurfaceIndex = surfaceIndex;
  }

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

  if (!Array.isArray(record.observations) || record.observations.length !== record.probeSurfaces.length) {
    throw new TypeError("observations must exactly match probeSurfaces");
  }
  for (const [index, observation] of record.observations.entries()) {
    exactKeys(observation, NESTED_KEYS.observation, `observations[${index}]`);
    if (observation.probeSurface !== record.probeSurfaces[index]) {
      throw new TypeError("observations must correlate to probeSurfaces in order");
    }
    enumValue(observation.hookObservation, HOOK_OBSERVATIONS, `observations[${index}].hookObservation`);
    enumValue(observation.evidenceKind, EVIDENCE_KINDS, `observations[${index}].evidenceKind`);
    if (!Number.isInteger(observation.exitCode) && observation.exitCode !== null) throw new TypeError(`observations[${index}].exitCode must be an integer or null`);
    hash(observation.markerSha256, `observations[${index}].markerSha256`, { nullable: true });
  }

  exactKeys(record.evaluator, NESTED_KEYS.evaluator, "evaluator");
  enumValue(record.evaluator.outcome, EVALUATOR_OUTCOMES, "evaluator.outcome");
  string(record.evaluator.basis, "evaluator.basis");
  hash(record.evaluator.acceptanceSha256, "evaluator.acceptanceSha256", { nullable: true });
  const evidenceKinds = record.observations.map((observation) => observation.evidenceKind);
  const hasHumanAcceptance = evidenceKinds.includes("human-acceptance");
  if (hasHumanAcceptance && record.evaluator.acceptanceSha256 === null) {
    throw new TypeError("human acceptance requires bound acceptance");
  }
  if (!hasHumanAcceptance && record.evaluator.acceptanceSha256 !== null) {
    throw new TypeError("acceptance hash requires human acceptance evidence");
  }
  if (record.evaluator.outcome === "pass" &&
      evidenceKinds.some((evidenceKind) => !["deterministic-execution", "human-acceptance"].includes(evidenceKind))) {
    throw new TypeError("pass requires deterministic execution or bound human acceptance for every observation");
  }
  if (record.evaluator.outcome === "excepted" &&
      (!hasHumanAcceptance || evidenceKinds.some((evidenceKind) => ["model-attestation", "self-attestation", "unavailable"].includes(evidenceKind)))) {
    throw new TypeError("excepted requires bound human acceptance without model, self, or unavailable evidence");
  }
  if (evidenceKinds.some((evidenceKind) => ["model-attestation", "self-attestation"].includes(evidenceKind)) &&
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

function sha256(bytes) {
  return createHash("sha256").update(bytes, "utf8").digest("hex");
}

function canonicalSurfaces(surfaces) {
  if (!Array.isArray(surfaces) || surfaces.length === 0) throw new TypeError("probe surfaces must be a non-empty array");
  const canonical = [...surfaces].sort((left, right) => PROBE_SURFACES.indexOf(left) - PROBE_SURFACES.indexOf(right));
  if (canonical.some((surface, index) => !PROBE_SURFACES.includes(surface) || canonical.indexOf(surface) !== index)) {
    throw new TypeError("probe surfaces must be approved and unique");
  }
  return canonical;
}

function requireAdapter(adapters, name) {
  const adapter = adapters?.[name];
  if (!adapter || typeof adapter !== "object") throw new TypeError(`missing ${name} adapter`);
  return adapter;
}

function requireMethod(adapter, method, adapterName) {
  if (typeof adapter[method] !== "function") throw new TypeError(`${adapterName}.${method} must be a function`);
  return adapter[method].bind(adapter);
}

function validateRunner(runner) {
  exactKeys(runner, NESTED_KEYS.runner, "runner metadata");
  string(runner.name, "runner metadata name");
  string(runner.version, "runner metadata version");
  string(runner.pluginVersion, "runner metadata plugin version");
  createRecordId(runner.name, "runner-hook");
  return runner;
}

function validateCandidate(candidate) {
  exactKeys(candidate, NESTED_KEYS.candidate, "candidate binding");
  hash(candidate.commit, "candidate binding commit", { oid: true });
  hash(candidate.tree, "candidate binding tree", { oid: true });
  hash(candidate.artifactSha256, "candidate binding artifact", { oid: false });
  return candidate;
}

function commandIdForSurface(surface) {
  if (surface === "git-hook") return "guarded-push-refusal";
  return surface === "payload-indirection" ? "compound-shell-payload" : "compound-shell-refusal";
}

function safeExitCode(result) {
  return Number.isInteger(result?.exitCode) ? result.exitCode : null;
}

function observationFromReceipt(receipt, marker) {
  const covered = marker?.status === "covered";
  const markerSha256 = covered && typeof marker.markerSha256 === "string" ? marker.markerSha256 : null;
  if (markerSha256 !== null) hash(markerSha256, "marker markerSha256");
  const executionAvailable = ["allowed", "refused"].includes(receipt.executionStatus);
  return {
    probeSurface: receipt.probeSurface,
    hookObservation: classifyHookObservation({ fired: markerSha256 !== null, markerAvailable: covered }),
    evidenceKind: executionAvailable && covered ? receipt.executionEvidenceKind : "unavailable",
    exitCode: receipt.exitCode,
    markerSha256,
  };
}

export function digestProbeReceipt(receipt) {
  return sha256(JSON.stringify(receipt));
}

function markerBoundToReceipt(marker, receipt) {
  if (!marker || marker.status !== "covered") return { status: marker?.status ?? "unavailable", markerSha256: null };
  if (marker.receiptSha256 !== digestProbeReceipt(receipt)) return { status: "unknown", markerSha256: null };
  return { status: "covered", markerSha256: marker.markerSha256 ?? null };
}

function evaluatorFor(observations, evidenceScope, executionStatuses, markerStatuses) {
  if (evidenceScope !== "native") return { outcome: "unavailable", basis: "fixture-only simulation is not live enforcement", acceptanceSha256: null };
  if (executionStatuses.includes("unsupported")) {
    return { outcome: "unsupported", basis: "native adapter does not support this surface", acceptanceSha256: null };
  }
  if (markerStatuses.includes("unknown")) {
    return { outcome: "unknown", basis: "marker adapter could not classify coverage", acceptanceSha256: null };
  }
  if (observations.some((observation) => observation.evidenceKind === "unavailable")) {
    return { outcome: "unavailable", basis: "adapter or marker evidence unavailable", acceptanceSha256: null };
  }
  if (observations.some((observation) => observation.hookObservation === "fires-not")) {
    return { outcome: "finding", basis: "native marker coverage confirms a hook did not fire", acceptanceSha256: null };
  }
  if (executionStatuses.includes("allowed")) {
    return { outcome: "finding", basis: "canonical refused shape was allowed", acceptanceSha256: null };
  }
  return { outcome: "unavailable", basis: "injected adapter evidence is not a live native runner measurement", acceptanceSha256: null };
}

/**
 * Hashes the exact A1-2 artifact preimage: UTF-8 of the fixed header, then every
 * caller-supplied relative artifact path and its exact bytes, each byte-length-framed.
 * The conformance record is deliberately not an input, so artifactSha256 cannot
 * hash the record which contains it. Callers bind module/fixture bytes before
 * constructing a record and never include generated evidence records here.
 */
export function digestArtifactPreimage(artifacts) {
  if (!Array.isArray(artifacts) || artifacts.length === 0) throw new TypeError("artifact preimage needs at least one artifact");
  const chunks = [ARTIFACT_PREIMAGE_HEADER];
  for (const artifact of artifacts) {
    if (!artifact || typeof artifact.path !== "string" || artifact.path.length === 0 || artifact.path.includes("\u0000") || artifact.path.startsWith("/") || artifact.path.startsWith("\\") || artifact.path.includes("\\") || /^[A-Za-z]:[\\/]/u.test(artifact.path) || artifact.path.split("/").includes("..")) {
      throw new TypeError("artifact path must be a relative non-traversing path");
    }
    if (typeof artifact.bytes !== "string") throw new TypeError("artifact bytes must be a string");
    chunks.push(`${Buffer.byteLength(artifact.path, "utf8")}:${artifact.path}`, `${Buffer.byteLength(artifact.bytes, "utf8")}:${artifact.bytes}`);
  }
  return sha256(chunks.join("\u0000"));
}

export function createProbeRequest({ candidate, runner, layer, probeSurface, fixtureId }) {
  validateCandidate(candidate);
  validateRunner(runner);
  enumValue(layer, ENFORCEMENT_LAYERS, "probe layer");
  enumValue(probeSurface, PROBE_SURFACES, "probe surface");
  string(fixtureId, "fixture id");
  return Object.freeze({
    schema: PROBE_REQUEST_SCHEMA,
    candidate: { ...candidate },
    runner: { ...runner },
    layer,
    probeSurface,
    fixtureId,
    commandId: commandIdForSurface(probeSurface),
  });
}

/**
 * Executes only through injected adapters. Native runner bridges intentionally do
 * not exist here: a caller without one must report adapter evidence unavailable.
 */
export async function runProbeMatrix({ layer = "runner-hook", surfaces = PROBE_SURFACES, adapters, fixtureIds = {}, evidenceScope = "fixture" } = {}) {
  enumValue(layer, ENFORCEMENT_LAYERS, "probe layer");
  if (!["fixture", "native"].includes(evidenceScope)) throw new TypeError("evidence scope must be fixture or native");
  const runnerMetadata = requireMethod(requireAdapter(adapters, "runnerMetadata"), "read", "runnerMetadata");
  const readBinding = requireMethod(requireAdapter(adapters, "gitBinding"), "read", "gitBinding");
  const now = requireMethod(requireAdapter(adapters, "clock"), "now", "clock");
  const execute = requireMethod(requireAdapter(adapters, "execution"), "execute", "execution");
  const readMarker = requireMethod(requireAdapter(adapters, "observationMarkers"), "read", "observationMarkers");
  const allocate = requireMethod(requireAdapter(adapters, "scratch"), "allocate", "scratch");
  const runner = Object.freeze({ ...validateRunner(await runnerMetadata()) });
  const candidate = Object.freeze({ ...validateCandidate(await readBinding()) });
  const probeSurfaces = canonicalSurfaces(surfaces);
  const observations = [];
  const commandIds = [];
  const executionStatuses = [];
  const markerStatuses = [];
  for (const probeSurface of probeSurfaces) {
    const fixtureId = fixtureIds[probeSurface] ?? `a1-2-${probeSurface.replaceAll("/", "-")}`;
    const request = createProbeRequest({ candidate, runner, layer, probeSurface, fixtureId });
    const scratch = probeSurface === "payload-indirection" ? await allocate({ request, disposable: true }) : null;
    let result;
    try {
      result = await execute({ request, scratch });
    } catch {
      result = { status: "error", exitCode: null };
    }
    const receipt = Object.freeze({
      schema: PROBE_RECEIPT_SCHEMA,
      candidate: { ...candidate },
      runner: { ...runner },
      layer,
      probeSurface,
      executionStatus: ["allowed", "refused", "error", "unavailable", "unsupported"].includes(result?.status) ? result.status : "error",
      executionEvidenceKind: EVIDENCE_KINDS.includes(result?.evidenceKind) ? result.evidenceKind : "unavailable",
      exitCode: safeExitCode(result),
    });
    let marker;
    try {
      marker = await readMarker({ request, receipt });
    } catch {
      marker = { status: "unavailable", markerSha256: null };
    }
    marker = markerBoundToReceipt(marker, receipt);
    observations.push(observationFromReceipt(receipt, marker));
    commandIds.push(request.commandId);
    executionStatuses.push(receipt.executionStatus);
    markerStatuses.push(typeof marker?.status === "string" ? marker.status : "unavailable");
  }
  const unavailable = observations.some((observation) => observation.evidenceKind === "unavailable");
  const finalRunner = Object.freeze({ ...validateRunner(await runnerMetadata()) });
  const finalCandidate = Object.freeze({ ...validateCandidate(await readBinding()) });
  const candidateChanged = ["commit", "tree", "artifactSha256"].some((field) => candidate[field] !== finalCandidate[field]);
  const runnerChanged = ["name", "version", "pluginVersion"].some((field) => runner[field] !== finalRunner[field]);
  const invalidatedBy = candidateChanged ? "candidate-binding-changed-during-probe" : runnerChanged ? "runner-metadata-changed-during-probe" : null;
  const measurement = unavailable
    ? { status: "unavailable", values: [] }
    : { status: "measured", values: [] };
  const sourceSha256 = candidate.artifactSha256;
  const record = {
    schema: "pipeline.enforcement-conformance.v1",
    recordId: createRecordId(runner.name, layer),
    candidate,
    runner,
    layer,
    probeSurfaces,
    measurement,
    observations,
    evaluator: evaluatorFor(observations, evidenceScope, executionStatuses, markerStatuses),
    staleness: { status: invalidatedBy === null ? "current" : "stale", runnerVersion: runner.version, pluginVersion: runner.pluginVersion, invalidatedBy },
    sanitization: { policy: "redact-sensitive-shapes-v1", redactions: ["raw-stdout-omitted", "private-paths-omitted"] },
    provenance: { commandSha256: sha256(commandIds.join("\u0000")), fixtureIds: probeSurfaces.map((surface) => fixtureIds[surface] ?? `a1-2-${surface.replaceAll("/", "-")}`), sourceSha256 },
    measuredAt: now(),
  };
  validateRecord(record);
  return sanitizeRecord(record);
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
  if (record.staleness.status !== "current") return { qualifies: false, reason: "stale-record" };
  if (record.staleness.runnerVersion !== expected.runnerVersion || record.staleness.pluginVersion !== expected.pluginVersion) return { qualifies: false, reason: "staleness-version-mismatch" };
  return { qualifies: true, reason: null };
}

export function sanitizeValue(value) {
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (!value || typeof value !== "object") {
    if (typeof value !== "string") return value;
    let safe = value.normalize("NFKC");
    safe = safe.replace(/-{5}BEGIN[\w ]*PRIVATE KEY-{5}[\s\S]*?-{5}END[\w ]*PRIVATE KEY-{5}/giu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/[^\n]*[\u0000-\u0009\u000b\u000c\u000e-\u001f\u007f-\u009f\u2028\u2029][^\n]*/gu, "[REDACTED-CONTROL]");
    safe = safe.replace(/(?<![A-Za-z0-9])(?:authorization|x[-_]?api[-_]?key|api[-_ ]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|secret|password|passwd|pwd|set[-_]?cookie|cookie)\b["']?\s*[:=]\s*(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|(?:bearer|basic)\s+[^\s,;}\]]+|[^\s,;}\]]+)/giu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?<![A-Za-z0-9])(?:authorization|x[-_]?api[-_]?key|api[-_ ]?key|access[-_]?token|refresh[-_]?token|client[-_]?secret|token|secret|password|passwd|pwd|set[-_]?cookie|cookie)\b\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[^\s,;}\]]+)/giu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?<![A-Za-z0-9])bearer\s+[^\s,;}\]]+/giu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?<![A-Za-z0-9])basic\s+[A-Za-z0-9+/]{8,}={0,2}(?![A-Za-z0-9+/=])/giu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/giu, "[REDACTED-ORG-COORDINATE]");
    safe = safe.replace(/(?<![A-Za-z0-9])(?:[A-Za-z0-9._-]+@)?[A-Za-z0-9.-]+\.[a-z]{2,63}:[^\s"'<>]+/giu, "[REDACTED-ORG-COORDINATE]");
    safe = safe.replace(/(?<![A-Za-z0-9_-])(?:sk-[A-Za-z0-9_-]{8,16384}|gh[pousr]_[A-Za-z0-9]{8,16384}|github_pat_[A-Za-z0-9_]{8,16384}|AKIA[0-9A-Z]{16})(?![A-Za-z0-9_-])/gu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{1,16384}\.[A-Za-z0-9_-]{4,16384}\.[A-Za-z0-9_-]{4,16384}(?![A-Za-z0-9_-])/gu, "[REDACTED-CREDENTIAL]");
    safe = safe.replace(/(?:^|\s)(?:assistant|user|system|tool)\s*:\s*[^\n]*/giu, " [REDACTED-TRANSCRIPT]");
    safe = safe.replace(/(?<![A-Za-z0-9\\])\\\\[^\\/\s"'<>|?*\u0000-\u001f]+\\[^\\/\s"'<>|?*\u0000-\u001f]+(?:\\[^\\/\s"'<>|?*\u0000-\u001f]+)*/gu, "[REDACTED-PATH]");
    safe = safe.replace(/(?<![A-Za-z0-9])(?:[A-Za-z]:[\\/])(?:[^\s\\/"'<>|?*\u0000-\u001f]+[\\/])*[^\s\\/"'<>|?*\u0000-\u001f]*/gu, "[REDACTED-PATH]");
    safe = safe.replace(/(?<![A-Za-z0-9.:/\\])\/(?:[^\s/\\:"'<>|?*\u0000-\u001f]+\/)*[^\s/\\:"'<>|?*\u0000-\u001f]*/gu, "[REDACTED-PATH]");
    return safe;
  }
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, sanitizeValue(nested)]));
}

export function sanitizeRecord(record) {
  const safe = sanitizeValue(record);
  validateRecord(safe);
  return safe;
}
