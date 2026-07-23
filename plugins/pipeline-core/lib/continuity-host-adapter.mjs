// SPDX-License-Identifier: SUL-1.0
/**
 * Provider-neutral host status/final normalization for the first Phase-2.6
 * continuity seam.
 *
 * Pure data in/data out: no polling, persistence, background work, source
 * access, provider transport or state mutation. Untrusted final payload bytes
 * are validated and hashed here, but are never returned in the log-safe
 * outcome.
 */
import { createHash } from "node:crypto";

const INPUT_KEYS = new Set(["expected", "observation", "priorAcknowledgement"]);
const IDENTITY_KEYS = new Set([
  "featureId", "queueRevision", "packageId", "actionId", "dispatchId",
  "attemptId", "authorityDigests", "routeRequestSha256", "mayDelegate",
]);
const AUTHORITY_KEYS = new Set(["prdSha256", "specSha256", "resultSha256"]);
const OBSERVATION_KEYS = new Set(["status", "identity", "final"]);
const FINAL_KEYS = new Set(["schema", "identity", "outcome", "resultJson", "resultBytes", "resultDigest"]);
const ACK_KEYS = new Set(["identity", "resultDigest", "finalOutcome"]);
const HOST_STATUSES = new Set(["running", "completed", "completed-but-undelivered", "failed"]);
const FINAL_OUTCOMES = new Set(["succeeded", "failed"]);
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256 = /^[a-f0-9]{64}$/;
const FINAL_SCHEMA = "pipeline.continuity-final.v0";
const MAX_RESULT_BYTES = 65_536;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasExactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}

function validDigest(value, nullable = false) {
  return (nullable && value === null) || (typeof value === "string" && SHA256.test(value));
}

function validIdentity(identity) {
  return hasExactKeys(identity, IDENTITY_KEYS)
    && typeof identity.queueRevision === "number"
    && Number.isSafeInteger(identity.queueRevision)
    && identity.queueRevision >= 0
    && [identity.featureId, identity.packageId, identity.actionId, identity.dispatchId, identity.attemptId]
      .every((value) => typeof value === "string" && SAFE_ID.test(value))
    && hasExactKeys(identity.authorityDigests, AUTHORITY_KEYS)
    && validDigest(identity.authorityDigests.prdSha256)
    && validDigest(identity.authorityDigests.specSha256)
    && validDigest(identity.authorityDigests.resultSha256, true)
    && validDigest(identity.routeRequestSha256)
    && identity.mayDelegate === false;
}

