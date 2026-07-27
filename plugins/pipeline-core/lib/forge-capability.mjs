// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";

export const FORGE_CAPABILITY_SCHEMA = "pipeline.forge-capability.v1";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const SAFE_PATH = /^(?!\/)(?!.*\\)(?!.*\/\/)(?!.*\/$)(?!\.{1,2}(?:\/|$))(?!.*\/\.{1,2}(?:\/|$))[A-Za-z0-9._/@:-]{1,512}$/u;
const ROOT_KEYS = [
  "schema",
  "reportId",
  "provider",
  "baseUrlClass",
  "projectCoordinatesSha256",
  "authenticationMode",
  "cells",
  "governance",
  "evidence",
  "recordSha256",
];
const PROVIDERS = new Set(["github", "gitlab"]);
const BASE_URL_CLASSES = new Set(["github-com", "gitlab-com", "self-managed"]);
const AUTHENTICATION_MODES = new Set(["none", "operator-local", "credential-lease", "unavailable"]);
const MODES = new Set(["native", "emulated", "manual", "unsupported", "unavailable"]);
const STATUSES = new Set(["certified", "observed", "not-observed", "unsupported", "unavailable"]);
const TIERS = new Set(["baseline", "advanced", "enterprise", "unknown", "not-applicable"]);
const CAPABILITY_IDS = new Set([
  "branch-protection.observe",
  "change-request.mutate",
  "change-request.read",
  "ci.job.read",
  "ci.pipeline.mutate",
  "ci.pipeline.read",
  "governance.observe",
  "issue.mutate",
  "issue.read",
]);
const PROVIDER_PRIVATE_TERMS = /(?:pull[_-]?request|merge[_-]?request|actions|gitlab|github)/iu;

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const sortedUnique = (values, key) => Array.isArray(values)
  && values.length <= 256
  && values.every((value, index) => index === 0 || key(values[index - 1]) < key(value));
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function canonicalForgeJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalForgeJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalForgeJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function semanticDigest(domain, value) {
  return createHash("sha256").update(`${domain}\0${canonicalForgeJson(value)}`, "utf8").digest("hex");
}

export function forgeCapabilityDigest(report) {
  if (!report || typeof report !== "object" || Array.isArray(report)) return null;
  const { recordSha256, ...semantic } = report;
  return semanticDigest(FORGE_CAPABILITY_SCHEMA, semantic);
}

function validEvidence(value) {
  return exact(value, ["kind", "path", "fileSha256", "recordSha256"])
    && SAFE_ID.test(value.kind ?? "")
    && (value.path === null || (typeof value.path === "string" && SAFE_PATH.test(value.path)))
    && SHA256.test(value.fileSha256 ?? "")
    && (value.recordSha256 === null || SHA256.test(value.recordSha256 ?? ""));
}

function validEvidenceSet(values) {
  return Array.isArray(values)
    && values.length <= 64
    && values.every(validEvidence)
    && sortedUnique(values, (entry) => `${entry.kind}\0${entry.path ?? ""}\0${entry.fileSha256}\0${entry.recordSha256 ?? ""}`);
}

function validModeStatus(mode, status, evidence) {
  if (!MODES.has(mode) || !STATUSES.has(status)) return false;
  if (mode === "unsupported") return status === "unsupported" && evidence.length === 0;
  if (mode === "unavailable") return status === "unavailable";
  if (status === "unsupported" || status === "unavailable") return false;
  if (status === "observed" || status === "certified") return evidence.length > 0;
  return true;
}

function validCell(cell) {
  return exact(cell, ["capabilityId", "mode", "status", "evidence"])
    && CAPABILITY_IDS.has(cell.capabilityId)
    && !PROVIDER_PRIVATE_TERMS.test(cell.capabilityId)
    && validEvidenceSet(cell.evidence)
    && validModeStatus(cell.mode, cell.status, cell.evidence);
}

function validGovernance(observation) {
  return exact(observation, ["controlId", "mode", "status", "tier", "evidence"])
    && SAFE_ID.test(observation.controlId ?? "")
    && !PROVIDER_PRIVATE_TERMS.test(observation.controlId)
    && TIERS.has(observation.tier)
    && validEvidenceSet(observation.evidence)
    && validModeStatus(observation.mode, observation.status, observation.evidence);
}

