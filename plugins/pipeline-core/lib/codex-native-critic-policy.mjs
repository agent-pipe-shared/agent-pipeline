// SPDX-License-Identifier: SUL-1.0

/**
 * Pure contract for the distinct native model-tool Critic boundary.
 *
 * This module validates supplied, sanitized observations. It does not launch
 * Codex, read host state, or authenticate a caller's probe JSON; the host must
 * obtain the smoke receipt from its own actual same-host probe before asking
 * this module to bind it. The boundary covers model tool actions only. The
 * trusted Codex runtime, authentication, and cache remain outside it.
 */
import { createHash } from "node:crypto";

const SHA256 = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const COMMIT_SHA = /^[a-f0-9]{40}$/;
const SELECTION_ID = /^cncs_[a-z2-7]{26}$/;
const RFC3339_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

export const NATIVE_CRITIC_POLICY = Object.freeze({
  threadSandbox: "read-only",
  turn: Object.freeze({ type: "readOnly", networkAccess: false }),
});

export const NATIVE_CRITIC_ASSURANCE = Object.freeze({
  class: "native-model-tool-read-only",
  literal: "native model-tool read-only; trusted Codex runtime/auth/cache outside boundary",
});

function fail(message) { throw new Error(`native Critic policy: ${message}`); }
function exactKeys(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify([...keys].sort())) fail(`${label} is not closed`);
}
function digest(value, label) {
  if (typeof value !== "string" || !SHA256.test(value)) fail(`${label} must be SHA-256`);
}
function clone(value) { return structuredClone(value); }
function equal(left, right) { return canonicalNativeCriticJson(left) === canonicalNativeCriticJson(right); }
function timestamp(value, label) {
  if (typeof value !== "string" || !RFC3339_UTC.test(value) || Number.isNaN(Date.parse(value))) fail(`${label} is invalid`);
  const milliseconds = Date.parse(value);
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  if (new Date(milliseconds).toISOString() !== normalized) fail(`${label} is not a real UTC timestamp`);
  return milliseconds;
}

function canonicalValue(value) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) fail("canonical value is not JSON data");
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalNativeCriticJson(value) { return `${JSON.stringify(canonicalValue(value))}\n`; }
export function nativeCriticCanonicalDigest(value) {
  return createHash("sha256").update(canonicalNativeCriticJson(value), "utf8").digest("hex");
}

export function validateNativeCriticPolicy(value) {
  exactKeys(value, ["threadSandbox", "turn"], "native policy");
  exactKeys(value.turn, ["type", "networkAccess"], "native turn policy");
  if (!equal(value, NATIVE_CRITIC_POLICY)) fail("policy is not the approved native read-only policy");
  return clone(NATIVE_CRITIC_POLICY);
}

function validateHost(value) {
  exactKeys(value, ["platformClass", "kernel", "filesystemClass", "bootIdSha256"], "native host");
  exactKeys(value.kernel, ["sysname", "release", "machine"], "native host kernel");
  if (value.platformClass !== "linux-wsl2" || value.filesystemClass !== "wsl2-native"
    || typeof value.kernel.sysname !== "string" || value.kernel.sysname.length === 0
    || typeof value.kernel.release !== "string" || value.kernel.release.length === 0
    || typeof value.kernel.machine !== "string" || value.kernel.machine.length === 0) fail("host is not the approved WSL tuple");
  digest(value.bootIdSha256, "host boot identifier");
  return clone(value);
}

export function validateNativeCriticTuple(value) {
  exactKeys(value, ["cli", "protocolSchemaSha256", "host", "policy", "toolSurface"], "native tuple");
  exactKeys(value.cli, ["version", "sha256"], "native CLI");
  if (typeof value.cli.version !== "string" || value.cli.version.length === 0) fail("CLI version is invalid");
  digest(value.cli.sha256, "CLI digest");
  digest(value.protocolSchemaSha256, "protocol schema digest");
  validateHost(value.host);
  validateNativeCriticPolicy(value.policy);
  exactKeys(value.toolSurface, ["configSha256", "observationSha256"], "native tool surface");
  digest(value.toolSurface.configSha256, "tool configuration digest");
  // This is a sanitized fixed prohibited-feature/MCP-empty observation, not
  // an asserted complete inventory of the native read tools Codex exposes.
  digest(value.toolSurface.observationSha256, "tool-surface observation digest");
  return clone(value);
}

function validateSmokeObserved(value) {
  exactKeys(value, ["initialized", "readObserved", "writeObserved", "nativeWriteDenied", "canaryUnchanged", "hostWriteControl", "sourceUnchanged", "protocolError", "guardDenial", "sandboxLaunchDenied", "timedOut", "cleanupComplete", "terminal"], "native smoke observation");
  for (const key of ["initialized", "readObserved", "writeObserved", "nativeWriteDenied", "canaryUnchanged", "hostWriteControl", "sourceUnchanged", "cleanupComplete"]) {
    if (value[key] !== true) fail(`native smoke ${key} is not proven`);
  }
  for (const key of ["protocolError", "guardDenial", "sandboxLaunchDenied", "timedOut"]) {
    if (value[key] !== false) fail(`native smoke ${key} is unsafe`);
  }
  exactKeys(value.terminal, ["exitCode", "signal", "spawnFailed"], "native smoke terminal");
  if (value.terminal.exitCode !== 0 || value.terminal.signal !== null || value.terminal.spawnFailed !== false) fail("native smoke terminal is not clean");
}

function timeOptions(options) {
  exactKeys(options, ["nowMs", "maxAgeMs"], "native smoke time options");
  if (!Number.isSafeInteger(options.nowMs) || options.nowMs < 0 || !Number.isSafeInteger(options.maxAgeMs) || options.maxAgeMs <= 0) fail("native smoke time options are invalid");
  return options;
}

