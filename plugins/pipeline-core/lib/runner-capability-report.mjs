// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const RUNNER_CAPABILITY_REPORT_SCHEMA = "pipeline.runner-capability-report.v1";

const SHA256 = /^[0-9a-f]{64}$/u;
const GIT_SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
const ROOT = ["schema", "reportId", "identity", "environment", "capacity", "cells", "assurance", "bindings", "recordSha256"];
const UNITS = new Set(["concurrent-tasks", "logical-subagents", "worker-processes", "workspaces", "cpu-millicores", "memory-bytes", "external-jobs"]);
const SOURCES = new Set(["advertised", "certified", "observed", "reserved", "effective"]);
const CAPACITY_STATUSES = new Set(["known", "unknown", "unavailable"]);
const MODES = new Set(["native", "functional-equivalent", "synthetic", "unsupported", "unavailable"]);
const CELL_STATUSES = new Set(["certified", "observed", "unsupported", "unavailable"]);
const ASSURANCE_STATUSES = new Set(["observed", "not-observed", "unavailable"]);

const exact = (value, keys) => value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const isString = (value) => typeof value === "string" && value.length > 0;
const sortedUnique = (values, key) => values.every((value, index) => index === 0 || key(values[index - 1]) < key(value));
const frozen = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) frozen(child);
  }
  return value;
};

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

export function runnerCapabilityReportDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return createHash("sha256").update(canonicalJson(semantic), "utf8").digest("hex");
}

function code(prefix, condition) { return condition ? null : `${prefix}:invalid`; }

function validateEvidence(value) {
  return exact(value, ["kind", "path", "fileSha256", "recordSha256"])
    && isString(value.kind) && (value.path === null || isString(value.path))
    && SHA256.test(value.fileSha256) && (value.recordSha256 === null || SHA256.test(value.recordSha256));
}

function validateCapacity(value) {
  return exact(value, ["unit", "value", "source", "status"])
    && UNITS.has(value.unit) && SOURCES.has(value.source) && CAPACITY_STATUSES.has(value.status)
    && (value.status === "known" ? Number.isSafeInteger(value.value) && value.value >= 0 : value.value === null);
}

function validateCell(value) {
  if (!exact(value, ["capabilityId", "mode", "status", "evidence"]) || !isString(value.capabilityId)
    || !MODES.has(value.mode) || !CELL_STATUSES.has(value.status) || !Array.isArray(value.evidence)
    || !value.evidence.every(validateEvidence) || !sortedUnique(value.evidence, (item) => `${item.kind}\u0000${item.path ?? ""}\u0000${item.fileSha256}\u0000${item.recordSha256 ?? ""}`)) return false;
  if (value.mode === "unsupported") return value.status === "unsupported" && value.evidence.length === 0;
  if (value.mode === "unavailable") return value.status === "unavailable";
  return true;
}

function validationCode(record, verifyDigest = true) {
  if (!exact(record, ROOT)) return "SHAPE:root";
  if (record.schema !== RUNNER_CAPABILITY_REPORT_SCHEMA) return "SCHEMA:version";
  if (!isString(record.reportId) || !SHA256.test(record.recordSha256)) return "SHAPE:scalar";
  if (!exact(record.identity, ["adapterId", "adapterVersion", "implementationSha256", "requestedRunner", "requestedModel", "observedRunner", "observedModel"])
    || !isString(record.identity.adapterId) || !isString(record.identity.adapterVersion) || !SHA256.test(record.identity.implementationSha256)
    || !isString(record.identity.requestedRunner) || !isString(record.identity.requestedModel)
    || !(record.identity.observedRunner === "not-observed" || isString(record.identity.observedRunner))
    || !(record.identity.observedModel === "not-observed" || isString(record.identity.observedModel))) return "SHAPE:identity";
  if ((record.identity.observedRunner === "not-observed") !== (record.identity.observedModel === "not-observed")) return "BOUND:observed-identity";
  if (!exact(record.environment, ["platformClass", "architectureClass", "hostClass", "fingerprintSha256"])
    || !isString(record.environment.platformClass) || !isString(record.environment.architectureClass)
    || !isString(record.environment.hostClass) || !SHA256.test(record.environment.fingerprintSha256)) return "SHAPE:environment";
  if (!Array.isArray(record.capacity) || record.capacity.length === 0 || !record.capacity.every(validateCapacity)
    || !sortedUnique(record.capacity, (item) => `${item.unit}\u0000${item.source}`)) return "BOUND:capacity";
  if (!Array.isArray(record.cells) || record.cells.length === 0 || !record.cells.every(validateCell)
    || !sortedUnique(record.cells, (item) => item.capabilityId)) return "BOUND:cells";
  const ids = new Set(record.cells.map((cell) => cell.capabilityId));
  if (!["synthetic-contract", "claude-native-review", "codex-native-readonly", "unsupported-live-worker"].every((id) => ids.has(id))) return "BOUND:baseline-matrix";
  if (!exact(record.assurance, ["workspace", "process", "filesystem", "network", "os"])) return "SHAPE:assurance";
  for (const section of Object.values(record.assurance)) {
    if (!exact(section, ["status", "evidenceSha256"]) || !ASSURANCE_STATUSES.has(section.status)
      || !(section.evidenceSha256 === null || SHA256.test(section.evidenceSha256))
      || (section.status === "not-observed" && section.evidenceSha256 !== null)) return "SHAPE:assurance-value";
  }
  if (!exact(record.bindings, ["suiteVersion", "candidate", "authorityDigests", "rawEvidenceSha256"])
    || !isString(record.bindings.suiteVersion) || !exact(record.bindings.candidate, ["commit", "tree"])
    || !GIT_SHA.test(record.bindings.candidate.commit) || !GIT_SHA.test(record.bindings.candidate.tree)
    || !Array.isArray(record.bindings.authorityDigests) || !record.bindings.authorityDigests.every((item) => exact(item, ["kind", "sha256"]) && isString(item.kind) && SHA256.test(item.sha256))
    || !sortedUnique(record.bindings.authorityDigests, (item) => `${item.kind}\u0000${item.sha256}`)
    || !Array.isArray(record.bindings.rawEvidenceSha256) || !record.bindings.rawEvidenceSha256.every((item) => SHA256.test(item))
    || !sortedUnique(record.bindings.rawEvidenceSha256, (item) => item)) return "BOUND:bindings";
  if (record.cells.some((cell) => cell.status === "certified" && cell.evidence.some((item) => item.kind === "runner-self-report"))) return "AUTHORITY:runner-self-report";
  if (verifyDigest && runnerCapabilityReportDigest(record) !== record.recordSha256) return "CONFLICT:digest";
  return null;
}

export function validateRunnerCapabilityReport(record) {
  const failure = validationCode(record);
  return failure ? { ok: false, code: failure } : { ok: true, code: null };
}

export function sealRunnerCapabilityReport(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft) || Object.hasOwn(draft, "recordSha256")) throw new Error("SHAPE:draft");
  const record = { ...draft, recordSha256: "0".repeat(64) };
  const failure = validationCode(record, false);
  if (failure) throw new Error(failure);
  record.recordSha256 = runnerCapabilityReportDigest(record);
  return frozen(record);
}

export function effectiveConcurrentTasks(capacity) {
  if (!Array.isArray(capacity)) return null;
  const effective = capacity.find((item) => item && item.unit === "concurrent-tasks" && item.source === "effective");
  return effective?.status === "known" && Number.isSafeInteger(effective.value) && effective.value >= 0 ? effective.value : null;
}
