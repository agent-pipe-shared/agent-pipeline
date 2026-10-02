// SPDX-License-Identifier: SUL-1.0

/**
 * Candidate-bound Antigravity implementation dispatch.
 *
 * This module deliberately does not create human consent.  The caller must
 * supply an already-produced, session-bound consent record from the attended
 * authority path.  It performs the last admission check, then delegates to
 * the existing runner-neutral role preflight and AGY process boundary.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

import { invokeAgy } from "./antigravity-execution-host.mjs";
import { AGY_FINAL_RETURN_JSON_SCHEMA, validateAgyFinalReturn, validateAgyFamilyReturnBinding } from "./agy-final-return.mjs";
import { parseStrictJson } from "./governance-event.mjs";
import { bindStoredModelRoleDispatch } from "./model-role-host-session.mjs";
import { ROLE_DISPATCH_PREFLIGHT_SCHEMA, preflightRoleDispatch } from "./role-dispatch-preflight.mjs";
import { loadRunnerProfilesV3Registry, validateRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";
import { recheckAgyFamilyConsentBinding, AGY_FAMILY_BINDING_SCHEMA } from "./agy-session-authority.mjs";
import { observeModelFamilyActivation } from "./model-family-runtime-host.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { createModelFamilyInvocationEntry } from "./model-family-invocation.mjs";
import { createModelFamilyExecutionHost, validateInvocationReadback, digest as familyDigest } from "./model-family-execution.mjs";

export const AGY_SESSION_DISPATCH_SCHEMA = "pipeline.agy-session-dispatch-receipt.v1";
export const AGY_SESSION_CONSENT_SCHEMA = "pipeline.agy-session-consent.v1";
export const AGY_SESSION_DISPATCH_CODES = Object.freeze({
  CONSENT_REQUIRED: "AGY-SESSION-CONSENT-REQUIRED",
  CONSENT_INVALID: "AGY-SESSION-CONSENT-INVALID",
  SESSION_MISMATCH: "AGY-SESSION-MISMATCH",
  ROLE_FORBIDDEN: "AGY-SESSION-ROLE-FORBIDDEN",
  MODEL_MISMATCH: "AGY-SESSION-MODEL-MISMATCH",
  INPUT_MISMATCH: "AGY-SESSION-INPUT-MISMATCH",
  RESULT_INVALID: "AGY-SESSION-RESULT-INVALID",
  RESULT_COLLISION: "AGY-SESSION-RESULT-COLLISION",
  AUTHORITY_UNAVAILABLE: "AGY-SESSION-AUTHORITY-UNAVAILABLE",
  PREFLIGHT_FAILED: "AGY-SESSION-PREFLIGHT-FAILED",
});

const SHA256 = /^[a-f0-9]{64}$/u;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/u;
const SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const IMPLEMENTATION_ROLES = new Set(["pipeline-core:goldfish-implementor", "pipeline-core:goldfish-mechanic"]);
const nativeContexts = new WeakMap();
const heldFamilyReturns = new WeakMap();
const admittedFamilyExecutions = new WeakMap();
const verifiedFamilyReturns = new WeakMap();

export function readAgyFamilyVerifiedReturn(handle) {
  const held = verifiedFamilyReturns.get(handle);
  return held ? { ok: true, value: structuredClone(held.value) } : { ok: false, code: "AGY-FAMILY-RETURN-HANDLE-REQUIRED" };
}

export async function prepareAgyFamilyVerifiedReturn({ context, ports, observedAtMs, routePolicySha256, inputSha256 } = {}) {
  const held = nativeContexts.get(context), raw = heldFamilyReturns.get(context);
  if (!held || !raw?.nativeResult?.ok || !SHA256.test(routePolicySha256 ?? "") || inputSha256 !== raw.nativeRequest.inputSha256) return { ok: false, code: "AGY-FAMILY-RETURN-CONTEXT-REQUIRED" };
  const checked = await verifyAgyFamilyHeldExecution({ context, ports, observedAtMs }); if (!checked.ok) return checked;
  const payload = checked.value.rawHostResult.payload;
  const final = validateAgyFinalReturn(payload, { dispatchId: held.packet.dispatchId, candidateCommit: held.packet.candidate.commit });
  if (!final.ok) return final;
  if (!final.changedPaths.every(path => held.consent.allowedPaths.includes(path))) return { ok: false, code: "AGY-FAMILY-RETURN-PATH" };
  const model = checked.value.family.executionReceipt.actualModelIds[0];
  const resultValue = { schema: "pipeline.agy-session-dispatch-result.v2", dispatchId: held.packet.dispatchId,
    candidate: held.packet.candidate, sessionId: held.sessionId, requestedModel: held.receipt.selectedModelId,
    observedModel: model, payload, family: checked.value.family };
  const published = writeExclusiveResult(held.root, held.resultPath, resultValue); if (!published.ok) return published;
  const witness = { schema: "pipeline.agy-host-model-witness.v2", sessionId: held.sessionId, descriptorSha256: held.descriptorSha256,
    dispatchId: held.packet.dispatchId, candidateCommit: held.packet.candidate.commit, candidateTree: held.packet.candidate.tree,
    role: held.packet.role, model, effort: held.receipt.effort, routePolicySha256, resultSha256: published.sha256,
    resultPath: published.path, resultBytes: published.bytes, reportSha256: final.reportSha256,
    consentSubjectSha256: held.consent.subjectSha256, consentDecisionId: held.consent.decisionId,
    consentRecordSha256: held.consent.consentRecordSha256, scope: held.scope, inputSha256, observedAtMs,
    family: checked.value.family };
  const handle = Object.freeze(Object.create(null)), value = { witness, result: published, final };
  verifiedFamilyReturns.set(handle, { context, value: structuredClone(value) });
  return { ok: true, handle, ...structuredClone(value) };
}

export async function recheckAgyFamilyVerifiedReturn(handle) {
  const held = verifiedFamilyReturns.get(handle);
  if (!held) return { ok: false, code: "AGY-FAMILY-RETURN-HANDLE-REQUIRED" };
  const context = nativeContexts.get(held.context), w = held.value.witness;
  const consent = await recheckAgyFamilyConsentBinding({ authority: context.consentAuthority, handle: context.consentHandle,
    root: context.root, sessionId: context.sessionId, candidate: context.packet.candidate, consent: context.consent,
    invocationId: context.receipt.invocationId, requestedModel: context.receipt.selectedModelId, requestedEffort: context.receipt.effort,
    role: context.packet.role, scope: context.scope, requiredPaths: context.packet.requiredPaths, fallbackPolicy: context.fallbackPolicy,
    nowEpochMs: w.observedAtMs });
  return consent.ok ? { ...readAgyFamilyVerifiedReturn(handle), source: { root: context.root, packetSha256: familyDigest(context.packet) } } : consent;
}

/** Trusted source ports resolve original invocation provenance, independently
 * observed launch controls and S2 context. Wire JSON cannot supply them. */
