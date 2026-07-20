#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { createHash } from "node:crypto";

export const T1_PO_OVERRIDE_SCHEMA = "pipeline.critic-t1-po-override.v1";
export const INTERMEDIATE_LITERAL = "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted";
export const WEAK_LITERAL = "functional-equivalent-read-only; OS isolation not asserted";
export const ALLOWED_PRE_VERDICT_CODES = Object.freeze([
  "binary-missing",
  "child-stdio-error",
  "permission-denial",
  "sandbox-setup-error",
  "unsupported-profile",
]);

const SHA256 = /^[0-9a-f]{64}$/;
const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;

export class T1PoOverrideError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "T1PoOverrideError";
    this.code = code;
  }
}

function fail(code, message) { throw new T1PoOverrideError(code, message); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) {
    fail("T1-OVERRIDE-SCHEMA", `${label} is not closed`);
  }
}
function digest(value, label) { if (!SHA256.test(value)) fail("T1-OVERRIDE-DIGEST", `${label} is not SHA-256`); }
function safe(value, label) { if (!SAFE.test(value)) fail("T1-OVERRIDE-ID", `${label} is invalid`); }

export function canonicalJson(value) {
  const normalize = (entry) => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object"
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) : entry;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }

export function createT1PoOverride(request) {
  exactKeys(request, ["overrideId", "scope", "preflightReceiptSha256", "compatibilityProjectionSha256", "primaryDisposition", "approval"], "override request");
  safe(request.overrideId, "overrideId");
  exactKeys(request.scope, ["featureId", "candidateCommit", "candidateTree", "candidateDiffSha256", "packetSha256"], "scope");
  if (request.scope.featureId !== "sprint-batman-epic" || !OID.test(request.scope.candidateCommit)
    || !OID.test(request.scope.candidateTree) || request.scope.candidateCommit.length !== request.scope.candidateTree.length) {
    fail("T1-OVERRIDE-SCOPE", "override is not bound to one valid Batman candidate");
  }
  digest(request.scope.candidateDiffSha256, "candidateDiffSha256");
  digest(request.scope.packetSha256, "packetSha256");
  digest(request.preflightReceiptSha256, "preflightReceiptSha256");
  digest(request.compatibilityProjectionSha256, "compatibilityProjectionSha256");
  exactKeys(request.primaryDisposition, ["compatibilityState", "terminalCode"], "primary disposition");
  const primaryEligible = request.primaryDisposition.compatibilityState === "intermediate-preflight-eligible"
    && request.primaryDisposition.terminalCode === "ok";
  const primaryUnavailable = request.primaryDisposition.compatibilityState === "diagnostic-only"
    && ALLOWED_PRE_VERDICT_CODES.includes(request.primaryDisposition.terminalCode);
  if (!primaryEligible && !primaryUnavailable) {
    fail("T1-OVERRIDE-PRIMARY", "primary disposition is neither eligible nor an allowlisted pre-verdict unavailability");
  }
  exactKeys(request.approval, ["decisionId", "attributedTo", "attributionOnly", "recordedAtMs"], "approval");
  safe(request.approval.decisionId, "decisionId");
  if (request.approval.attributedTo !== "PO" || request.approval.attributionOnly !== true
    || !Number.isSafeInteger(request.approval.recordedAtMs) || request.approval.recordedAtMs < 0) {
    fail("T1-OVERRIDE-APPROVAL", "override requires explicit PO process attribution");
  }
  return validateT1PoOverride({
    schema: T1_PO_OVERRIDE_SCHEMA,
    overrideId: request.overrideId,
    scope: { ...structuredClone(request.scope), singleCandidateSingleReview: true },
    route: {
      runnerId: "codex", dutyId: "critic_high_risk", selectorKind: "model-id",
      selectorValue: "gpt-5.6-sol", effort: "max", freshContext: true, packetOnly: true,
    },
    primary: {
      class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: INTERMEDIATE_LITERAL,
      preflightReceiptSha256: request.preflightReceiptSha256,
      compatibilityProjectionSha256: request.compatibilityProjectionSha256,
      compatibilityState: request.primaryDisposition.compatibilityState,
      availability: primaryEligible ? "eligible" : "unavailable",
      terminalCode: request.primaryDisposition.terminalCode,
      strongIsolationAsserted: false,
    },
    fallback: {
      class: "contractual-read-only", literal: WEAK_LITERAL, maxAttempts: 1,
      sameRunnerOnly: true, allowedPreVerdictCodes: [...ALLOWED_PRE_VERDICT_CODES],
    },
    prohibitions: {
      dangerFullAccessProhibited: true, crossRunnerSubstitutionProhibited: true,
      strongIsolationClaimProhibited: true, standingExceptionProhibited: true,
    },
    approval: structuredClone(request.approval),
    status: "authorized",
    consumption: null,
  });
}

