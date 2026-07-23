// SPDX-License-Identifier: SUL-1.0

/** Pure, default-off classifier for F4. It never selects or mutates a route. */

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const POLICY_SCHEMA = "pipeline.codex-sandbox-compatibility-policy.v1";
export const PROJECTION_SCHEMA = "pipeline.codex-sandbox-compatibility-receipt.v1";
export const INTERMEDIATE_LITERAL = "sandbox-read-only-except-coordinator-scratch; input/network isolation not asserted";
export const WEAK_LITERAL = "functional-equivalent-read-only; OS isolation not asserted";
export const ASSURANCE_CLASSES = Object.freeze(["technically-isolated", "sandbox-read-only-except-coordinator-scratch-network-open", "contractual-read-only", "no-usable-review"]);
export const STATES = Object.freeze(["unsupported", "diagnostic-only", "intermediate-preflight-candidate", "intermediate-preflight-eligible", "intermediate-shadow-eligible", "intermediate-production-eligible", "strong-preflight-eligible", "strong-shadow-eligible", "strong-production-eligible"]);
const SHA256 = /^[0-9a-f]{64}$/;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/;
const HERE = dirname(fileURLToPath(import.meta.url));
const POLICY_PATH = join(HERE, "../config/codex-sandbox-compatibility.v1.json");

export class CompatibilityError extends Error {
  constructor(code, message) { super(message); this.name = "CompatibilityError"; this.code = code; }
}
function fail(code, message) { throw new CompatibilityError(code, message); }
export function canonicalJson(value) {
  const normalize = (entry) => Array.isArray(entry) ? entry.map(normalize) : entry && typeof entry === "object"
    ? Object.fromEntries(Object.keys(entry).sort().map((key) => [key, normalize(entry[key])])) : entry;
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}
export function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail("F4-SCHEMA", `${label} is not closed`);
}
function digest(value, label, nullable = false) { if (!(nullable && value === null) && !SHA256.test(value)) fail("F4-DIGEST", `${label} is not SHA-256`); }
function safe(value, label) { if (!SAFE.test(value)) fail("F4-STRING", `${label} is invalid`); }

export function loadCompatibilityPolicy() {
  const raw = readFileSync(POLICY_PATH);
  const value = JSON.parse(raw.toString("utf8"));
  validateCompatibilityPolicy(value);
  return { value, rawSha256: sha256(raw), path: POLICY_PATH };
}

