#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import { createHash } from "node:crypto";
import {
  canonicalForgeJson,
  sealForgeCapabilityReport,
} from "../lib/forge-capability.mjs";
import { isDirectInvocation } from "../lib/entrypoint.mjs";

export const EXTERNAL_MUTATION_SCHEMA = "pipeline.external-mutation.v1";
export const GITLAB_FORGE_ADAPTER_VERSION = "1.0.0";

const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const PROJECT_PATH = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?(?:\/[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)+$/u;
const DNS_HOST = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,63}$/u;
const AUTHENTICATION_MODES = new Set(["none", "operator-local", "credential-lease", "unavailable"]);
const MUTATION_STATES = new Set([
  "requested",
  "previewed",
  "confirmed",
  "applied-unverified",
  "readback-verified",
  "rejected",
  "expired",
  "failed",
  "partial",
  "unknown",
  "mismatch",
]);
const OPERATIONS = Object.freeze({
  "change-request.create": "change-request.mutate",
  "change-request.update-content": "change-request.mutate",
  "ci.pipeline.retry": "ci.pipeline.mutate",
  "issue.create": "issue.mutate",
  "issue.update-content": "issue.mutate",
});
const OBJECT_TYPES = new Set(["issue", "change-request", "ci-pipeline", "ci-job", "branch-protection", "governance"]);
const ROOT_KEYS = [
  "schema",
  "mutationId",
  "provider",
  "target",
  "beforeSha256",
  "patch",
  "operation",
  "idempotencyKey",
  "capabilitySha256",
  "preview",
  "confirmation",
  "state",
  "remoteReceipt",
  "readback",
  "previousSha256",
  "recordSha256",
];

const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
const clone = (value) => structuredClone(value);

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function mutationDigestValue(value) {
  return createHash("sha256")
    .update(`${EXTERNAL_MUTATION_SCHEMA}\0${canonicalForgeJson(value)}`, "utf8")
    .digest("hex");
}

export function resolveGitLabTarget(input) {
  if (!exact(input, ["baseUrl", "projectPath", "authenticationMode"])
    || typeof input.baseUrl !== "string" || typeof input.projectPath !== "string"
    || Buffer.byteLength(input.baseUrl, "utf8") > 512 || Buffer.byteLength(input.projectPath, "utf8") > 512
    || !AUTHENTICATION_MODES.has(input.authenticationMode)
    || !PROJECT_PATH.test(input.projectPath) || input.projectPath.includes("..")) {
    return { ok: false, code: "SHAPE:gitlab-target", target: null };
  }

  let parsed;
  try {
    parsed = new URL(input.baseUrl);
  } catch {
    return { ok: false, code: "SHAPE:gitlab-base-url", target: null };
  }
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash
    || parsed.pathname !== "/" || input.baseUrl !== parsed.origin) {
    return { ok: false, code: "BOUND:gitlab-base-url", target: null };
  }

  const baseUrlClass = parsed.hostname === "gitlab.com" ? "gitlab-com" : "self-managed";
  if (baseUrlClass === "self-managed" && (!DNS_HOST.test(parsed.hostname)
    || parsed.hostname === "localhost" || parsed.hostname.endsWith(".local"))) {
    return { ok: false, code: "BOUND:gitlab-self-managed-host", target: null };
  }
  const baseUrlSha256 = sha256(`${baseUrlClass}\0${parsed.origin}`);
  const projectCoordinatesSha256 = sha256(`${baseUrlClass}\0${parsed.origin}\0${input.projectPath}`);
  return {
    ok: true,
    code: null,
    target: deepFreeze({
      provider: "gitlab",
      baseUrlClass,
      baseUrlSha256,
      projectCoordinatesSha256,
      authenticationMode: input.authenticationMode,
    }),
  };
}

const GITLAB_MAPPING = Object.freeze({
  issuesRead: "issue.read",
  issuesWrite: "issue.mutate",
  jobsRead: "ci.job.read",
  mergeRequestsRead: "change-request.read",
  mergeRequestsWrite: "change-request.mutate",
  pipelinesRead: "ci.pipeline.read",
  pipelinesRetry: "ci.pipeline.mutate",
  protectedBranchesRead: "branch-protection.observe",
});

/**
 * Consume a closed, synthetic GitLab extension observation and emit only the
 * neutral forge contract. This function has no network or credential path.
 */