export function decideT1Fallback(authorization, observation) {
  validateT1PoOverride(authorization);
  if (authorization.status !== "authorized") fail("T1-OVERRIDE-CONSUMED", "override is already consumed");
  exactKeys(observation, ["code", "verdictBytes", "cleanupAttempted"], "primary observation");
  if (!Number.isSafeInteger(observation.verdictBytes) || observation.verdictBytes < 0
    || typeof observation.cleanupAttempted !== "boolean") fail("T1-OVERRIDE-OBSERVATION", "primary observation is invalid");
  if (observation.code === "verdict-success") {
    return authorization.primary.availability === "eligible"
      ? { action: "consume-primary" }
      : { action: "no-usable-review", reason: "unavailable-primary-cannot-produce-verdict" };
  }
  if (authorization.primary.availability === "unavailable"
    && observation.code !== authorization.primary.terminalCode) {
    return { action: "no-usable-review", reason: "primary-failure-evidence-mismatch" };
  }
  if (ALLOWED_PRE_VERDICT_CODES.includes(observation.code) && observation.verdictBytes === 0 && !observation.cleanupAttempted) {
    return { action: "run-one-functional-equivalent", assurance: WEAK_LITERAL };
  }
  return { action: "no-usable-review", reason: "fallback-not-authorized" };
}

export function consumeT1PoOverride(authorization, result) {
  validateT1PoOverride(authorization);
  if (authorization.status !== "authorized") fail("T1-OVERRIDE-CONSUMED", "override is already consumed");
  exactKeys(result, ["lane", "fallbackAttempts", "verdictStatus", "verdictSha256", "receiptSha256", "consumedAtMs"], "consumption");
  if (!new Set(["intermediate", "functional-equivalent"]).has(result.lane)
    || !new Set(["pass", "fail", "no-usable-review"]).has(result.verdictStatus)
    || !Number.isSafeInteger(result.fallbackAttempts) || result.fallbackAttempts < 0 || result.fallbackAttempts > 1
    || !Number.isSafeInteger(result.consumedAtMs) || result.consumedAtMs < authorization.approval.recordedAtMs) {
    fail("T1-OVERRIDE-RESULT", "consumption result is invalid");
  }
  if ((result.lane === "intermediate" && result.fallbackAttempts !== 0)
    || (result.lane === "functional-equivalent" && result.fallbackAttempts !== 1)) {
    fail("T1-OVERRIDE-RESULT", "lane and fallback count disagree");
  }
  digest(result.receiptSha256, "receiptSha256");
  if (result.verdictStatus === "no-usable-review") {
    if (result.verdictSha256 !== null) fail("T1-OVERRIDE-RESULT", "no-usable-review cannot carry a verdict");
  } else digest(result.verdictSha256, "verdictSha256");
  const next = structuredClone(authorization);
  next.status = "consumed";
  next.consumption = structuredClone(result);
  return validateT1PoOverride(next);
}