export function validateNativeCriticSmokeReceipt(receipt, expectedTuple, options) {
  const tuple = validateNativeCriticTuple(expectedTuple);
  const { nowMs, maxAgeMs } = timeOptions(options);
  exactKeys(receipt, ["schema", "status", "tuple", "observed", "capturedAt"], "native smoke receipt");
  if (receipt.schema !== "pipeline.codex-native-critic-smoke.v1" || receipt.status !== "passed") fail("native smoke receipt is not passed v1 evidence");
  if (!equal(validateNativeCriticTuple(receipt.tuple), tuple)) fail("native smoke tuple drifted");
  validateSmokeObserved(receipt.observed);
  const capturedAtMs = timestamp(receipt.capturedAt, "native smoke timestamp");
  if (capturedAtMs > nowMs || nowMs - capturedAtMs > maxAgeMs) fail("native smoke timestamp is stale or future");
  return clone(receipt);
}

function validateDispatch(value) {
  exactKeys(value, ["queueRevision", "candidateCommit", "candidateTree", "referenceSetSha256", "requestSha256"], "native selection dispatch");
  if (!Number.isSafeInteger(value.queueRevision) || value.queueRevision < 0 || !OID.test(value.candidateCommit) || !OID.test(value.candidateTree)) fail("native selection dispatch is invalid");
  digest(value.referenceSetSha256, "reference set digest"); digest(value.requestSha256, "request digest");
  return clone(value);
}
function validateRouteShape(value) {
  exactKeys(value, ["dutyId", "runner", "model", "effort", "sourceSha256", "candidateCommit"], "native Critic route");
  if (value.dutyId !== "critic_high_risk" || value.runner !== "codex" || typeof value.model !== "string" || value.model.length === 0
    || typeof value.effort !== "string" || value.effort.length === 0 || !COMMIT_SHA.test(value.candidateCommit)) fail("native Critic route is invalid");
  digest(value.sourceSha256, "route authority digest");
  return clone(value);
}
function validateAssurance(value) {
  exactKeys(value, ["class", "literal"], "native Critic assurance");
  if (!equal(value, NATIVE_CRITIC_ASSURANCE)) fail("native Critic assurance drifted");
  return clone(NATIVE_CRITIC_ASSURANCE);
}

function selectionOptions(options) {
  exactKeys(options, ["validateRoute", "expectedTuple", "nowMs", "maxSmokeAgeMs"], "native selection options");
  if (typeof options.validateRoute !== "function") fail("V3 route validator is unavailable");
  validateNativeCriticTuple(options.expectedTuple);
  timeOptions({ nowMs: options.nowMs, maxAgeMs: options.maxSmokeAgeMs });
  return options;
}

function validateSelectionShape(value, options) {
  const { validateRoute, expectedTuple, nowMs, maxSmokeAgeMs } = selectionOptions(options);
  exactKeys(value, ["schema", "selectionId", "repoFingerprint", "duty", "dispatch", "route", "poDecisionSha256", "smokeReceipt", "smokeReceiptSha256", "tuple", "assurance", "status", "createdAt"], "native Critic selection");
  if (value.schema !== "pipeline.codex-native-critic-selection.v1" || !SELECTION_ID.test(value.selectionId)
    || !SHA256.test(value.repoFingerprint) || value.duty !== "critic" || value.status !== "selected") fail("native Critic selection header is invalid");
  const dispatch = validateDispatch(value.dispatch);
  const route = validateRouteShape(value.route);
  let validatedRoute;
  try { validatedRoute = validateRoute(clone(route)); } catch { fail("V3 route authority rejected native Critic route"); }
  if (!equal(validatedRoute, route) || route.candidateCommit !== dispatch.candidateCommit) fail("native Critic route binding drifted");
  digest(value.poDecisionSha256, "PO decision digest");
  const tuple = validateNativeCriticTuple(value.tuple);
  const currentTuple = validateNativeCriticTuple(expectedTuple);
  if (!equal(tuple, currentTuple)) fail("native selection current tuple drifted");
  const smoke = validateNativeCriticSmokeReceipt(value.smokeReceipt, currentTuple, { nowMs, maxAgeMs: maxSmokeAgeMs });
  if (value.smokeReceiptSha256 !== nativeCriticCanonicalDigest(smoke)) fail("native smoke digest drifted");
  validateAssurance(value.assurance);
  if (timestamp(value.createdAt, "native selection timestamp") > nowMs) fail("native selection timestamp is future");
  return clone(value);
}

/** Validates a persisted native selection only through a caller-supplied V3 authority validator. */
export function validateNativeCriticSelection(value, options) { return validateSelectionShape(value, options); }

/**
 * Constructs the sole selected native Critic record. It cannot emit a weak,
 * fallback, or unavailable record: missing proof and authority drift throw.
 */
export function buildNativeCriticSelection(input, options) {
  exactKeys(input, ["selectionId", "repoFingerprint", "dispatch", "route", "poDecisionSha256", "smokeReceipt", "smokeReceiptSha256", "createdAt"], "native selection input");
  const { expectedTuple } = selectionOptions(options);
  return validateSelectionShape({
    schema: "pipeline.codex-native-critic-selection.v1",
    selectionId: input.selectionId,
    repoFingerprint: input.repoFingerprint,
    duty: "critic",
    dispatch: clone(input.dispatch),
    route: clone(input.route),
    poDecisionSha256: input.poDecisionSha256,
    smokeReceipt: clone(input.smokeReceipt),
    smokeReceiptSha256: input.smokeReceiptSha256,
    tuple: clone(expectedTuple),
    assurance: clone(NATIVE_CRITIC_ASSURANCE),
    status: "selected",
    createdAt: input.createdAt,
  }, options);
}