export function mapGitLabForgeObservation(input) {
  if (!exact(input, ["reportId", "target", "observations", "governance", "evidence"])
    || !exact(input.target, ["provider", "baseUrlClass", "baseUrlSha256", "projectCoordinatesSha256", "authenticationMode"])
    || input.target.provider !== "gitlab" || !SHA256.test(input.target.baseUrlSha256 ?? "")
    || !exact(input.observations, Object.keys(GITLAB_MAPPING))) {
    throw new Error("SHAPE:gitlab-forge-observation");
  }
  const cells = Object.entries(GITLAB_MAPPING)
    .map(([providerField, capabilityId]) => ({ capabilityId, ...clone(input.observations[providerField]) }))
    .sort((left, right) => left.capabilityId.localeCompare(right.capabilityId));
  return sealForgeCapabilityReport({
    reportId: input.reportId,
    provider: "gitlab",
    baseUrlClass: input.target.baseUrlClass,
    projectCoordinatesSha256: input.target.projectCoordinatesSha256,
    authenticationMode: input.target.authenticationMode,
    cells,
    governance: clone(input.governance),
    evidence: clone(input.evidence),
  });
}

export function externalMutationDigest(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return null;
  const { recordSha256, ...semantic } = record;
  return mutationDigestValue(semantic);
}

function validTarget(value) {
  return exact(value, ["provider", "baseUrlClass", "projectCoordinatesSha256", "objectType", "objectIdSha256"])
    && ["github", "gitlab"].includes(value.provider)
    && ["github-com", "gitlab-com", "self-managed"].includes(value.baseUrlClass)
    && SHA256.test(value.projectCoordinatesSha256 ?? "")
    && OBJECT_TYPES.has(value.objectType)
    && SHA256.test(value.objectIdSha256 ?? "")
    && ((value.provider === "github") === (value.baseUrlClass === "github-com"))
    && (value.provider !== "gitlab" || ["gitlab-com", "self-managed"].includes(value.baseUrlClass));
}

function validPatch(value) {
  return exact(value, ["format", "patchSha256", "expectedPostSha256"])
    && value.format === "merge-patch-sha256"
    && SHA256.test(value.patchSha256 ?? "")
    && SHA256.test(value.expectedPostSha256 ?? "");
}

function validPreview(value) {
  return exact(value, ["previewSha256", "expiresAt"])
    && SHA256.test(value.previewSha256 ?? "")
    && Number.isSafeInteger(value.expiresAt) && value.expiresAt >= 0;
}

function validConfirmation(value) {
  return exact(value, ["authoritySha256", "previewSha256", "confirmedAt"])
    && SHA256.test(value.authoritySha256 ?? "") && SHA256.test(value.previewSha256 ?? "")
    && Number.isSafeInteger(value.confirmedAt) && value.confirmedAt >= 0;
}

function validRemoteReceipt(value) {
  return exact(value, ["providerReceiptSha256", "acceptedAt", "status"])
    && SHA256.test(value.providerReceiptSha256 ?? "")
    && Number.isSafeInteger(value.acceptedAt) && value.acceptedAt >= 0
    && ["accepted", "rejected", "partial", "unknown"].includes(value.status);
}

function validReadback(value) {
  return exact(value, ["observedSha256", "expectedSha256", "status", "observedAt"])
    && SHA256.test(value.observedSha256 ?? "") && SHA256.test(value.expectedSha256 ?? "")
    && ["matching", "mismatch", "unknown"].includes(value.status)
    && Number.isSafeInteger(value.observedAt) && value.observedAt >= 0;
}