export function validateT1PoOverride(value) {
  exactKeys(value, ["schema", "overrideId", "scope", "route", "primary", "fallback", "prohibitions", "approval", "status", "consumption"], "override");
  if (value.schema !== T1_PO_OVERRIDE_SCHEMA) fail("T1-OVERRIDE-SCHEMA", "wrong override schema");
  safe(value.overrideId, "overrideId");
  exactKeys(value.scope, ["featureId", "candidateCommit", "candidateTree", "candidateDiffSha256", "packetSha256", "singleCandidateSingleReview"], "scope");
  if (value.scope.featureId !== "sprint-batman-epic" || value.scope.singleCandidateSingleReview !== true
    || !OID.test(value.scope.candidateCommit) || !OID.test(value.scope.candidateTree)
    || value.scope.candidateCommit.length !== value.scope.candidateTree.length) fail("T1-OVERRIDE-SCOPE", "invalid candidate scope");
  digest(value.scope.candidateDiffSha256, "candidateDiffSha256"); digest(value.scope.packetSha256, "packetSha256");
  exactKeys(value.route, ["runnerId", "dutyId", "selectorKind", "selectorValue", "effort", "freshContext", "packetOnly"], "route");
  if (canonicalJson(value.route) !== canonicalJson({ runnerId: "codex", dutyId: "critic_high_risk", selectorKind: "model-id", selectorValue: "gpt-5.6-sol", effort: "max", freshContext: true, packetOnly: true })) fail("T1-OVERRIDE-ROUTE", "T1 route was weakened or substituted");
  exactKeys(value.primary, ["class", "literal", "preflightReceiptSha256", "compatibilityProjectionSha256", "compatibilityState", "availability", "terminalCode", "strongIsolationAsserted"], "primary");
  digest(value.primary.preflightReceiptSha256, "preflightReceiptSha256");
  digest(value.primary.compatibilityProjectionSha256, "compatibilityProjectionSha256");
  const eligiblePrimary = value.primary.compatibilityState === "intermediate-preflight-eligible"
    && value.primary.availability === "eligible" && value.primary.terminalCode === "ok";
  const unavailablePrimary = value.primary.compatibilityState === "diagnostic-only"
    && value.primary.availability === "unavailable" && ALLOWED_PRE_VERDICT_CODES.includes(value.primary.terminalCode);
  if (value.primary.class !== "sandbox-read-only-except-coordinator-scratch-network-open" || value.primary.literal !== INTERMEDIATE_LITERAL
    || (!eligiblePrimary && !unavailablePrimary)
    || value.primary.strongIsolationAsserted !== false) fail("T1-OVERRIDE-PRIMARY", "primary assurance is overstated or its unavailable state is not typed");
  exactKeys(value.fallback, ["class", "literal", "maxAttempts", "sameRunnerOnly", "allowedPreVerdictCodes"], "fallback");
  if (value.fallback.class !== "contractual-read-only" || value.fallback.literal !== WEAK_LITERAL
    || value.fallback.maxAttempts !== 1 || value.fallback.sameRunnerOnly !== true
    || canonicalJson(value.fallback.allowedPreVerdictCodes) !== canonicalJson(ALLOWED_PRE_VERDICT_CODES)) fail("T1-OVERRIDE-FALLBACK", "fallback contract was broadened");
  exactKeys(value.prohibitions, ["dangerFullAccessProhibited", "crossRunnerSubstitutionProhibited", "strongIsolationClaimProhibited", "standingExceptionProhibited"], "prohibitions");
  if (Object.values(value.prohibitions).some((entry) => entry !== true)) fail("T1-OVERRIDE-PROHIBITION", "a mandatory prohibition is missing");
  exactKeys(value.approval, ["decisionId", "attributedTo", "attributionOnly", "recordedAtMs"], "approval");
  safe(value.approval.decisionId, "decisionId");
  if (value.approval.attributedTo !== "PO" || value.approval.attributionOnly !== true
    || !Number.isSafeInteger(value.approval.recordedAtMs) || value.approval.recordedAtMs < 0) fail("T1-OVERRIDE-APPROVAL", "invalid approval attribution");
  if (!new Set(["authorized", "consumed"]).has(value.status)
    || (value.status === "authorized") !== (value.consumption === null)) fail("T1-OVERRIDE-STATUS", "status and consumption disagree");
  if (value.consumption !== null) {
    exactKeys(value.consumption, ["lane", "fallbackAttempts", "verdictStatus", "verdictSha256", "receiptSha256", "consumedAtMs"], "consumption");
    if (!new Set(["intermediate", "functional-equivalent"]).has(value.consumption.lane)
      || !new Set(["pass", "fail", "no-usable-review"]).has(value.consumption.verdictStatus)
      || !Number.isSafeInteger(value.consumption.fallbackAttempts) || value.consumption.fallbackAttempts < 0 || value.consumption.fallbackAttempts > 1
      || !Number.isSafeInteger(value.consumption.consumedAtMs) || value.consumption.consumedAtMs < value.approval.recordedAtMs) fail("T1-OVERRIDE-RESULT", "invalid consumption");
    if ((value.consumption.lane === "intermediate" && value.consumption.fallbackAttempts !== 0)
      || (value.consumption.lane === "functional-equivalent" && value.consumption.fallbackAttempts !== 1)) fail("T1-OVERRIDE-RESULT", "lane and fallback count disagree");
    digest(value.consumption.receiptSha256, "receiptSha256");
    if (value.consumption.verdictStatus === "no-usable-review") {
      if (value.consumption.verdictSha256 !== null) fail("T1-OVERRIDE-RESULT", "no-usable-review cannot carry a verdict");
    } else digest(value.consumption.verdictSha256, "verdictSha256");
  }
  return value;
}