export function validateCompatibilityPolicy(policy) {
  exactKeys(policy, ["schema", "maxEvidenceAgeMs", "fallback", "entries"], "policy");
  if (policy.schema !== POLICY_SCHEMA || policy.maxEvidenceAgeMs !== 86_400_000 || !Array.isArray(policy.entries)) fail("F4-POLICY", "policy header is invalid");
  exactKeys(policy.fallback, ["laneId", "runnerId", "assuranceLiteral", "allowedFailureCodes"], "fallback");
  if (policy.fallback.assuranceLiteral !== WEAK_LITERAL || policy.fallback.runnerId !== "codex"
    || !Array.isArray(policy.fallback.allowedFailureCodes) || policy.fallback.allowedFailureCodes.length !== 5
    || new Set(policy.fallback.allowedFailureCodes).size !== 5) fail("F4-FALLBACK", "fallback is not the one exact ADR-0035 lane");
  const allowedFailures = ["binary-missing", "unsupported-profile", "sandbox-setup-error", "permission-denial", "child-stdio-error"];
  if (allowedFailures.some((code) => !policy.fallback.allowedFailureCodes.includes(code))) fail("F4-FALLBACK", "fallback failure allowlist drifted");
  const ids = new Set(); const tuples = new Set();
  for (const entry of policy.entries) {
    exactKeys(entry, ["id", "runnerId", "primaryLaneId", "fallbackLaneId", "cliVersion", "releasedArtifactSha256", "kernelClass", "filesystemClass", "permissionProfileId", "permissionProfileSha256", "preflightSchemaSha256", "networkEnabled", "initialState"], "entry");
    for (const [name, value] of Object.entries({ id: entry.id, runnerId: entry.runnerId, primaryLaneId: entry.primaryLaneId, fallbackLaneId: entry.fallbackLaneId, cliVersion: entry.cliVersion, kernelClass: entry.kernelClass, permissionProfileId: entry.permissionProfileId })) safe(value, name);
    for (const [name, value] of Object.entries({ releasedArtifactSha256: entry.releasedArtifactSha256, permissionProfileSha256: entry.permissionProfileSha256, preflightSchemaSha256: entry.preflightSchemaSha256 })) digest(value, name);
    if (!new Set(["native-linux", "wsl-native", "drvfs"]).has(entry.filesystemClass) || typeof entry.networkEnabled !== "boolean"
      || !new Set(["diagnostic-only", "intermediate-preflight-candidate"]).has(entry.initialState)
      || entry.fallbackLaneId !== policy.fallback.laneId || entry.runnerId !== policy.fallback.runnerId
      || entry.initialState === "intermediate-preflight-candidate" && (!entry.networkEnabled || entry.permissionProfileId !== "codex-critic-intermediate.v1")) fail("F4-POLICY", "entry contradicts its assurance boundary");
    const tuple = [entry.runnerId, entry.cliVersion, entry.releasedArtifactSha256, entry.kernelClass, entry.filesystemClass, entry.permissionProfileSha256].join("|");
    if (ids.has(entry.id) || tuples.has(tuple)) fail("F4-POLICY", "duplicate compatibility entry");
    ids.add(entry.id); tuples.add(tuple);
  }
  return policy;
}

function findEntry(policy, observation) {
  return policy.entries.filter((entry) => entry.runnerId === observation.runnerId && entry.cliVersion === observation.cliVersion
    && entry.releasedArtifactSha256 === observation.releasedArtifactSha256 && entry.kernelClass === observation.kernelClass
    && entry.filesystemClass === observation.filesystemClass && entry.permissionProfileId === observation.permissionProfileId
    && entry.permissionProfileSha256 === observation.permissionProfileSha256);
}
function fresh(evidence, observation, maxAge) {
  return evidence && evidence.bootId === observation.bootId && Number.isSafeInteger(evidence.observedAtMs)
    && evidence.observedAtMs <= observation.nowMs && observation.nowMs - evidence.observedAtMs <= maxAge && SHA256.test(evidence.rawSha256);
}
function receiptBound(evidence) {
  return evidence?.receipt && evidence.rawSha256 === sha256(Buffer.from(canonicalJson(evidence.receipt)));
}