function phaseCode(record) {
  const hasPreview = record.preview !== null;
  const hasConfirmation = record.confirmation !== null;
  const hasReceipt = record.remoteReceipt !== null;
  const hasReadback = record.readback !== null;
  if (hasPreview && !validPreview(record.preview)) return "SHAPE:mutation-preview";
  if (hasConfirmation && !validConfirmation(record.confirmation)) return "SHAPE:mutation-confirmation";
  if (hasReceipt && !validRemoteReceipt(record.remoteReceipt)) return "SHAPE:mutation-remote-receipt";
  if (hasReadback && !validReadback(record.readback)) return "SHAPE:mutation-readback";
  if (hasConfirmation && (!hasPreview || record.confirmation.previewSha256 !== record.preview.previewSha256)) return "BOUND:mutation-confirmation";
  if (hasConfirmation && record.confirmation.confirmedAt >= record.preview.expiresAt) return "STALE:mutation-confirmation";
  if (hasReceipt && (!hasConfirmation || record.remoteReceipt.acceptedAt < record.confirmation.confirmedAt)) return "BOUND:mutation-receipt-time";
  if (hasReadback && (!hasReceipt || record.readback.observedAt < record.remoteReceipt.acceptedAt)) return "BOUND:mutation-readback-time";
  if (hasReadback && record.readback.expectedSha256 !== record.patch.expectedPostSha256) return "BOUND:mutation-expected-post-state";

  switch (record.state) {
    case "requested":
      return hasPreview || hasConfirmation || hasReceipt || hasReadback ? "CONFLICT:mutation-state" : null;
    case "previewed":
      return !hasPreview || hasConfirmation || hasReceipt || hasReadback ? "CONFLICT:mutation-state" : null;
    case "confirmed":
      return !hasPreview || !hasConfirmation || hasReceipt || hasReadback ? "CONFLICT:mutation-state" : null;
    case "applied-unverified":
      return !hasPreview || !hasConfirmation || !hasReceipt || hasReadback || record.remoteReceipt.status !== "accepted"
        ? "CONFLICT:mutation-state" : null;
    case "readback-verified":
      return !hasPreview || !hasConfirmation || !hasReceipt || !hasReadback || record.readback.status !== "matching"
        || record.readback.observedSha256 !== record.readback.expectedSha256 ? "READBACK:mutation-state" : null;
    case "mismatch":
      return !hasPreview || !hasConfirmation || !hasReceipt || !hasReadback || record.readback.status !== "mismatch"
        || record.readback.observedSha256 === record.readback.expectedSha256 ? "READBACK:mutation-state" : null;
    case "expired":
      return !hasPreview || hasConfirmation || hasReceipt || hasReadback ? "CONFLICT:mutation-state" : null;
    case "rejected":
      return hasConfirmation || hasReceipt || hasReadback ? "CONFLICT:mutation-state" : null;
    case "failed":
      return !hasConfirmation || !hasReceipt || hasReadback || record.remoteReceipt.status !== "rejected"
        ? "CONFLICT:mutation-state" : null;
    case "partial":
      return !hasConfirmation || !hasReceipt || hasReadback || record.remoteReceipt.status !== "partial"
        ? "CONFLICT:mutation-state" : null;
    case "unknown":
      if (hasReadback) return !hasPreview || !hasConfirmation || !hasReceipt || record.readback.status !== "unknown"
        ? "CONFLICT:mutation-state" : null;
      return !hasConfirmation || !hasReceipt || record.remoteReceipt.status !== "unknown" ? "CONFLICT:mutation-state" : null;
    default:
      return "SHAPE:mutation-state";
  }
}

function validationCode(record, verifyDigest = true) {
  if (!exact(record, ROOT_KEYS)) return "SHAPE:mutation-root";
  if (record.schema !== EXTERNAL_MUTATION_SCHEMA) return "SCHEMA:external-mutation";
  if (!SAFE_ID.test(record.mutationId ?? "") || !["github", "gitlab"].includes(record.provider)
    || !validTarget(record.target) || record.provider !== record.target.provider
    || !SHA256.test(record.beforeSha256 ?? "") || !validPatch(record.patch)
    || !Object.hasOwn(OPERATIONS, record.operation) || !SHA256.test(record.idempotencyKey ?? "")
    || !SHA256.test(record.capabilitySha256 ?? "") || !MUTATION_STATES.has(record.state)
    || !(record.previousSha256 === null || SHA256.test(record.previousSha256 ?? ""))
    || !SHA256.test(record.recordSha256 ?? "")) return "SHAPE:mutation-fields";
  if (OPERATIONS[record.operation] !== `${record.target.objectType === "ci-pipeline" ? "ci.pipeline" : record.target.objectType}.mutate`) {
    return "AUTHORITY:mutation-operation-target";
  }
  if (record.preview !== null
    && record.preview.previewSha256 !== previewDigest(record, record.preview.expiresAt)) {
    return "BOUND:mutation-preview";
  }
  const phase = phaseCode(record);
  if (phase) return phase;
  if (record.state === "requested" && record.previousSha256 !== null) return "CONFLICT:mutation-genesis";
  if (verifyDigest && externalMutationDigest(record) !== record.recordSha256) return "CONFLICT:mutation-digest";
  return null;
}