function sameIdentity(expected, actual) {
  return expected.featureId === actual.featureId
    && expected.queueRevision === actual.queueRevision
    && expected.packageId === actual.packageId
    && expected.actionId === actual.actionId
    && expected.dispatchId === actual.dispatchId
    && expected.attemptId === actual.attemptId
    && expected.authorityDigests.prdSha256 === actual.authorityDigests.prdSha256
    && expected.authorityDigests.specSha256 === actual.authorityDigests.specSha256
    && expected.authorityDigests.resultSha256 === actual.authorityDigests.resultSha256
    && expected.routeRequestSha256 === actual.routeRequestSha256
    && expected.mayDelegate === actual.mayDelegate;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Compute the digest of the complete final semantics, excluding only itself. */
export function computeContinuityFinalDigest(finalWithoutDigest) {
  return createHash("sha256").update(canonicalJson(finalWithoutDigest), "utf8").digest("hex");
}

function validAcknowledgement(value) {
  return value === null || (hasExactKeys(value, ACK_KEYS)
    && validIdentity(value.identity)
    && validDigest(value.resultDigest)
    && FINAL_OUTCOMES.has(value.finalOutcome));
}

function outcome(code, {
  ok = false,
  status = "failed",
  finalDisposition = "invalid",
  integrable = false,
  retrievalRequired = false,
  resultDigest = null,
  resultBytes = null,
  finalOutcome = null,
} = {}) {
  return {
    ok, code, status, finalDisposition, integrable, retrievalRequired,
    resultDigest, resultBytes, finalOutcome,
  };
}

function validateFinal(final, expected) {
  if (!hasExactKeys(final, FINAL_KEYS)
    || final.schema !== FINAL_SCHEMA
    || !validIdentity(final.identity)
    || !FINAL_OUTCOMES.has(final.outcome)
    || typeof final.resultJson !== "string"
    || !Number.isSafeInteger(final.resultBytes)
    || !validDigest(final.resultDigest)) {
    return { ok: false, code: "CHA-FINAL-SCHEMA" };
  }
  if (!sameIdentity(expected, final.identity)) {
    return { ok: false, code: "CHA-IDENTITY-MISMATCH" };
  }
  const measuredBytes = Buffer.byteLength(final.resultJson, "utf8");
  if (final.resultBytes < 0
    || final.resultBytes > MAX_RESULT_BYTES
    || measuredBytes !== final.resultBytes
    || measuredBytes > MAX_RESULT_BYTES) {
    return { ok: false, code: "CHA-FINAL-BOUNDS" };
  }
  try {
    const parsed = JSON.parse(final.resultJson);
    if (!isObject(parsed)) return { ok: false, code: "CHA-FINAL-SCHEMA" };
  } catch {
    return { ok: false, code: "CHA-FINAL-SCHEMA" };
  }
  const digestInput = {
    schema: final.schema,
    identity: final.identity,
    outcome: final.outcome,
    resultJson: final.resultJson,
    resultBytes: final.resultBytes,
  };
  if (computeContinuityFinalDigest(digestInput) !== final.resultDigest) {
    return { ok: false, code: "CHA-FINAL-DIGEST" };
  }
  return {
    ok: true,
    resultDigest: final.resultDigest,
    resultBytes: measuredBytes,
    finalOutcome: final.outcome,
  };
}

/**
 * Normalize one host observation against the exact current dispatch identity.
 * The returned object has a closed, log-safe shape and never contains result
 * JSON or host error prose.
 */
export function normalizeContinuityHostObservation(input) {
  if (!hasExactKeys(input, INPUT_KEYS)
    || !validIdentity(input.expected)
    || !hasExactKeys(input.observation, OBSERVATION_KEYS)
    || !HOST_STATUSES.has(input.observation.status)
    || !validIdentity(input.observation.identity)
    || !validAcknowledgement(input.priorAcknowledgement)) {
    return outcome("CHA-SCHEMA");
  }

  const { expected, observation, priorAcknowledgement: priorAck } = input;
  if (!sameIdentity(expected, observation.identity)) {
    return outcome("CHA-IDENTITY-MISMATCH");
  }

  const hasFinal = observation.final !== null;
  if ((observation.status === "running" || observation.status === "failed") && hasFinal) {
    return outcome("CHA-STATUS-FINAL-CONFLICT");
  }
  if (!hasFinal && priorAck !== null) {
    return outcome("CHA-ACK-STATUS-CONFLICT");
  }

  if (observation.status === "running") {
    return outcome("CHA-RUNNING", {
      ok: true, status: "running", finalDisposition: "none",
    });
  }
  if (observation.status === "failed") {
    return outcome("CHA-HOST-FAILED", {
      ok: true, status: "failed", finalDisposition: "none",
    });
  }
  if (!hasFinal) {
    return outcome("CHA-COMPLETED-UNDELIVERED", {
      ok: true,
      status: "completed-but-undelivered",
      finalDisposition: "undelivered",
      retrievalRequired: true,
    });
  }

  const checked = validateFinal(observation.final, expected);
  if (!checked.ok) return outcome(checked.code);
  if (priorAck !== null && !sameIdentity(expected, priorAck.identity)) {
    return outcome("CHA-ACK-IDENTITY-MISMATCH");
  }
  if (priorAck !== null
    && priorAck.resultDigest === checked.resultDigest
    && priorAck.finalOutcome === checked.finalOutcome) {
    return outcome("CHA-DUPLICATE-FINAL", {
      ok: true,
      status: "completed",
      finalDisposition: "duplicate",
      resultDigest: checked.resultDigest,
      resultBytes: checked.resultBytes,
      finalOutcome: checked.finalOutcome,
    });
  }
  if (priorAck !== null) {
    return outcome("CHA-ACK-CONFLICT", {
      status: "completed",
      finalDisposition: "conflict",
      resultDigest: checked.resultDigest,
      resultBytes: checked.resultBytes,
      finalOutcome: checked.finalOutcome,
    });
  }
  return outcome("CHA-FINAL-READY", {
    ok: true,
    status: "completed",
    finalDisposition: "ready",
    integrable: true,
    resultDigest: checked.resultDigest,
    resultBytes: checked.resultBytes,
    finalOutcome: checked.finalOutcome,
  });
}

export const CONTINUITY_HOST_CODES = Object.freeze([
  "CHA-SCHEMA",
  "CHA-IDENTITY-MISMATCH",
  "CHA-STATUS-FINAL-CONFLICT",
  "CHA-ACK-STATUS-CONFLICT",
  "CHA-ACK-IDENTITY-MISMATCH",
  "CHA-FINAL-SCHEMA",
  "CHA-FINAL-BOUNDS",
  "CHA-FINAL-DIGEST",
  "CHA-RUNNING",
  "CHA-HOST-FAILED",
  "CHA-COMPLETED-UNDELIVERED",
  "CHA-DUPLICATE-FINAL",
  "CHA-ACK-CONFLICT",
  "CHA-FINAL-READY",
]);

export const CONTINUITY_FINAL_MAX_BYTES = MAX_RESULT_BYTES;