export function classifyCompatibility(policy, observation) {
  validateCompatibilityPolicy(policy);
  exactKeys(observation, ["runnerId", "cliVersion", "releasedArtifactSha256", "kernelClass", "filesystemClass", "permissionProfileId", "permissionProfileSha256", "bootId", "nowMs", "preflight", "runner", "shadow", "activation", "routePostimageSha256"], "observation");
  const matches = findEntry(policy, observation);
  if (matches.length !== 1) return { state: "unsupported", entry: null, reason: "no-exact-policy-entry" };
  const entry = matches[0];
  if (!fresh(observation.preflight, observation, policy.maxEvidenceAgeMs)) return { state: entry.initialState, entry, reason: "fresh-preflight-required" };
  const preflight = observation.preflight.receipt;
  if (!receiptBound(observation.preflight) || observation.preflight.schemaSha256 !== entry.preflightSchemaSha256
    || preflight.schema !== "pipeline.codex-sandbox-preflight.v1" || preflight.cli?.version !== entry.cliVersion
    || preflight.cli?.artifactSha256 !== entry.releasedArtifactSha256 || preflight.profile?.id !== entry.permissionProfileId
    || preflight.profile?.rawSha256 !== entry.permissionProfileSha256 || preflight.platform?.kernelClass !== entry.kernelClass
    || preflight.platform?.filesystemClass !== entry.filesystemClass || preflight.networkEnabled !== entry.networkEnabled
    || preflight.terminalCode !== "ok") return { state: "diagnostic-only", entry, reason: "preflight-binding-mismatch" };
  const strong = preflight.eligibility === "strong" && entry.networkEnabled === false;
  const intermediate = preflight.eligibility === "intermediate" && entry.networkEnabled === true;
  if (!strong && !intermediate) return { state: "diagnostic-only", entry, reason: "preflight-not-eligible" };
  const prefix = strong ? "strong" : "intermediate";
  let state = `${prefix}-preflight-eligible`;
  if (fresh(observation.runner, observation, policy.maxEvidenceAgeMs) && receiptBound(observation.runner)
    && observation.runner.receipt?.schema === "pipeline.codex-isolated-critic-receipt.v1"
    && observation.runner.receipt?.terminalCode === "verdict-success"
    && fresh(observation.shadow, observation, policy.maxEvidenceAgeMs) && receiptBound(observation.shadow)
    && observation.shadow.receipt?.schema === "pipeline.codex-critic-shadow-receipt.v1"
    && observation.shadow.receipt?.gateEligible === true && observation.shadow.receipt?.productionCriticGateSatisfied === false
    && SHA256.test(observation.shadow.receipt?.packetSetSha256)
    && observation.shadow.packetSetSha256 === observation.shadow.receipt.packetSetSha256) state = `${prefix}-shadow-eligible`;
  if (state.endsWith("shadow-eligible") && fresh(observation.activation, observation, policy.maxEvidenceAgeMs)
    && receiptBound(observation.activation) && observation.activation.receipt?.schema === "pipeline.critic-route-activation.v1"
    && observation.activation.receipt?.status === "verified" && observation.activation.receipt?.route.postimageSha256 === observation.routePostimageSha256) state = `${prefix}-production-eligible`;
  return { state, entry, reason: "exact-evidence" };
}

export function buildCompatibilityProjection(policyEnvelope, observation) {
  if (!policyEnvelope || typeof policyEnvelope !== "object" || Array.isArray(policyEnvelope)
    || !Object.hasOwn(policyEnvelope, "value") || !Object.hasOwn(policyEnvelope, "rawSha256")
    || Object.keys(policyEnvelope).some((key) => !["value", "rawSha256", "path"].includes(key))) fail("F4-SCHEMA", "policy envelope is not closed");
  digest(policyEnvelope.rawSha256, "policy raw digest");
  const committed = loadCompatibilityPolicy();
  if (canonicalJson(policyEnvelope.value) === canonicalJson(committed.value)
    && policyEnvelope.rawSha256 !== committed.rawSha256) fail("F4-DIGEST", "policy envelope does not bind the committed policy bytes");
  const classification = classifyCompatibility(policyEnvelope.value, observation);
  if (!classification.entry) fail("F4-UNSUPPORTED", "unsupported observations cannot produce a local projection");
  const evidenceDigest = (value) => value?.rawSha256 ?? null;
  const result = {
    schema: PROJECTION_SCHEMA,
    policySha256: policyEnvelope.rawSha256,
    entryId: classification.entry.id,
    runnerId: classification.entry.runnerId,
    primaryLaneId: classification.entry.primaryLaneId,
    fallbackLaneId: classification.entry.fallbackLaneId,
    state: classification.state,
    bootId: observation.bootId,
    observedAtMs: observation.nowMs,
    evidence: { preflightSha256: evidenceDigest(observation.preflight), runnerReceiptSha256: evidenceDigest(observation.runner), shadowReceiptSha256: evidenceDigest(observation.shadow) },
    activationReceiptSha256: evidenceDigest(observation.activation),
    routePostimageSha256: observation.routePostimageSha256,
  };
  validateCompatibilityProjection(result, { production: result.state.endsWith("production-eligible") });
  return result;
}