export async function verifyAgyFamilyHeldExecution({ context, ports, observedAtMs } = {}) {
  const held = nativeContexts.get(context), returned = heldFamilyReturns.get(context);
  if (!held || !returned?.nativeResult?.ok) return { ok: false, code: "AGY-FAMILY-RETURN-CONTEXT-REQUIRED" };
  if (!Number.isSafeInteger(observedAtMs) || observedAtMs < returned.observedAtMs) return { ok: false, code: "AGY-FAMILY-RETURN-EVENT-TIME" };
  if (typeof ports?.readOriginalInvocation !== "function" || typeof ports?.readLaunchEvidence !== "function"
    || typeof ports?.contextForInvocation !== "function" || typeof ports?.adapters?.antigravity?.readActualExecutionIdentity !== "function") return { ok: false, code: "AGY-FAMILY-EXECUTION-PORTS-UNQUALIFIED" };
  const consent = await recheckAgyFamilyConsentBinding({ authority: held.consentAuthority, handle: held.consentHandle, root: held.root,
    sessionId: held.sessionId, candidate: held.packet.candidate, consent: held.consent, invocationId: held.receipt.invocationId,
    requestedModel: held.receipt.selectedModelId, requestedEffort: held.receipt.effort, role: held.packet.role, scope: held.scope,
    requiredPaths: held.packet.requiredPaths, fallbackPolicy: held.fallbackPolicy, nowEpochMs: observedAtMs });
  if (!consent.ok) return consent;
  if (admittedFamilyExecutions.has(context)) {
    const original = admittedFamilyExecutions.get(context);
    return original.observedAtMs === observedAtMs ? { ok: true, value: structuredClone(original) } : { ok: false, code: "AGY-FAMILY-RETURN-EVENT-TIME" };
  }
  let original;
  const execution = createModelFamilyExecutionHost({
    readInvocation: async () => {
      const read = await ports.readOriginalInvocation({ root: held.root, sessionId: held.sessionId, invocationId: held.receipt.invocationId, expectedReceiptSha256: held.receipt.receiptSha256 });
      const checked = validateInvocationReadback(read?.value); if (!read?.ok || !checked.ok || familyDigest(checked.value.invocation) !== familyDigest(held.receipt)) return { ok: false, code: "AGY-FAMILY-ORIGINAL-INVOCATION-DRIFT", retryable: false };
      original = checked.value; return { ok: true, code: "AGY-FAMILY-ORIGINAL-INVOCATION", value: original };
    },
    readLaunchEvidence: ports.readLaunchEvidence, adapters: ports.adapters, contextForInvocation: ports.contextForInvocation,
    verifyAlias: ports.verifyAlias,
  });
  const raw = returned.nativeResult.value;
  const recorded = await execution.recordModelFamilyExecution({ invocationId: held.receipt.invocationId, rawHostResult: raw });
  if (!recorded.ok) return recorded;
  const receipt = execution.readExecutionReceipt(recorded.value); if (!receipt.ok) return receipt;
  const family = { invocation: original.invocation, bindings: original.bindings, provenanceSha256: original.provenanceSha256,
    consentBinding: consent.projection, executionReceipt: receipt.value, nativeRequestSha256: familyDigest(returned.nativeRequest), rawHostResultSha256: familyDigest(raw) };
  const value = { family, observedAtMs, rawHostResult: structuredClone(raw) };
  admittedFamilyExecutions.set(context, value);
  return { ok: true, value: structuredClone(value) };
}