export function validateExternalMutation(record) {
  const code = validationCode(record);
  return code ? { ok: false, code } : { ok: true, code: null };
}

function sealMutation(record, previous = null) {
  const next = {
    ...clone(record),
    previousSha256: previous,
    recordSha256: "0".repeat(64),
  };
  const code = validationCode(next, false);
  if (code) throw new Error(code);
  next.recordSha256 = externalMutationDigest(next);
  return deepFreeze(next);
}

export function createExternalMutationRequest(input) {
  const inputKeys = [
    "mutationId", "provider", "target", "beforeSha256", "patch",
    "operation", "idempotencyKey", "capabilitySha256",
  ];
  if (!exact(input, inputKeys)) throw new Error("SHAPE:mutation-request");
  return sealMutation({
    schema: EXTERNAL_MUTATION_SCHEMA,
    ...clone(input),
    preview: null,
    confirmation: null,
    state: "requested",
    remoteReceipt: null,
    readback: null,
  });
}

function previewDigest(record, expiresAt) {
  return mutationDigestValue({
    provider: record.provider,
    target: record.target,
    beforeSha256: record.beforeSha256,
    patch: record.patch,
    operation: record.operation,
    idempotencyKey: record.idempotencyKey,
    capabilitySha256: record.capabilitySha256,
    expiresAt,
  });
}

export function previewExternalMutation(record, { expiresAt } = {}) {
  if (!validateExternalMutation(record).ok || record.state !== "requested") {
    return { ok: false, code: "CONFLICT:mutation-preview", mutation: null };
  }
  if (!Number.isSafeInteger(expiresAt) || expiresAt < 1) {
    return { ok: false, code: "SHAPE:mutation-preview", mutation: null };
  }
  const preview = { previewSha256: previewDigest(record, expiresAt), expiresAt };
  return {
    ok: true,
    code: "MUTATION:previewed",
    mutation: sealMutation({ ...record, preview, state: "previewed" }, record.recordSha256),
  };
}

export function confirmExternalMutation(record, input = {}) {
  if (!validateExternalMutation(record).ok || record.state !== "previewed"
    || !exact(input, ["authoritySha256", "previewSha256", "confirmedAt"])
    || !SHA256.test(input.authoritySha256 ?? "") || !SHA256.test(input.previewSha256 ?? "")
    || !Number.isSafeInteger(input.confirmedAt) || input.confirmedAt < 0) {
    return { ok: false, code: "SHAPE:mutation-confirmation", mutation: null };
  }
  if (input.previewSha256 !== record.preview.previewSha256) {
    return { ok: false, code: "AUTHORITY:mutation-preview", mutation: null };
  }
  if (input.confirmedAt >= record.preview.expiresAt) {
    return { ok: false, code: "STALE:mutation-preview", mutation: null };
  }
  return {
    ok: true,
    code: "MUTATION:confirmed",
    mutation: sealMutation({ ...record, confirmation: clone(input), state: "confirmed" }, record.recordSha256),
  };
}

export function recordExternalMutationOutcome(record, input = {}) {
  if (!validateExternalMutation(record).ok || record.state !== "confirmed"
    || !exact(input, ["providerReceiptSha256", "acceptedAt", "status"])
    || !validRemoteReceipt(input)) {
    return { ok: false, code: "SHAPE:mutation-outcome", mutation: null };
  }
  if (input.acceptedAt < record.confirmation.confirmedAt) {
    return { ok: false, code: "BOUND:mutation-receipt-time", mutation: null };
  }
  const state = {
    accepted: "applied-unverified",
    rejected: "failed",
    partial: "partial",
    unknown: "unknown",
  }[input.status];
  return {
    ok: true,
    code: state === "applied-unverified" ? "MUTATION:applied-unverified" : `UNAVAILABLE:mutation-${state}`,
    mutation: sealMutation({ ...record, remoteReceipt: clone(input), state }, record.recordSha256),
  };
}

