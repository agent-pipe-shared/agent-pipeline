// SPDX-License-Identifier: SUL-1.0
/** Deterministic, provider-neutral workflow dispatch preflight. */
import { createHash } from "node:crypto";
import { validateContinuityState } from "./continuity-state.mjs";

const MODES = new Set(["read-only", "bounded-write", "isolated-write"]);
const PHASE26_MODES = new Set(["read-only", "bounded-write"]);
const FILESYSTEM_EFFECT = { "read-only": "none", "bounded-write": "bounded", "isolated-write": "isolated" };
const ESCALATION_TARGETS = new Set(["PO", "SECURITY", "WORKFLOW-OWNER"]);
const PHASE26_SCHEMA = "pipeline.workflow-dispatch.v0";
const FAILOVER_SCHEMA = "pipeline.workflow-failover.v0";
const FAILOVER_TRUST_SCHEMA = "pipeline.workflow-failover-trust.v0";
const CALIBRATION_SCHEMA = "pipeline.workflow-preflight-calibration.v0";
const CAPABILITIES_SCHEMA = "pipeline.workflow-preflight-capabilities.v0";
const ASSURANCE = "normal-contractual-read-only; OS isolation not asserted";
const SHA256 = /^[a-f0-9]{64}$/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const TRUSTED_ENVIRONMENT_CODES = new Set([
  "host-sandbox-bootstrap-rejected",
  "host-sandbox-capability-unsupported",
  "host-sandbox-broker-disconnected",
  "host-sandbox-calibrated-transport-failure",
]);
const PHASE26_KEYS = new Set([
  "schema", "actorDuty", "taskId", "mode", "sideEffects", "pathAllowlist",
  "commandAllowlist", "verify", "escalationTarget", "continuityBinding",
  "assurance", "failover", "mayDelegate",
]);
const PHASE26_REQUIRED_KEYS = [...PHASE26_KEYS].filter((key) => key !== "mayDelegate");
const BINDING_KEYS = new Set([
  "featureId", "queueRevision", "packageId", "actionId", "dispatchId",
  "attemptId", "authorityDigests", "routeRequestSha256",
]);
const AUTHORITY_DIGEST_KEYS = new Set(["prdSha256", "specSha256", "resultSha256"]);
const FAILOVER_KEYS = new Set([
  "schema", "createdByDuty", "classifier", "origin", "frozen", "budget",
  "fallback", "recoverySlot", "requestedRouteSha256", "effectiveRouteSha256",
]);
const CLASSIFIER_KEYS = new Set([
  "faultDomain", "code", "emittedBy", "environmentEvidenceSha256",
  "productStartMarkerObserved", "validProductVerdict", "evidence",
]);
const EVIDENCE_KEYS = new Set(["exitCode", "signal", "observedBytes", "boundedTailSha256"]);
const ORIGIN_KEYS = new Set(["laneId", "dispatchId", "attemptId", "productRetryCount", "sameLaneRetryAttempted"]);
const FROZEN_KEYS = new Set([
  "taskSha256", "inputSha256", "commitSha256", "treeSha256",
  "pathAllowlistSha256", "toolAllowlistSha256", "budgetSha256",
  "outputSchemaSha256", "narrowingContractSha256",
]);
const BUDGET_KEYS = new Set([
  "wallTimeMs", "tokens", "costUsdMicros", "turns", "commands",
  "outputBytes", "finals",
]);
const FALLBACK_KEYS = new Set([
  "laneId", "dispatchId", "hostIdempotencyKey", "environmentRerouteCount",
  "productRetryCount", "childOrdinal", "childMayRetry",
]);
const SLOT_KEYS = new Set(["reserved", "available"]);
const TRUST_KEYS = new Set(["schema", "creator", "classifier", "origin", "frozen", "original"]);
const CREATOR_KEYS = new Set(["duty", "authorityDigests"]);
const TRUST_FROZEN_KEYS = new Set([
  "taskSha256", "inputSha256", "commitSha256", "treeSha256", "outputSchemaSha256",
]);
const ORIGINAL_KEYS = new Set([
  "pathAllowlist", "commandAllowlist", "budget", "routeMaxima",
  "requestedRouteSha256", "effectiveRouteSha256",
]);
const ROUTE_MAXIMA_KEYS = new Set([
  "environmentRerouteCount", "productRetryCount", "childOrdinal",
]);