export function observeAgyFamilyDispatchActivation(root) {
  const observed = observeModelFamilyActivation({ cwd: root });
  if (observed.ok) return observed;
  try { execFileSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, GIT_DIR: undefined, GIT_WORK_TREE: undefined, GIT_COMMON_DIR: undefined } }); }
  catch (error) { if (error.status === 128 && error.stderr?.toString().includes("not a git repository")) return { ok: true, status: "inactive", code: "MODEL-FAMILY-INACTIVE-NO-GIT" }; }
  return observed;
}

export async function dispatchAgyFamilyNativeContext({ context, inputSha256, timeoutMs, nowEpochMs, resultRoot } = {}) {
  const held = nativeContexts.get(context);
  if (!held) return rejected("AGY-SESSION-FAMILY-CONTEXT-REQUIRED", "context");
  return dispatchAgySession({ root: held.root, resultRoot: resultRoot ?? held.root, resultPath: held.resultPath, packet: held.packet,
    session: { id: held.sessionId, source: "runtime", observed: true }, consent: held.consent,
    requestedModel: held.receipt.selectedModelId, effort: held.receipt.effort, scope: held.scope, fallbackPolicy: held.fallbackPolicy,
    familyConsentAuthority: held.consentAuthority, familyConsentHandle: held.consentHandle, familyInvocationId: held.receipt.invocationId,
    familyNativeContext: context, inputSha256, timeoutMs, nowEpochMs });
}

export function readAgyFamilyNativeContext(context) {
  const held = nativeContexts.get(context);
  return held ? { ok: true, receipt: structuredClone(held.receipt), consent: structuredClone(held.consent), scope: structuredClone(held.scope), fallbackPolicy: structuredClone(held.fallbackPolicy) }
    : { ok: false, code: "AGY-SESSION-FAMILY-CONTEXT-REQUIRED" };
}

/** Preparation constructs the S5 entry here; a caller-shaped entry cannot
 * substitute opaque selections or launch methods. All ports are host seams. */
