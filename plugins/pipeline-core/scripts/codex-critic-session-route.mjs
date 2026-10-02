// SPDX-License-Identifier: SUL-1.0
/** Resolve a Codex high-risk Critic route without letting optional roles replace V3 authority. */
import { resolveCriticHighRiskRoute, resolveV3DutyRoute, validateCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";
import { applyCriticSessionModelRoute } from "../lib/critic-session-model-route.mjs";
import { selectModelRoleForTask } from "./model-role-dispatch-select.mjs";
import { randomUUID } from "node:crypto";
import { createModelFamilyInvocationEntry } from "../lib/model-family-invocation.mjs";
import { createModelFamilyRuntimeHost } from "../lib/model-family-runtime-host.mjs";
import { createModelFamilyExecutionHost, validateInvocationReadback, digest } from "../lib/model-family-execution.mjs";

const heldFamilyRoutes = new WeakMap();
function familyFailure(code) { const error = new Error(code); error.code = code; throw error; }
export function isHeldCriticFamilyRoute(route) { return heldFamilyRoutes.has(route); }
export function readHeldCriticFamilyExecution(route) {
  const checked = recheckHeldCriticFamilyRoute(route);
  if (!checked.ok) return checked;
  const execution = heldFamilyRoutes.get(route)?.execution;
  return execution ? { ok: true, value: structuredClone(execution) } : { ok: false, code: "CRITIC-FAMILY-EXECUTION-REQUIRED" };
}
export function validateSessionCodexCriticRoute(route) {
  if (route?.dutyId === "critic_high_risk") return validateCriticHighRiskRoute(route);
  if (route?.dutyId !== "critic_normal") familyFailure("CRITIC-FAMILY-DUTY-INVALID");
  validateCriticHighRiskRoute({ ...route, dutyId: "critic_high_risk" });
  return Object.freeze({ ...route });
}
export function criticFamilyExecutionPortsReady(route) {
  const ports = heldFamilyRoutes.get(route)?.executionPorts;
  return typeof ports?.readOriginalInvocation === "function" && typeof ports?.readLaunchEvidence === "function"
    && typeof ports?.contextForInvocation === "function" && typeof ports?.adapters?.codex?.readActualExecutionIdentity === "function";
}
export function recheckHeldCriticFamilyRoute(route) {
  const held = heldFamilyRoutes.get(route);
  if (!held) return { ok: false, code: "CRITIC-FAMILY-ROUTE-HANDLE-REQUIRED" };
  const i = held.receipt;
  const read = held.entry.readHeld({ runner: i.runner, sessionId: i.sessionId, invocationId: i.invocationId });
  return read?.ok && digest(read.value) === digest(i) ? { ok: true, code: "CRITIC-FAMILY-HELD", receipt: structuredClone(i) }
    : { ok: false, code: read?.code ?? "CRITIC-FAMILY-INVOCATION-DRIFT" };
}

/** Construction-owned route admission. The returned projection is diagnostic;
 * only its original private object can bind and consume the S5 invocation. */
export async function launchHeldCriticFamilyRoute({ route, packet, nativeRequest } = {}) {
  const held = heldFamilyRoutes.get(route), checked = recheckHeldCriticFamilyRoute(route);
  if (!checked.ok) return checked;
  const ports = held.executionPorts;
  if (typeof ports?.readOriginalInvocation !== "function" || typeof ports?.readLaunchEvidence !== "function"
    || typeof ports?.contextForInvocation !== "function" || typeof ports?.adapters?.codex?.readActualExecutionIdentity !== "function") return { ok: false, code: "CRITIC-FAMILY-EXECUTION-PORTS-UNQUALIFIED" };
  if (packet?.role !== "pipeline-core:critic" || packet?.candidate?.commit !== held.receipt.candidateCommit
    || packet?.candidate?.tree !== held.receipt.candidateTree || nativeRequest?.model !== route.model
    || nativeRequest?.effort !== route.effort) return { ok: false, code: "CRITIC-FAMILY-REQUEST-DRIFT" };
  if (held.consumed) return { ok: false, code: "CRITIC-FAMILY-CONSUMED" };
  held.consumed = true;
  const i = held.receipt, bindingPacket = Object.fromEntries(["runner", "sessionId", "invocationId", "candidateCommit", "candidateTree", "taskRoute", "role", "effort", "selectedModelId", "authoritySha256", "discoverySha256", "packetBindingSha256"].map(key => [key, i[key]]));
  const bound = await held.entry.bindModelFamilyInvocation({ invocation: held.invocation, packet: bindingPacket,
    nativeRequest: { schema: "pipeline.critic-family-native-request.v1", root: held.rootDir, packet: structuredClone(packet), request: structuredClone(nativeRequest) } });
  if (!bound.ok) return bound;
  const launched = await held.entry.launchModelFamilyInvocation({ binding: bound.value });
  if (!launched.ok) return launched;
  const execution = createModelFamilyExecutionHost({ readInvocation: async () => {
    const read = await ports.readOriginalInvocation({ root: held.rootDir, invocationId: i.invocationId, sessionId: i.sessionId, expectedReceiptSha256: i.receiptSha256 });
    const verified = validateInvocationReadback(read?.value);
    return read?.ok && verified.ok && digest(verified.value.invocation) === digest(i) ? read : { ok: false, code: "CRITIC-FAMILY-ORIGINAL-INVOCATION-DRIFT", retryable: false };
  }, readLaunchEvidence: ports.readLaunchEvidence, adapters: ports.adapters, contextForInvocation: ports.contextForInvocation, verifyAlias: ports.verifyAlias });
  const observed = await execution.recordModelFamilyExecution({ invocationId: i.invocationId, rawHostResult: launched.value });
  if (!observed.ok) return { ...observed, child: launched.value };
  const receipt = execution.readExecutionReceipt(observed.value);
  if (!receipt.ok) return receipt;
  held.execution = { executionReceipt: receipt.value, nativeResultSha256: digest(launched.value), packetSha256: digest(packet) };
  return { ok: true, code: "CRITIC-FAMILY-NATIVE-OBSERVED", value: launched.value, executionReceipt: receipt.value };
}

export function resolveSessionCodexCriticRoute({ rootDir, candidateCommit, dutyId = "critic_high_risk",
  env = process.env, resolveV3 = null,
  select = selectModelRoleForTask, authorityDependencies = {}, familyInvocationEntry = null,
  familyRuntimeHost = null, familyExecutionPorts = null, invocationId = randomUUID() } = {}) {
  if (!["critic_high_risk", "critic_normal"].includes(dutyId)) familyFailure("CRITIC-FAMILY-DUTY-INVALID");
  const taskRoute = `duty.${dutyId}`;
  const entry = familyInvocationEntry ?? createModelFamilyInvocationEntry({ runtimeHost: familyRuntimeHost ?? createModelFamilyRuntimeHost({ cwd: rootDir }) });
  const activation = entry.observeActivation();
  if (!activation?.ok || !["active", "inactive"].includes(activation.status)) familyFailure(activation?.code ?? "CRITIC-FAMILY-ACTIVATION-UNCERTAIN");
  if (activation.status === "active") return (async () => {
    const prepared = await entry.prepareCurrentModelFamilyInvocation({ kind: "dispatch", runner: "codex", taskRoute, invocationId });
    if (!prepared?.ok) familyFailure(prepared?.code ?? "CRITIC-FAMILY-IDENTITY-UNAVAILABLE");
    const receipt = prepared.value.receipt;
    if (receipt.candidateCommit !== candidateCommit || receipt.taskRoute !== taskRoute || receipt.runner !== "codex") familyFailure("CRITIC-FAMILY-CANDIDATE-DRIFT");
    const route = validateSessionCodexCriticRoute({ dutyId, runner: "codex", model: receipt.selectedModelId,
      effort: receipt.effort, sourceSha256: digest({ authoritySha256: receipt.authoritySha256, receiptSha256: receipt.receiptSha256, taskRoute: receipt.taskRoute }), candidateCommit });
    heldFamilyRoutes.set(route, { entry, invocation: prepared.value.handle, receipt, rootDir, executionPorts: familyExecutionPorts, consumed: false });
    const held = recheckHeldCriticFamilyRoute(route); if (!held.ok) familyFailure(held.code);
    return route;
  })();
  const resolveLegacy = resolveV3 ?? (dutyId === "critic_high_risk" ? resolveCriticHighRiskRoute : options => {
    const { state, ...value } = resolveV3DutyRoute({ ...options, dutyId, runner: "codex" });
    if (state !== "default") familyFailure("CRITIC-V3-DUTY-UNAVAILABLE");
    return value;
  });
  const route = validateSessionCodexCriticRoute(resolveLegacy({ ...authorityDependencies, rootDir, candidateCommit }));
  if (route.dutyId !== dutyId) familyFailure("CRITIC-FAMILY-DUTY-INVALID");
  const identityAvailable = env?.CODEX_SESSION_ID !== undefined
    || env?.CODEX_THREAD_ID !== undefined;
  if (!identityAvailable) return route;
  let selected = null;
  try { selected = select({ rootDir, runner: "codex",
    taskRoute, env }); }
  catch { /* Optional role selection cannot strand the valid V3 route. */ }
  const bound = applyCriticSessionModelRoute(route, selected);
  return validateSessionCodexCriticRoute({ ...route, ...bound });
}

export function resolveSessionCodexCriticHighRiskRoute(options = {}) {
  return resolveSessionCodexCriticRoute({ ...options, dutyId: "critic_high_risk" });
}