function reject(code, escalationTarget) {
  return ESCALATION_TARGETS.has(escalationTarget)
    ? { ok: false, code, escalationTarget }
    : { ok: false, code };
}
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function nonEmptyString(value) { return typeof value === "string" && value.trim() === value && value.length > 0; }
function safeId(value) { return typeof value === "string" && SAFE_ID.test(value); }
function digest(value) { return typeof value === "string" && SHA256.test(value); }
function nullableDigest(value) { return value === null || digest(value); }
function safeInteger(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
function exactKeys(value, keys) {
  if (!isObject(value)) return false;
  const actual = Object.keys(value);
  return actual.length === keys.size && actual.every((key) => keys.has(key));
}
function keysWithOptional(value, keys, required) {
  return isObject(value)
    && Object.keys(value).every((key) => keys.has(key))
    && required.every((key) => Object.hasOwn(value, key));
}
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
function sha256(value) { return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex"); }
function codeUnitBefore(left, right) { return left < right; }

function canonicalPathList(paths, allowEmpty = false) {
  if (!Array.isArray(paths) || (!allowEmpty && paths.length === 0)) return false;
  const seen = new Set();
  for (const entry of paths) {
    if (!nonEmptyString(entry) || entry === "." || entry.includes("\\") || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry) || entry.startsWith("./")
      || entry.split("/").some((part) => part === "" || part === "." || part === "..")
      || seen.has(entry)) return false;
    seen.add(entry);
  }
  return paths.every((entry, index) => index === 0 || codeUnitBefore(paths[index - 1], entry));
}
function canonicalPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return false;
  const seen = new Set();
  for (const entry of paths) {
    if (!nonEmptyString(entry) || entry === "." || entry.includes("\\") || entry.startsWith("/")
      || /^[A-Za-z]:/.test(entry) || entry.startsWith("./")
      || entry.split("/").some((part) => part === "" || part === "." || part === "..")
      || seen.has(entry)) return false;
    seen.add(entry);
  }
  return true;
}