function validationCode(report, verifyDigest = true) {
  if (!exact(report, ROOT_KEYS)) return "SHAPE:forge-root";
  if (report.schema !== FORGE_CAPABILITY_SCHEMA) return "SCHEMA:forge-capability";
  if (!SAFE_ID.test(report.reportId ?? "") || !PROVIDERS.has(report.provider)
    || !BASE_URL_CLASSES.has(report.baseUrlClass) || !SHA256.test(report.projectCoordinatesSha256 ?? "")
    || !AUTHENTICATION_MODES.has(report.authenticationMode) || !SHA256.test(report.recordSha256 ?? "")) {
    return "SHAPE:forge-scalars";
  }
  if ((report.provider === "github") !== (report.baseUrlClass === "github-com")) return "BOUND:provider-base-url";
  if (report.provider === "gitlab" && !["gitlab-com", "self-managed"].includes(report.baseUrlClass)) return "BOUND:provider-base-url";
  if (!Array.isArray(report.cells) || report.cells.length === 0 || !report.cells.every(validCell)
    || !sortedUnique(report.cells, (cell) => cell.capabilityId)) return "BOUND:forge-cells";
  if (!Array.isArray(report.governance) || !report.governance.every(validGovernance)
    || !sortedUnique(report.governance, (observation) => observation.controlId)) return "BOUND:forge-governance";
  if (!validEvidenceSet(report.evidence)) return "BOUND:forge-evidence";
  if (verifyDigest && forgeCapabilityDigest(report) !== report.recordSha256) return "CONFLICT:forge-digest";
  return null;
}

export function validateForgeCapabilityReport(report) {
  const code = validationCode(report);
  return code ? { ok: false, code } : { ok: true, code: null };
}

export function sealForgeCapabilityReport(draft) {
  if (!draft || typeof draft !== "object" || Array.isArray(draft)
    || Object.hasOwn(draft, "schema") || Object.hasOwn(draft, "recordSha256")) {
    throw new Error("SHAPE:forge-draft");
  }
  const report = {
    schema: FORGE_CAPABILITY_SCHEMA,
    ...clone(draft),
    recordSha256: "0".repeat(64),
  };
  const code = validationCode(report, false);
  if (code) throw new Error(code);
  report.recordSha256 = forgeCapabilityDigest(report);
  return deepFreeze(report);
}

function validProviderObservation(value) {
  return exact(value, ["mode", "status", "evidence"])
    && validEvidenceSet(value.evidence)
    && validModeStatus(value.mode, value.status, value.evidence);
}

const GITHUB_MAPPING = Object.freeze({
  actionsJobsRead: "ci.job.read",
  actionsPipelinesRead: "ci.pipeline.read",
  actionsPipelinesRetry: "ci.pipeline.mutate",
  branchProtectionRead: "branch-protection.observe",
  issuesRead: "issue.read",
  issuesWrite: "issue.mutate",
  pullRequestsRead: "change-request.read",
  pullRequestsWrite: "change-request.mutate",
});

/**
 * Map a closed GitHub adapter extension into the provider-neutral contract.
 * Provider-private vocabulary is consumed here and never emitted in the report.
 */
export function mapGitHubForgeObservation(input) {
  const inputKeys = [
    "reportId",
    "baseUrlClass",
    "projectCoordinatesSha256",
    "authenticationMode",
    "observations",
    "governance",
    "evidence",
  ];
  if (!exact(input, inputKeys) || input.baseUrlClass !== "github-com"
    || !exact(input.observations, Object.keys(GITHUB_MAPPING))
    || Object.entries(input.observations).some(([, value]) => !validProviderObservation(value))) {
    throw new Error("SHAPE:github-forge-observation");
  }
  const cells = Object.entries(GITHUB_MAPPING)
    .map(([providerField, capabilityId]) => ({ capabilityId, ...clone(input.observations[providerField]) }))
    .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  return sealForgeCapabilityReport({
    reportId: input.reportId,
    provider: "github",
    baseUrlClass: input.baseUrlClass,
    projectCoordinatesSha256: input.projectCoordinatesSha256,
    authenticationMode: input.authenticationMode,
    cells,
    governance: clone(input.governance),
    evidence: clone(input.evidence),
  });
}

export function hasObservedReadOnlyCapability(report) {
  if (!validateForgeCapabilityReport(report).ok) return false;
  return report.cells.some((cell) => (
    cell.capabilityId.endsWith(".read") || cell.capabilityId.endsWith(".observe")
  ) && ["native", "emulated"].includes(cell.mode) && cell.status === "observed" && cell.evidence.length > 0);
}

export const FORGE_CAPABILITY_IDS = Object.freeze([...CAPABILITY_IDS].sort());
export const FORGE_CAPABILITY_MODES = Object.freeze([...MODES]);