export async function prepareAgyFamilyNativeDispatch({ root, packet, sessionId, descriptorSha256, resultPath,
  consentAuthority, runtimeHost = createModelFamilyRuntimeHost({ cwd: root }), routeSource,
  scope, fallbackPolicy, nowEpochMs = Date.now() } = {}) {
  try {
    if (!IMPLEMENTATION_ROLES.has(packet?.role)) return { ok: false, code: "AGY-SESSION-ROLE-FORBIDDEN" };
    const taskRoute = packet.role.endsWith("mechanic") ? "duty.mechanic" : "duty.implement";
    const entry = createModelFamilyInvocationEntry({ runtimeHost, ...(routeSource ? { routeSource } : {}) });
    const selected = await entry.prepareCurrentModelFamilyInvocation({ kind: "dispatch", runner: "antigravity", taskRoute, invocationId: packet.dispatchId });
    if (!selected.ok) return selected;
    const receipt = selected.value.receipt;
    if (receipt.sessionId !== sessionId || receipt.candidateCommit !== packet.candidate?.commit || receipt.candidateTree !== packet.candidate?.tree) return { ok: false, code: "AGY-CONSENT-CANDIDATE-MISMATCH" };
    if (typeof consentAuthority?.admit !== "function" || typeof consentAuthority?.bind !== "function") return { ok: false, code: "AGY-CONSENT-HOST-INVALID" };
    const admitted = await consentAuthority.admit({ root, sessionId, descriptorSha256, nowEpochMs }); if (!admitted.ok) return admitted;
    const request = { invocationId: packet.dispatchId, requestedModel: receipt.selectedModelId, requestedEffort: receipt.effort, role: packet.role, scope, requiredPaths: packet.requiredPaths, fallbackPolicy, nowEpochMs };
    const bound = await consentAuthority.bind(admitted.handle, request); if (!bound.ok) return bound;
    const checked = await recheckAgyFamilyConsentBinding({ authority: consentAuthority, handle: admitted.handle, root, sessionId, candidate: packet.candidate, consent: bound.projection, ...request });
    if (!checked.ok || checked.invocation.receiptSha256 !== receipt.receiptSha256) return checked.ok ? { ok: false, code: "AGY-CONSENT-INVOCATION-MISMATCH" } : checked;
    const context = Object.freeze(Object.create(null));
    nativeContexts.set(context, { entry, selected: selected.value.handle, receipt, consentAuthority, consentHandle: admitted.handle, consent: checked.projection,
      root, sessionId, descriptorSha256, resultPath, packet: structuredClone(packet), scope: structuredClone(scope), fallbackPolicy: structuredClone(fallbackPolicy), consumed: false });
    return { ok: true, context, receipt: structuredClone(receipt), consent: checked.projection };
  } catch { return { ok: false, code: "AGY-SESSION-FAMILY-PREPARATION-UNAVAILABLE" }; }
}

/** Internal next-slice seam: public receipts cannot resolve native result
 * context; the original private dispatch context is required. */
export function readAgyFamilyHeldReturn(context) {
  const held = heldFamilyReturns.get(context);
  return held ? { ok: true, value: structuredClone(held) } : { ok: false, code: "AGY-SESSION-FAMILY-RETURN-UNAVAILABLE" };
}

const digest = (value) => createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value), "utf8").digest("hex");
const exact = (value, keys) => value !== null && typeof value === "object" && !Array.isArray(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
const rejected = (code, field, extra = {}) => ({
  schema: AGY_SESSION_DISPATCH_SCHEMA,
  status: "rejected",
  code,
  field,
  modelCalls: 0,
  launcherCalls: 0,
  ...extra,
});

function validSessionIdentity(identity) {
  return exact(identity, ["id", "source", "observed"])
    && SESSION_ID.test(identity.id ?? "")
    && identity.source === "runtime"
    && identity.observed === true;
}

function validateConsent(consent, { sessionId, model, role, scope, nowEpochMs }) {
  if (consent === undefined || consent === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_REQUIRED };
  if (!exact(consent, ["schema", "status", "decisionId", "sessionId", "runner", "provider", "model", "role", "scope", "subjectSha256", "approvedAtMs", "expiresAtMs"]) || consent.schema !== AGY_SESSION_CONSENT_SCHEMA
    || consent.status !== "approved" || !SESSION_ID.test(consent.decisionId ?? "") || consent.sessionId !== sessionId
    || consent.runner !== "antigravity" || consent.provider !== "google" || consent.model !== model || consent.role !== role
    || digest(consent.scope) !== digest(scope) || !SHA256.test(consent.subjectSha256 ?? "")
    || !Number.isSafeInteger(consent.approvedAtMs) || !Number.isSafeInteger(consent.expiresAtMs)
    || consent.expiresAtMs <= consent.approvedAtMs || nowEpochMs >= consent.expiresAtMs) {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.CONSENT_INVALID };
  }
  return { ok: true };
}

function safeResultPath(resultRoot, resultPath) {
  if (typeof resultPath !== "string" || resultPath.length === 0 || resultPath.includes("\\")
    || resultPath.startsWith("/") || resultPath.split("/").some((part) => !part || part === "." || part === "..")) return null;
  try {
    const rootLexical = resolve(resultRoot);
    const rootStat = lstatSync(rootLexical);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) return null;
    const root = realpathSync(rootLexical);
    const target = resolve(root, resultPath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)) return null;
    const parent = dirname(target);
    const parentStat = lstatSync(parent);
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink() || realpathSync(parent) !== parent) return null;
    try { lstatSync(target); return null; } catch (error) { if (error?.code !== "ENOENT") return null; }
  } catch (error) {
    return null;
  }
  return { root: resolve(resultRoot), target: resolve(resultRoot, resultPath), relative: resultPath };
}