function exactSideEffects(mode, sideEffects, phase26 = false) {
  return exactKeys(sideEffects, new Set(["filesystem", "network"]))
    && sideEffects.filesystem === FILESYSTEM_EFFECT[mode]
    && (phase26 ? sideEffects.network === "none" : ["none", "declared"].includes(sideEffects.network));
}
function phase26TaskTightAllowlist(taskId, allowlist, sorted = false) {
  if (!safeId(taskId) || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  const ids = new Set();
  const valid = allowlist.every((entry) => exactKeys(entry, new Set(["id", "taskId", "command"]))
    && safeId(entry.id) && nonEmptyString(entry.command) && entry.taskId === taskId
    && !ids.has(entry.id) && entry.command.includes(" ") && !(/[|;&`$*<>\n\r]/.test(entry.command))
    && (ids.add(entry.id), true));
  return valid && (!sorted || allowlist.every((entry, index) => index === 0 || codeUnitBefore(allowlist[index - 1].id, entry.id)));
}
function legacyTaskTightAllowlist(taskId, allowlist) {
  if (!nonEmptyString(taskId) || !Array.isArray(allowlist) || allowlist.length === 0) return false;
  const ids = new Set();
  return allowlist.every((entry) => isObject(entry)
    && nonEmptyString(entry.id)
    && nonEmptyString(entry.command)
    && entry.taskId === taskId
    && !ids.has(entry.id)
    && entry.command.includes(" ")
    && !(/[|;&`$*<>\n\r]/.test(entry.command))
    && (ids.add(entry.id), true));
}
function exactVerify(verify, calibratedEntrypoints) {
  if (!isObject(verify) || verify.exact !== true) return false;
  if (nonEmptyString(verify.command) && Object.keys(verify).length === 2) return true;
  return nonEmptyString(verify.entrypoint) && Object.keys(verify).length === 2
    && Array.isArray(calibratedEntrypoints) && calibratedEntrypoints.includes(verify.entrypoint);
}
function pathCovers(allowlisted, protectedPath) {
  return allowlisted === protectedPath
    || protectedPath.startsWith(`${allowlisted}/`)
    || allowlisted.startsWith(`${protectedPath}/`);
}
function validAuthorityDigests(value) {
  return exactKeys(value, AUTHORITY_DIGEST_KEYS)
    && digest(value.prdSha256)
    && digest(value.specSha256)
    && nullableDigest(value.resultSha256);
}
function sameAuthorityDigests(left, right) {
  return left.prdSha256 === right.prdSha256
    && left.specSha256 === right.specSha256
    && left.resultSha256 === right.resultSha256;
}
function sameCanonical(left, right) { return canonicalJson(left) === canonicalJson(right); }

export function computeWorkflowRouteRequestSha256(request) {
  const binding = isObject(request?.continuityBinding)
    ? Object.fromEntries(Object.entries(request.continuityBinding).filter(([key]) => key !== "routeRequestSha256"))
    : request?.continuityBinding;
  return sha256({ ...request, mayDelegate: request?.mayDelegate ?? false, continuityBinding: binding });
}
export function computeWorkflowEnvironmentEvidenceSha256(classifier) {
  if (!isObject(classifier)) return null;
  const { environmentEvidenceSha256: _ignored, ...structuredEvidence } = classifier;
  return sha256(structuredEvidence);
}
export function deriveWorkflowFailoverIds(input) {
  const material = {
    originLaneId: input.originLaneId,
    originDispatchId: input.originDispatchId,
    queueRevision: input.queueRevision,
    environmentEvidenceSha256: input.environmentEvidenceSha256,
    narrowingContractSha256: input.narrowingContractSha256,
  };
  return {
    laneId: `fallback-lane-${sha256({ kind: "lane", ...material }).slice(0, 32)}`,
    dispatchId: `fallback-dispatch-${sha256({ kind: "dispatch", ...material }).slice(0, 32)}`,
  };
}
export function computeWorkflowNarrowingContractSha256(request, failover) {
  return sha256({
    taskSha256: failover.frozen.taskSha256,
    inputSha256: failover.frozen.inputSha256,
    commitSha256: failover.frozen.commitSha256,
    treeSha256: failover.frozen.treeSha256,
    pathAllowlist: request.pathAllowlist,
    commandAllowlist: request.commandAllowlist,
    budget: failover.budget,
    outputSchemaSha256: failover.frozen.outputSchemaSha256,
    requestedRouteSha256: failover.requestedRouteSha256,
    effectiveRouteSha256: failover.effectiveRouteSha256,
    mayDelegate: false,
    assurance: ASSURANCE,
  });
}

function validPhase26Envelope(request, calibration, capabilities) {
  return keysWithOptional(request, PHASE26_KEYS, PHASE26_REQUIRED_KEYS)
    && request.schema === PHASE26_SCHEMA && safeId(request.actorDuty) && safeId(request.taskId)
    && PHASE26_MODES.has(request.mode) && exactSideEffects(request.mode, request.sideEffects, true)
    && exactKeys(request.pathAllowlist, new Set(["read", "write"]))
    && canonicalPathList(request.pathAllowlist.read, true) && canonicalPathList(request.pathAllowlist.write, true)
    && (request.mode !== "read-only" || request.pathAllowlist.write.length === 0)
    && phase26TaskTightAllowlist(request.taskId, request.commandAllowlist, true)
    && exactVerify(request.verify, calibration?.verifyEntrypoints)
    && ESCALATION_TARGETS.has(request.escalationTarget)
    && exactKeys(request.assurance, new Set(["statement", "osIsolationAsserted"]))
    && request.assurance.statement === ASSURANCE && request.assurance.osIsolationAsserted === false
    && (request.mayDelegate === undefined || request.mayDelegate === false)
    && exactKeys(request.continuityBinding, BINDING_KEYS)
    && validAuthorityDigests(request.continuityBinding.authorityDigests)
    && exactKeys(calibration, new Set(["schema", "preflightOwnerDuty", "verifyEntrypoints"]))
    && calibration.schema === CALIBRATION_SCHEMA && calibration.preflightOwnerDuty === "Coordinator"
    && Array.isArray(calibration.verifyEntrypoints)
    && exactKeys(capabilities, new Set([
      "schema", "contractualPathBoundary", "noWriteEnforced",
      "idempotentDispatchKeys", "availableRecoverySlots",
    ]))
    && capabilities.schema === CAPABILITIES_SCHEMA
    && capabilities.contractualPathBoundary === true
    && typeof capabilities.noWriteEnforced === "boolean"
    && typeof capabilities.idempotentDispatchKeys === "boolean"
    && safeInteger(capabilities.availableRecoverySlots, 0, 1);
}

function validateContinuityBinding(request, state) {
  const valid = validateContinuityState(state, request.continuityBinding.featureId);
  if (!valid.ok) return "WF-CONTINUITY-INVALID";
  const binding = request.continuityBinding;
  if (binding.queueRevision !== state.revision) return "WF-CONTINUITY-STALE";
  const head = state.queueHead;
  const dispatch = head?.dispatch;
  if (state.runtime.activeDuty !== request.actorDuty
    || head === null || dispatch === null
    || head.packageId !== binding.packageId || head.actionId !== binding.actionId
    || dispatch.featureId !== binding.featureId || dispatch.queueRevision !== binding.queueRevision
    || dispatch.dispatchId !== binding.dispatchId || dispatch.attemptId !== binding.attemptId
    || !sameAuthorityDigests(binding.authorityDigests, dispatch.authorityDigests)
    || binding.authorityDigests.prdSha256 !== state.authority.prd.sha256
    || binding.authorityDigests.specSha256 !== state.authority.spec.sha256
    || binding.authorityDigests.resultSha256 !== (state.authority.result?.sha256 ?? null)
    || dispatch.routeRequestSha256 !== binding.routeRequestSha256) return "WF-CONTINUITY-HEAD";
  if (computeWorkflowRouteRequestSha256(request) !== binding.routeRequestSha256) return "WF-ROUTE-BINDING";
  return null;
}

function validateNonCoordinatorPaths(request, state) {
  if (request.actorDuty === "Coordinator") return null;
  const protectedPaths = [
    ".claude/pipeline-state.json", "docs/state.md", state.authority.prd.path,
    state.authority.spec.path, ...(state.authority.result === null ? [] : [state.authority.result.path]),
  ];
  return request.pathAllowlist.write.some((allowed) => protectedPaths.some((path) => pathCovers(allowed, path)))
    ? "WF-GLOBAL-STATE-PROHIBITED" : null;
}

function validClassifier(classifier, bindStructuredEvidence = false) {
  const evidence = classifier?.evidence;
  return exactKeys(classifier, CLASSIFIER_KEYS)
    && classifier.faultDomain === "execution-environment"
    && TRUSTED_ENVIRONMENT_CODES.has(classifier.code)
    && classifier.emittedBy === "continuity-host-adapter"
    && digest(classifier.environmentEvidenceSha256)
    && (!bindStructuredEvidence
      || classifier.environmentEvidenceSha256 === computeWorkflowEnvironmentEvidenceSha256(classifier))
    && classifier.productStartMarkerObserved === false
    && classifier.validProductVerdict === false
    && exactKeys(evidence, EVIDENCE_KEYS)
    && (evidence.exitCode === null || safeInteger(evidence.exitCode, 0, 255))
    && (evidence.signal === null || safeId(evidence.signal))
    && safeInteger(evidence.observedBytes, 0, 65_536)
    && digest(evidence.boundedTailSha256);
}

function validOrigin(origin) {
  return exactKeys(origin, ORIGIN_KEYS)
    && [origin.laneId, origin.dispatchId, origin.attemptId].every(safeId)
    && safeInteger(origin.productRetryCount, 0, 1)
    && origin.sameLaneRetryAttempted === false;
}

function validHardBudget(budget) {
  return exactKeys(budget, BUDGET_KEYS)
    && safeInteger(budget.wallTimeMs, 1, 86_400_000)
    && safeInteger(budget.tokens, 1, 10_000_000)
    && safeInteger(budget.costUsdMicros, 0, 1_000_000_000)
    && safeInteger(budget.turns, 1, 100)
    && safeInteger(budget.commands, 1, 10_000)
    && safeInteger(budget.outputBytes, 1, 16_777_216)
    && budget.finals === 1;
}

function validFailoverShape(failover) {
  const classifier = failover?.classifier;
  const origin = failover?.origin;
  const frozen = failover?.frozen;
  const budget = failover?.budget;
  const fallback = failover?.fallback;
  return exactKeys(failover, FAILOVER_KEYS) && failover.schema === FAILOVER_SCHEMA
    && failover.createdByDuty === "Coordinator"
    && validClassifier(classifier)
    && validOrigin(origin)
    && exactKeys(frozen, FROZEN_KEYS) && Object.values(frozen).every(digest)
    && validHardBudget(budget)
    && exactKeys(fallback, FALLBACK_KEYS)
    && [fallback.laneId, fallback.dispatchId, fallback.hostIdempotencyKey].every(safeId)
    && fallback.environmentRerouteCount === 1 && safeInteger(fallback.productRetryCount, 0, 1)
    && fallback.childOrdinal === 1 && fallback.childMayRetry === false
    && exactKeys(failover.recoverySlot, SLOT_KEYS)
    && failover.recoverySlot.reserved === 1 && failover.recoverySlot.available === 1
    && digest(failover.requestedRouteSha256) && digest(failover.effectiveRouteSha256);
}

function validTrustedCoordinatorContext(context, request) {
  const original = context?.original;
  const routeMaxima = original?.routeMaxima;
  return exactKeys(context, TRUST_KEYS)
    && context.schema === FAILOVER_TRUST_SCHEMA
    && exactKeys(context.creator, CREATOR_KEYS)
    && context.creator.duty === "Coordinator"
    && validAuthorityDigests(context.creator.authorityDigests)
    && validClassifier(context.classifier, true)
    && validOrigin(context.origin)
    && exactKeys(context.frozen, TRUST_FROZEN_KEYS)
    && Object.values(context.frozen).every(digest)
    && exactKeys(original, ORIGINAL_KEYS)
    && exactKeys(original.pathAllowlist, new Set(["read", "write"]))
    && canonicalPathList(original.pathAllowlist.read, true)
    && canonicalPathList(original.pathAllowlist.write, true)
    && phase26TaskTightAllowlist(request.taskId, original.commandAllowlist, true)
    && validHardBudget(original.budget)
    && exactKeys(routeMaxima, ROUTE_MAXIMA_KEYS)
    && routeMaxima.environmentRerouteCount === 1
    && safeInteger(routeMaxima.productRetryCount, 0, 1)
    && routeMaxima.childOrdinal === 1
    && digest(original.requestedRouteSha256)
    && digest(original.effectiveRouteSha256);
}

function pathsAreSubset(current, original) {
  return current.every((path) => original.some((allowed) => path === allowed || path.startsWith(`${allowed}/`)));
}

function commandsAreSubset(current, original) {
  const originals = new Set(original.map(canonicalJson));
  return current.every((command) => originals.has(canonicalJson(command)));
}

function budgetNoBroader(current, maximum) {
  return [...BUDGET_KEYS].every((key) => current[key] <= maximum[key]);
}

function hasStrictNarrowing(request, failover, trusted) {
  const original = trusted.original;
  return request.pathAllowlist.read.length < original.pathAllowlist.read.length
    || request.pathAllowlist.write.length < original.pathAllowlist.write.length
    || request.commandAllowlist.length < original.commandAllowlist.length
    || [...BUDGET_KEYS].some((key) => failover.budget[key] < original.budget[key]);
}

function validateFailoverTrust(request, state, trusted) {
  const failover = request.failover;
  if (!validTrustedCoordinatorContext(trusted, request)) return "WF-FAILOVER-TRUST";
  if (failover.createdByDuty !== trusted.creator.duty
    || !sameAuthorityDigests(trusted.creator.authorityDigests, request.continuityBinding.authorityDigests)
    || trusted.creator.authorityDigests.prdSha256 !== state.authority.prd.sha256
    || trusted.creator.authorityDigests.specSha256 !== state.authority.spec.sha256
    || trusted.creator.authorityDigests.resultSha256 !== (state.authority.result?.sha256 ?? null)
    || !sameCanonical(failover.classifier, trusted.classifier)
    || !sameCanonical(failover.origin, trusted.origin)
    || failover.frozen.taskSha256 !== trusted.frozen.taskSha256
    || failover.frozen.inputSha256 !== trusted.frozen.inputSha256
    || failover.frozen.commitSha256 !== trusted.frozen.commitSha256
    || failover.frozen.treeSha256 !== trusted.frozen.treeSha256
    || failover.frozen.outputSchemaSha256 !== trusted.frozen.outputSchemaSha256
    || failover.requestedRouteSha256 !== trusted.original.requestedRouteSha256
    || failover.effectiveRouteSha256 !== trusted.original.effectiveRouteSha256) return "WF-FAILOVER-TRUST";
  if (!pathsAreSubset(request.pathAllowlist.read, trusted.original.pathAllowlist.read)
    || !pathsAreSubset(request.pathAllowlist.write, trusted.original.pathAllowlist.write)
    || !commandsAreSubset(request.commandAllowlist, trusted.original.commandAllowlist)
    || !budgetNoBroader(failover.budget, trusted.original.budget)
    || failover.fallback.environmentRerouteCount > trusted.original.routeMaxima.environmentRerouteCount
    || failover.fallback.productRetryCount > trusted.original.routeMaxima.productRetryCount
    || failover.fallback.childOrdinal > trusted.original.routeMaxima.childOrdinal
    || !hasStrictNarrowing(request, failover, trusted)) return "WF-FAILOVER-NARROWING";
  return null;
}

function validateFailover(request, state, capabilities, trustedCoordinatorContext) {
  /* Admission only. Coordinator recovery transitions and their durable receipt
   * remain P2 non-claims; this preflight does not claim complete AC-10. */
  const failover = request.failover;
  if (failover === null) return null;
  if (!validFailoverShape(failover) || request.actorDuty === "Coordinator") return "WF-FAILOVER-SCHEMA";
  const trustCode = validateFailoverTrust(request, state, trustedCoordinatorContext);
  if (trustCode) return trustCode;
  const recovery = state.recovery;
  const expected = deriveWorkflowFailoverIds({
    originLaneId: failover.origin.laneId,
    originDispatchId: failover.origin.dispatchId,
    queueRevision: state.revision,
    environmentEvidenceSha256: failover.classifier.environmentEvidenceSha256,
    narrowingContractSha256: failover.frozen.narrowingContractSha256,
  });
  if (failover.frozen.pathAllowlistSha256 !== sha256(request.pathAllowlist)
    || failover.frozen.toolAllowlistSha256 !== sha256(request.commandAllowlist)
    || failover.frozen.budgetSha256 !== sha256(failover.budget)
    || failover.frozen.narrowingContractSha256 !== computeWorkflowNarrowingContractSha256(request, failover)) {
    return "WF-FAILOVER-FROZEN";
  }
  if (failover.fallback.laneId !== expected.laneId || failover.fallback.dispatchId !== expected.dispatchId
    || failover.fallback.laneId === failover.origin.laneId
    || failover.fallback.dispatchId === failover.origin.dispatchId
    || failover.fallback.hostIdempotencyKey !== failover.fallback.dispatchId) return "WF-FAILOVER-IDENTITY";
  if (capabilities.idempotentDispatchKeys !== true || capabilities.availableRecoverySlots !== 1
    || state.capacity.reservedRecoverySlots !== 1 || recovery === null
    || !["fallback-pending", "running"].includes(recovery.fallbackStatus)
    || recovery.resultDigest !== null || recovery.count !== 1
    || recovery.sameLaneRetryProhibited !== true
    || recovery.originLaneId !== failover.origin.laneId
    || recovery.originDispatchId !== failover.origin.dispatchId
    || recovery.originAttemptId !== failover.origin.attemptId
    || recovery.environmentEvidenceSha256 !== failover.classifier.environmentEvidenceSha256
    || recovery.fallbackLaneId !== failover.fallback.laneId
    || recovery.fallbackDispatchId !== failover.fallback.dispatchId
    || recovery.narrowingContractSha256 !== failover.frozen.narrowingContractSha256
    || recovery.originProductRetryCount !== failover.origin.productRetryCount
    || state.queueHead.environmentRerouteCount !== 1
    || state.queueHead.productRetryCount !== failover.origin.productRetryCount
    || failover.fallback.productRetryCount !== failover.origin.productRetryCount) return "WF-FAILOVER-STATE";
  return null;
}

function validatePhase26(request, calibration, capabilities, continuityState, trustedCoordinatorContext) {
  const escalation = isObject(request) ? request.escalationTarget : undefined;
  if (!validPhase26Envelope(request, calibration, capabilities)) return reject("WF-PHASE26-SCHEMA", escalation);
  if (request.mode === "read-only" && capabilities.noWriteEnforced !== true) return reject("WF-NO-WRITE", escalation);
  const continuityCode = validateContinuityBinding(request, continuityState);
  if (continuityCode) return reject(continuityCode, escalation);
  const pathCode = validateNonCoordinatorPaths(request, continuityState);
  if (pathCode) return reject(pathCode, escalation);
  const failoverCode = validateFailover(request, continuityState, capabilities, trustedCoordinatorContext);
  if (failoverCode) return reject(failoverCode, escalation);
  return {
    ok: true,
    code: "WF-ACCEPTED",
    request: { ...request, mayDelegate: false },
    assurance: ASSURANCE,
    continuityRevision: continuityState.revision,
  };
}

/* Legacy Phase-2/P5 bridge. `verified` is only a logical control-calibration
 * declaration retained for runner compatibility; it is never OS-isolation evidence. */
function validateLegacy(request, calibration, capabilities) {
  const escalation = isObject(request) && nonEmptyString(request.escalationTarget) ? request.escalationTarget : undefined;
  if (!isObject(request) || !isObject(calibration) || !isObject(capabilities)) return reject("WF-MALFORMED", escalation);
  if (!MODES.has(request.mode)) return reject("WF-MODE", escalation);
  if (!exactSideEffects(request.mode, request.sideEffects)) return reject("WF-SIDE-EFFECTS", escalation);
  if (!canonicalPaths(request.allowedPaths)) return reject("WF-PATHS", escalation);
  if (!isObject(request.isolation) || !nonEmptyString(request.isolation.kind) || request.isolation.verified !== true
    || !isObject(calibration.isolationByMode) || calibration.isolationByMode[request.mode] !== request.isolation.kind
    || capabilities.isolation?.[request.isolation.kind] !== true) return reject("WF-ISOLATION", escalation);
  if (!isObject(request.guard) || !nonEmptyString(request.guard.id) || request.guard.active !== true
    || !Array.isArray(request.guard.modes) || !request.guard.modes.includes(request.mode)
    || capabilities.guards?.[request.guard.id] !== true) return reject("WF-GUARD", escalation);
  if (!legacyTaskTightAllowlist(request.taskId, request.commandAllowlist)) return reject("WF-ALLOWLIST", escalation);
  if (!exactVerify(request.verify, calibration.verifyEntrypoints)) return reject("WF-VERIFY", escalation);
  if (!ESCALATION_TARGETS.has(request.escalationTarget)) return reject("WF-ESCALATION", escalation);
  if (request.mode === "read-only" && capabilities.noWriteEnforced !== true) return reject("WF-NO-WRITE", escalation);
  if (request.mode === "bounded-write") {
    const required = calibration.boundedWriteControls;
    const actual = capabilities.boundedWriteControls;
    if (calibration.boundedWriteAllowed !== true || !Array.isArray(required) || required.length === 0
      || !isObject(actual) || !required.every((control) => nonEmptyString(control) && actual[control] === true)) {
      return reject("WF-BOUNDED-CAPABILITY", escalation);
    }
  }
  if (request.mode === "isolated-write"
    && (capabilities.isolatedWorktree !== true || capabilities.hooks?.[request.guard.id] !== true)) {
    return reject("WF-ISOLATED-CAPABILITY", escalation);
  }
  return { ok: true, request, assurance: ASSURANCE };
}

/** Validate a dispatch. Phase-2.6 callers must supply a validated state snapshot. */
export function validateWorkflowWriterDispatch(
  request,
  calibration,
  capabilities,
  continuityState = undefined,
  trustedCoordinatorContext = undefined,
) {
  return isObject(request) && (request.schema === PHASE26_SCHEMA || Object.hasOwn(request, "continuityBinding"))
    ? validatePhase26(request, calibration, capabilities, continuityState, trustedCoordinatorContext)
    : validateLegacy(request, calibration, capabilities);
}

/** Read state, fail closed, then invoke an injected adapter at most once. */
export function preflightAndInvokeWorkflowWriterDispatch(request, calibration, capabilities, boundary) {
  const isFailover = isObject(request) && request.failover !== null;
  const boundaryKeys = isFailover
    ? new Set(["readContinuityState", "readTrustedCoordinatorContext", "invokeAdapter"])
    : new Set(["readContinuityState", "invokeAdapter"]);
  if (!isObject(request) || request.schema !== PHASE26_SCHEMA
    || !exactKeys(boundary, boundaryKeys)
    || typeof boundary.readContinuityState !== "function"
    || (isFailover && typeof boundary.readTrustedCoordinatorContext !== "function")
    || typeof boundary.invokeAdapter !== "function") {
    return {
      ok: false, code: "WF-PREFLIGHT-BOUNDARY", stateReads: 0,
      trustedContextReads: 0, adapterInvocations: 0,
    };
  }
  let state;
  try { state = boundary.readContinuityState(); } catch {
    return {
      ok: false, code: "WF-CONTINUITY-READ", stateReads: 1,
      trustedContextReads: 0, adapterInvocations: 0,
    };
  }
  let trustedCoordinatorContext;
  if (isFailover) {
    try { trustedCoordinatorContext = boundary.readTrustedCoordinatorContext(); } catch {
      return {
        ok: false, code: "WF-FAILOVER-TRUST-READ", stateReads: 1,
        trustedContextReads: 1, adapterInvocations: 0,
      };
    }
  }
  const checked = validatePhase26(request, calibration, capabilities, state, trustedCoordinatorContext);
  if (!checked.ok) {
    return {
      ...checked, stateReads: 1, trustedContextReads: isFailover ? 1 : 0,
      adapterInvocations: 0,
    };
  }
  try { boundary.invokeAdapter(checked.request); } catch {
    return {
      ok: false, code: "WF-ADAPTER-FAILED", stateReads: 1,
      trustedContextReads: isFailover ? 1 : 0, adapterInvocations: 1,
    };
  }
  return {
    ok: true, code: "WF-ACCEPTED", stateReads: 1,
    trustedContextReads: isFailover ? 1 : 0, adapterInvocations: 1,
    continuityRevision: checked.continuityRevision,
  };
}

export const WORKFLOW_WRITER_PREFLIGHT_CODES = Object.freeze([
  "WF-MALFORMED", "WF-MODE", "WF-SIDE-EFFECTS", "WF-PATHS", "WF-ISOLATION",
  "WF-GUARD", "WF-ALLOWLIST", "WF-VERIFY", "WF-ESCALATION", "WF-NO-WRITE",
  "WF-BOUNDED-CAPABILITY", "WF-ISOLATED-CAPABILITY", "WF-PHASE26-SCHEMA",
  "WF-CONTINUITY-INVALID", "WF-CONTINUITY-STALE", "WF-CONTINUITY-HEAD",
  "WF-ROUTE-BINDING", "WF-GLOBAL-STATE-PROHIBITED", "WF-FAILOVER-SCHEMA",
  "WF-FAILOVER-TRUST", "WF-FAILOVER-TRUST-READ", "WF-FAILOVER-NARROWING",
  "WF-FAILOVER-FROZEN", "WF-FAILOVER-IDENTITY", "WF-FAILOVER-STATE",
  "WF-PREFLIGHT-BOUNDARY", "WF-CONTINUITY-READ", "WF-ADAPTER-FAILED", "WF-ACCEPTED",
]);

export const WORKFLOW_WRITER_ASSURANCE = ASSURANCE;