export function verifyExternalMutationReadback(record, input = {}) {
  if (!validateExternalMutation(record).ok || record.state !== "applied-unverified"
    || !validReadback(input)) {
    return { ok: false, code: "SHAPE:mutation-readback", mutation: null };
  }
  if (input.observedAt < record.remoteReceipt.acceptedAt) {
    return { ok: false, code: "BOUND:mutation-readback-time", mutation: null };
  }
  if (input.status === "matching" && input.observedSha256 !== input.expectedSha256) {
    return { ok: false, code: "READBACK:mutation-mismatch", mutation: null };
  }
  if (input.expectedSha256 !== record.patch.expectedPostSha256) {
    return { ok: false, code: "BOUND:mutation-expected-post-state", mutation: null };
  }
  if (input.status === "mismatch" && input.observedSha256 === input.expectedSha256) {
    return { ok: false, code: "READBACK:mutation-status", mutation: null };
  }
  const state = { matching: "readback-verified", mismatch: "mismatch", unknown: "unknown" }[input.status];
  return {
    ok: state === "readback-verified",
    code: state === "readback-verified" ? "MUTATION:readback-verified" : `READBACK:mutation-${state}`,
    mutation: sealMutation({ ...record, readback: clone(input), state }, record.recordSha256),
  };
}

export function rejectExternalMutation(record) {
  if (!validateExternalMutation(record).ok || !["requested", "previewed"].includes(record.state)) {
    return { ok: false, code: "CONFLICT:mutation-rejection", mutation: null };
  }
  return {
    ok: true,
    code: "MUTATION:rejected",
    mutation: sealMutation({ ...record, state: "rejected" }, record.recordSha256),
  };
}

export function expireExternalMutation(record, atMs) {
  if (!validateExternalMutation(record).ok || record.state !== "previewed"
    || !Number.isSafeInteger(atMs) || atMs < record.preview.expiresAt) {
    return { ok: false, code: "STALE:mutation-not-expired", mutation: null };
  }
  return {
    ok: true,
    code: "MUTATION:expired",
    mutation: sealMutation({ ...record, state: "expired" }, record.recordSha256),
  };
}

/**
 * Retry preflight. It never performs or reports a mutation. The caller must
 * reuse the original key and reconcile exact remote state before a new request.
 */
export function reconcileExternalMutationRetry(record, input = {}) {
  if (!validateExternalMutation(record).ok
    || !exact(input, ["idempotencyKey", "observedSha256", "expectedSha256", "observedAt"])
    || !SHA256.test(input.idempotencyKey ?? "") || !SHA256.test(input.observedSha256 ?? "")
    || !SHA256.test(input.expectedSha256 ?? "") || !Number.isSafeInteger(input.observedAt)
    || input.observedAt < 0) return { ok: false, code: "SHAPE:mutation-retry", retry: false };
  if (input.idempotencyKey !== record.idempotencyKey) {
    return { ok: false, code: "AUTHORITY:mutation-idempotency", retry: false };
  }
  if (input.expectedSha256 !== record.patch.expectedPostSha256) {
    return { ok: false, code: "BOUND:mutation-expected-post-state", retry: false };
  }
  if (record.remoteReceipt !== null && input.observedAt < record.remoteReceipt.acceptedAt) {
    return { ok: false, code: "BOUND:mutation-retry-time", retry: false };
  }
  if (input.observedSha256 === input.expectedSha256) {
    return { ok: true, code: "REPLAY:remote-already-matches", retry: false };
  }
  if (!["failed", "partial", "unknown", "mismatch"].includes(record.state)) {
    return { ok: false, code: "CONFLICT:mutation-retry-state", retry: false };
  }
  return { ok: true, code: "MUTATION:retry-admissible", retry: true };
}

if (isDirectInvocation(import.meta.url)) {
  if (process.argv.length === 3 && process.argv[2] === "--schema") {
    console.log(JSON.stringify({
      adapter: "gitlab",
      version: GITLAB_FORGE_ADAPTER_VERSION,
      forgeSchema: "pipeline.forge-capability.v1",
      mutationSchema: EXTERNAL_MUTATION_SCHEMA,
      network: "unavailable",
      operations: Object.keys(OPERATIONS),
    }, null, 2));
  } else {
    console.error("Usage: node plugins/pipeline-core/scripts/gitlab-forge-adapter.mjs --schema");
    process.exitCode = 2;
  }
}