/** Domain-separated digest for the exact persisted compatibility projection. */
export function compatibilityReceiptDigest(projection) {
  validateCompatibilityProjection(projection, { production: projection?.state?.endsWith("production-eligible") });
  return sha256(Buffer.concat([
    Buffer.from(`${PROJECTION_SCHEMA}\0`, "utf8"),
    Buffer.from(canonicalJson(projection), "utf8"),
  ]));
}

export function validateCompatibilityProjection(value, { production = false } = {}) {
  exactKeys(value, ["schema", "policySha256", "entryId", "runnerId", "primaryLaneId", "fallbackLaneId", "state", "bootId", "observedAtMs", "evidence", "activationReceiptSha256", "routePostimageSha256"], "projection");
  exactKeys(value.evidence, ["preflightSha256", "runnerReceiptSha256", "shadowReceiptSha256"], "projection evidence");
  if (value.schema !== PROJECTION_SCHEMA || !STATES.includes(value.state) || !Number.isSafeInteger(value.observedAtMs)) fail("F4-PROJECTION", "projection header is invalid");
  digest(value.policySha256, "policySha256");
  for (const [key, entry] of Object.entries(value.evidence)) digest(entry, key, true);
  digest(value.activationReceiptSha256, "activationReceiptSha256", true); digest(value.routePostimageSha256, "routePostimageSha256", true);
  if (production && (!value.activationReceiptSha256 || !value.routePostimageSha256)) fail("F4-PRODUCTION-GATE", "production projection lacks F5 activation and route postimage");
  return value;
}

export function deriveAssurance({ compatibilityState, claims, preflightReceipt, terminalCode, verdictBytesObserved }) {
  if (terminalCode !== "verdict-success" || verdictBytesObserved !== true) return { class: "no-usable-review", literal: null };
  const proofKinds = { briefingBounded: "briefing", inputConfined: "input-manifest", technicallyIsolatedReadOnly: "sandbox-preflight", verdictIntegrity: "verdict" };
  const proven = (name) => claims?.[name]?.state === "proven" && Array.isArray(claims[name].evidence)
    && claims[name].evidence.some((entry) => entry?.kind === proofKinds[name] && SHA256.test(entry.rawSha256));
  const allProven = Object.keys(proofKinds).every(proven);
  if (compatibilityState.startsWith("strong-") && preflightReceipt?.eligibility === "strong" && preflightReceipt.networkEnabled === false && allProven) return { class: "technically-isolated", literal: "technically-isolated" };
  if (compatibilityState.startsWith("intermediate-") && preflightReceipt?.eligibility === "intermediate" && preflightReceipt.networkEnabled === true
    && proven("briefingBounded") && proven("technicallyIsolatedReadOnly") && proven("verdictIntegrity")
    && claims?.inputConfined?.state === "not-proven" && Array.isArray(claims.inputConfined.evidence) && claims.inputConfined.evidence.length === 0) return { class: "sandbox-read-only-except-coordinator-scratch-network-open", literal: INTERMEDIATE_LITERAL };
  return { class: "no-usable-review", literal: null };
}

export function decideFallback(policy, input) {
  validateCompatibilityPolicy(policy);
  exactKeys(input, ["selectedRunnerId", "primaryRunnerId", "failureCode", "verdictBytesObserved", "ambiguous", "cleanupAttempted", "fallbackAttempts"], "fallback decision");
  const allowed = input.selectedRunnerId === policy.fallback.runnerId && input.primaryRunnerId === input.selectedRunnerId
    && policy.fallback.allowedFailureCodes.includes(input.failureCode) && input.verdictBytesObserved === false
    && input.ambiguous === false && input.cleanupAttempted === false && input.fallbackAttempts === 0;
  return allowed ? { action: "run-exact-fallback", runnerId: input.selectedRunnerId, laneId: policy.fallback.laneId, assuranceClass: "contractual-read-only", literal: WEAK_LITERAL }
    : { action: "no-fallback", assuranceClass: "no-usable-review", literal: null };
}