function writeExclusiveResult(resultRoot, resultPath, value) {
  const location = safeResultPath(resultRoot, resultPath);
  if (location === null) return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  try {
    const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
    writeFileSync(location.target, bytes, { flag: "wx", mode: 0o600 });
    return { ok: true, path: location.relative, bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") };
  } catch {
    return { ok: false, code: AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION };
  }
}

/** Re-read the host's exclusive Final Return file before commit or non-authoring recovery. */
export function verifyAgySessionResultReadback({ resultRoot, resultPath, receipt, dispatchId,
  candidate, sessionId, requestedModel, expectedFinal, familyWitness = null } = {}) {
  if (!exact(receipt, ["ok", "path", "bytes", "sha256"]) || receipt.ok !== true || receipt.path !== resultPath
    || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || receipt.bytes > 2 * 1024 * 1024
    || !SHA256.test(receipt.sha256 ?? "") || !OID.test(candidate?.commit ?? "")
    || !OID.test(candidate?.tree ?? "") || !SESSION_ID.test(sessionId ?? "")
    || typeof dispatchId !== "string" || dispatchId.length === 0
    || typeof requestedModel !== "string" || requestedModel.length === 0
    || !["succeeded", "failed", "blocked"].includes(expectedFinal?.outcome)
    || !SHA256.test(expectedFinal.reportSha256 ?? "")
    || !Array.isArray(expectedFinal.changedPaths)) {
    return { ok: false, code: "AGY-RESULT-READBACK-INPUT" };
  }
  let raw;
  try {
    const root = resolve(resultRoot);
    const rootStat = lstatSync(root);
    if (!rootStat.isDirectory() || rootStat.isSymbolicLink() || realpathSync(root) !== root
      || typeof resultPath !== "string" || resultPath.startsWith("/") || resultPath.includes("\\")
      || resultPath.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("path");
    const target = resolve(root, resultPath);
    const rel = relative(root, target);
    if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`)
      || realpathSync(dirname(target)) !== dirname(target)) throw new Error("parent");
    const expected = lstatSync(target);
    if (!expected.isFile() || expected.isSymbolicLink() || realpathSync(target) !== target
      || expected.size !== receipt.bytes) throw new Error("file");
    const fd = openSync(target, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.dev !== expected.dev || before.ino !== expected.ino
        || before.size !== receipt.bytes) throw new Error("inode");
      const buffer = Buffer.alloc(receipt.bytes + 1);
      let length = 0;
      while (length < buffer.length) {
        const count = readSync(fd, buffer, length, buffer.length - length, null);
        if (count === 0) break;
        length += count;
      }
      raw = buffer.subarray(0, length);
      const after = fstatSync(fd);
      const pathAfter = lstatSync(target);
      if (length !== receipt.bytes || after.dev !== before.dev || after.ino !== before.ino
        || after.size !== before.size || after.mtimeMs !== before.mtimeMs || after.ctimeMs !== before.ctimeMs
        || pathAfter.dev !== before.dev || pathAfter.ino !== before.ino
        || realpathSync(target) !== target
        || createHash("sha256").update(raw).digest("hex") !== receipt.sha256) throw new Error("bytes");
    } finally { closeSync(fd); }
  } catch { return { ok: false, code: "AGY-RESULT-READBACK-DRIFT" }; }
  let result;
  try { result = parseStrictJson(raw); }
  catch { return { ok: false, code: "AGY-RESULT-READBACK-MALFORMED" }; }
  const family = result.schema === "pipeline.agy-session-dispatch-result.v2";
  if (!exact(result, ["schema", "dispatchId", "candidate", "sessionId", "requestedModel", "observedModel", "payload", ...(family ? ["family"] : [])])
    || !(family ? familyWitness?.schema === "pipeline.agy-host-model-witness.v2" && validateAgyFamilyReturnBinding(result.family, familyWitness)
      && familyDigest(result.family) === familyDigest(familyWitness.family) : result.schema === "pipeline.agy-session-dispatch-result.v1")
    || result.dispatchId !== dispatchId || result.sessionId !== sessionId
    || result.candidate?.commit !== candidate.commit || result.candidate?.tree !== candidate.tree
    || result.requestedModel !== requestedModel || (family ? result.observedModel !== familyWitness.model : result.observedModel !== requestedModel)) {
    return { ok: false, code: "AGY-RESULT-READBACK-BINDING" };
  }
  const final = validateAgyFinalReturn(result.payload, { dispatchId, candidateCommit: candidate.commit });
  if (!final.ok || final.outcome !== expectedFinal.outcome
    || final.reportSha256 !== expectedFinal.reportSha256
    || JSON.stringify(final.changedPaths) !== JSON.stringify(expectedFinal.changedPaths)) {
    return { ok: false, code: "AGY-RESULT-READBACK-FINAL" };
  }
  return { ok: true, code: "AGY-RESULT-READBACK-VERIFIED", model: result.observedModel,
    resultSha256: receipt.sha256, reportSha256: final.reportSha256, changedPaths: final.changedPaths,
    // The host-owned authored record needs the actual durable report bytes,
    // not a digest or a second model-supplied copy. Keep this on the internal
    // readback result; the outer Elephant receipt never includes report text.
    final };
}

/**
 * Admit and execute one implementation-only AGY dispatch. `consent` is an
 * input, never minted here; tests and callers can prove it came from the
 * attended human authority mechanism without this wrapper inventing a second
 * approval protocol.
 */
export async function dispatchAgySession({
  root,
  resultRoot = root,
  packet,
  resultPath,
  session,
  consent,
  familyConsentAuthority,
  familyConsentHandle,
  familyInvocationId,
  familyNativeContext,
  fallbackPolicy,
  requestedModel,
  modelRoleStore,
  readRegistry = loadRunnerProfilesV3Registry,
  effort = "high",
  scope,
  inputSha256,
  agyPath,
  timeoutMs = 300_000,
  env = process.env,
  signal,
  nowEpochMs = Date.now(),
  verifyAuthority,
  requireObservedModel = false,
  streamJson = false,
  requireStructuredFinal = false,
} = {}) {
  if (!validSessionIdentity(session)) return rejected(AGY_SESSION_DISPATCH_CODES.SESSION_MISMATCH, "session");
  if (!IMPLEMENTATION_ROLES.has(packet?.role)) return rejected(AGY_SESSION_DISPATCH_CODES.ROLE_FORBIDDEN, "packet.role");
  if (typeof requestedModel !== "string" || requestedModel.trim() === "") return rejected(AGY_SESSION_DISPATCH_CODES.MODEL_MISMATCH, "requestedModel");
  // Observe physical activation before the historical V3 fallback. No caller
  // flag, old consent or model-only binding can authorize a family launch.
  const activation = observeModelFamilyActivation({ cwd: root ?? process.cwd() });
  const familyRequested = activation.status !== "inactive" || consent?.schema === AGY_FAMILY_BINDING_SCHEMA
    || familyConsentAuthority !== undefined || familyConsentHandle !== undefined || familyInvocationId !== undefined || familyNativeContext !== undefined;
  if (familyRequested) {
    if (!activation.ok) return rejected(activation.code, "familyActivation");
    if (consent?.schema !== AGY_FAMILY_BINDING_SCHEMA) return rejected("AGY-SESSION-FAMILY-CONSENT-V2-REQUIRED", "consent");
    if (packet.transport !== "antigravity" || !SHA256.test(inputSha256 ?? "")
      || (scope?.dispatchId !== undefined && scope.dispatchId !== packet.dispatchId)) return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "packet");
    const checked = await recheckAgyFamilyConsentBinding({ authority: familyConsentAuthority, handle: familyConsentHandle,
      root, sessionId: session.id, candidate: packet.candidate, consent, invocationId: familyInvocationId,
      requestedModel, requestedEffort: effort, role: packet.role, scope, requiredPaths: packet.requiredPaths,
      fallbackPolicy, nowEpochMs });
    if (!checked.ok) return rejected(checked.code, "familyConsent");
    const held = nativeContexts.get(familyNativeContext);
    if (held) {
      if (held.consumed || root !== held.root || session.id !== held.sessionId || resultPath !== held.resultPath
        || familyConsentAuthority !== held.consentAuthority || familyConsentHandle !== held.consentHandle
        || familyInvocationId !== held.receipt.invocationId || digest(packet) !== digest(held.packet)
        || digest(scope) !== digest(held.scope) || digest(fallbackPolicy) !== digest(held.fallbackPolicy)
        || checked.invocation.receiptSha256 !== held.receipt.receiptSha256) return rejected("AGY-SESSION-FAMILY-CONTEXT-MISMATCH", "familyNativeContext");
      const prepared = preflightRoleDispatch({ root, resultRoot, packet });
      if (prepared.status !== "prepared") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, prepared.field ?? "packet", { preflight: prepared });
      if (!safeResultPath(resultRoot, resultPath)) return rejected(AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION, "resultPath");
      const nativeRequest = { schema: "pipeline.agy-native-implementation-request.v2", root, resultRoot, resultPath,
        packet: prepared.packet, sessionId: session.id, descriptorSha256: held.descriptorSha256, requestedModel, effort,
        scope, fallbackPolicy, inputSha256, timeoutMs, consent: checked.projection };
      const r = held.receipt, bindingPacket = Object.fromEntries(["runner", "sessionId", "invocationId", "candidateCommit", "candidateTree", "taskRoute", "role", "effort", "selectedModelId", "authoritySha256", "discoverySha256", "packetBindingSha256"].map(k => [k, r[k]]));
      const bound = await held.entry.bindModelFamilyInvocation({ invocation: held.selected, packet: bindingPacket, nativeRequest });
      if (!bound.ok) return rejected(bound.code, "nativeRequest");
      const finalConsent = await recheckAgyFamilyConsentBinding({ authority: familyConsentAuthority, handle: familyConsentHandle, root,
        sessionId: session.id, candidate: packet.candidate, consent, invocationId: familyInvocationId, requestedModel,
        requestedEffort: effort, role: packet.role, scope, requiredPaths: packet.requiredPaths, fallbackPolicy, nowEpochMs });
      if (!finalConsent.ok) return rejected(finalConsent.code, "familyConsent");
      held.consumed = true;
      const launched = await held.entry.launchModelFamilyInvocation({ binding: bound.value });
      heldFamilyReturns.set(familyNativeContext, { invocation: r, consent: checked.projection, nativeRequest, nativeResult: launched, observedAtMs: nowEpochMs });
      return { schema: AGY_SESSION_DISPATCH_SCHEMA, status: launched.ok ? "recovery-required" : "unavailable",
        code: launched.ok ? "AGY-SESSION-FAMILY-RETURN-CONTRACT-UNQUALIFIED" : launched.code,
        dispatchId: packet.dispatchId, candidate: packet.candidate, requested: { provider: "google", model: requestedModel, effort, role: packet.role },
        launcherCalls: Number.isSafeInteger(launched.value?.launcherCalls) ? launched.value.launcherCalls : 0,
        modelCalls: Number.isSafeInteger(launched.value?.modelCalls) ? launched.value.modelCalls : 0,
        observed: { provider: "unknown", model: "unknown", effectiveSandbox: "unknown" }, result: null, record: null,
        family: { invocationSha256: r.receiptSha256, consentRecordSha256: checked.projection.consentRecordSha256 } };
    }
    if (familyNativeContext !== undefined) return rejected("AGY-SESSION-FAMILY-CONTEXT-REQUIRED", "familyNativeContext");
    // No opaque native preparation: never fall through to unchecked invokeAgy.
    return rejected("AGY-SESSION-FAMILY-SHARED-LAUNCH-UNAVAILABLE", "sharedLaunch", {
      preparation: { status: "consent-bound", consent: checked.projection, invocationSha256: checked.invocation.receiptSha256 },
    });
  }
  if (modelRoleStore !== undefined) {
    const taskRoute = packet.role === "pipeline-core:goldfish-mechanic" ? "duty.mechanic" : "duty.implement";
    let registry;
    try { registry = readRegistry(); } catch { return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore"); }
    if (!validateRunnerProfilesV3Registry(registry).ok)
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
    // Both bounded implementation agent types have the same productive V3
    // base duty. The mechanic-specific functional role is optional and may
    // still be unavailable; it cannot revoke the admitted implement route.
    const cell = registry.duties?.implement?.antigravity;
    if (!cell || cell.state === "unavailable")
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
    const v3Match = cell.selector?.kind === "model-id"
      && cell.selector.value === requestedModel && cell.effort === effort;
    let bound;
    try { bound = bindStoredModelRoleDispatch({ taskRoute, runner: "antigravity",
      sessionId: session.id, requestedModel, store: modelRoleStore }); }
    catch { bound = null; }
    if ((!bound?.ok || bound.effort !== effort) && !v3Match)
      return rejected("AGY-SESSION-MODEL-ROLE-NOT-BOUND", "modelRoleStore");
  }
  if ((typeof scope !== "string" && (scope === null || typeof scope !== "object" || Array.isArray(scope))) || (typeof scope === "string" && scope.trim() === "") || !SHA256.test(inputSha256 ?? "")) return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "inputSha256");
  const consentCheck = validateConsent(consent, { sessionId: session.id, model: requestedModel, role: packet.role, scope, nowEpochMs });
  if (!consentCheck.ok) return rejected(consentCheck.code, "consent");
  if (typeof verifyAuthority !== "function") return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  let authorityOk = false;
  try { authorityOk = verifyAuthority({ consent: structuredClone(consent), session: structuredClone(session), scope, requestedModel, role: packet.role }) === true; } catch { authorityOk = false; }
  if (!authorityOk) return rejected(AGY_SESSION_DISPATCH_CODES.AUTHORITY_UNAVAILABLE, "authority");
  if (packet.transport !== "antigravity") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, "packet.transport");

  const prepared = preflightRoleDispatch({ root, resultRoot, packet });
  if (prepared.status !== "prepared") return rejected(AGY_SESSION_DISPATCH_CODES.PREFLIGHT_FAILED, prepared.field ?? "packet", { preflight: prepared });
  if (prepared.candidate.commit !== packet.candidate.commit || prepared.candidate.tree !== packet.candidate.tree) {
    return rejected(AGY_SESSION_DISPATCH_CODES.INPUT_MISMATCH, "packet.candidate");
  }
  const resultLocation = safeResultPath(resultRoot, resultPath);
  if (resultLocation === null) return rejected(AGY_SESSION_DISPATCH_CODES.RESULT_COLLISION, "resultPath");

  const executionPacket = requireStructuredFinal ? {
    ...prepared.packet,
    prompt: `${prepared.packet.prompt}\n- **Host-bound Final Return:** Emit the --json-schema object with schema pipeline.agy-final-return.v1, dispatchId ${packet.dispatchId}, candidateCommit ${prepared.candidate.commit}, outcome, report and changedPaths. This is a claim for host validation, not permission to commit.\n`,
  } : prepared.packet;
  const invoked = await invokeAgy({ root, resultRoot, packet: executionPacket, agyPath, model: requestedModel, effort, timeoutMs, env, signal, streamJson, jsonSchema: requireStructuredFinal ? AGY_FINAL_RETURN_JSON_SCHEMA : null });
  const validatedFinal = invoked.ok === true && requireStructuredFinal
    ? validateAgyFinalReturn(invoked.payload, { dispatchId: packet.dispatchId, candidateCommit: prepared.candidate.commit }) : null;
  const receipt = {
    schema: AGY_SESSION_DISPATCH_SCHEMA,
    // A valid child Final Return still needs a host commit and a v4 record.
    // Neither a CLI exit nor a schema-constrained answer alone is delivery.
    status: invoked.ok === true ? validatedFinal?.ok === true ? "final-pending-host-commit" : "completed-undelivered" : "unavailable",
    code: invoked.ok === true ? validatedFinal?.ok === true ? "AGY-SESSION-FINAL-VALIDATED" : "AGY-SESSION-FINAL-UNDELIVERED" : invoked.code,
    dispatchId: packet.dispatchId,
    candidate: prepared.candidate,
    session: { id: session.id, source: session.source },
    requested: { provider: "google", model: requestedModel, effort, role: packet.role, scope, inputSha256 },
    observed: { model: invoked.observedModel ?? null, provider: null, effectiveSandbox: "unknown" },
    consent: { decisionId: consent.decisionId, subjectSha256: consent.subjectSha256 },
    launcherCalls: invoked.launcherCalls ?? 0,
    modelCalls: invoked.modelCalls ?? 0,
    processStarted: invoked.processStarted === true,
    processClosed: invoked.processClosed === true,
    transportResultObserved: invoked.transportResultObserved === true,
    result: null,
    final: validatedFinal?.ok === true ? { outcome: validatedFinal.outcome, reportSha256: validatedFinal.reportSha256, changedPaths: validatedFinal.changedPaths } : null,
  };
  if (invoked.ok !== true) return receipt;
  if (requireObservedModel === true && (typeof invoked.observedModel !== "string" || invoked.observedModel === "unknown")) {
    return { ...receipt, status: "unavailable", code: "AGY-SESSION-MODEL-UNOBSERVED" };
  }
  const published = writeExclusiveResult(resultRoot, resultPath, { schema: "pipeline.agy-session-dispatch-result.v1", dispatchId: packet.dispatchId, candidate: prepared.candidate, sessionId: session.id, requestedModel, observedModel: invoked.observedModel ?? null, payload: invoked.payload });
  if (!published.ok) return { ...receipt, status: "rejected", code: published.code, launcherCalls: invoked.launcherCalls ?? 0, modelCalls: invoked.modelCalls ?? 0 };
  return { ...receipt, result: published };
}

export const agySessionDispatchInternals = Object.freeze({ digest, validateConsent, safeResultPath, writeExclusiveResult });
