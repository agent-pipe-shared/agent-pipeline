// SPDX-License-Identifier: SUL-1.0
import { consumeModelFamilyHostDriverContext } from "./model-family-host-store.mjs";

const unqualified = () => ({ ok: false, code: "MAIN_PRELAUNCH_UNQUALIFIED", retryable: false });
const fail = (code) => ({ ok: false, code, retryable: false });
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const freeze = (value) => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
};
const stable = (value) => {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (!isObject(value)) return JSON.stringify(value);
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
};

function boundMainRequest(request, runner, invocation, key, assignment) {
  return isObject(request) && request.schema === "pipeline.model-family-main-request.v1"
    && request.purpose === "profile-main" && request.operation === "create-main"
    && request.runner === runner && request.sessionId === key.sessionId
    && request.invocationId === key.invocationId && request.taskRoute === assignment.taskRoute
    && request.candidateCommit === invocation.receipt.candidateCommit
    && request.candidateTree === invocation.receipt.candidateTree
    && request.modelId === invocation.receipt.selectedModelId
    && request.effort === invocation.receipt.effort
    && request.authoritySha256 === invocation.receipt.authoritySha256
    && request.adapterContractSha256 === invocation.receipt.adapterContractSha256
    && request.packetBindingSha256 === invocation.receipt.packetBindingSha256
    && request.existingMainSessionId === null;
}

/**
 * Source-only bridge for a runner's distinct main-session configuration and
 * observation port. The only accepted authority is S4's one-shot branded
 * context delivered to the trusted launch driver.
 */
export function createModelFamilyMainPrelaunch({ runner, renderConfiguration, port } = {}) {
  if (!["codex", "claude", "antigravity"].includes(runner)
    || typeof renderConfiguration !== "function") throw new TypeError("main prelaunch adapter boundary is incomplete");

  async function launchFromDriverContext(driverContext) {
    if (!port || typeof port !== "object"
      || ["applyConfiguration", "readAppliedConfiguration", "launchMain", "readActualMainIdentity"]
        .some((name) => typeof port[name] !== "function")) return unqualified();
    const consumed = consumeModelFamilyHostDriverContext(driverContext);
    if (!consumed.ok) return fail("MAIN_PRELAUNCH_CONTEXT_REQUIRED");
    const { invocation, key, assignment, nativeRequest, prelaunchToken, revalidate } = consumed.value;
    const receipt = invocation?.receipt;
    if (!receipt || receipt.runner !== runner || assignment?.runner !== runner
      || !assignment.taskRoute?.startsWith("profile.") || receipt.taskRoute !== assignment.taskRoute
      || receipt.role !== assignment.role || receipt.effort !== assignment.effort
      || !boundMainRequest(nativeRequest, runner, invocation, key, assignment)) {
      return fail("MAIN_PRELAUNCH_REQUEST_REFUSED");
    }
    const expected = Object.freeze({ runner, sessionId: key.sessionId, invocationId: key.invocationId,
      taskRoute: assignment.taskRoute, candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree,
      modelId: receipt.selectedModelId, effort: receipt.effort, authoritySha256: receipt.authoritySha256,
      adapterContractSha256: receipt.adapterContractSha256, packetBindingSha256: receipt.packetBindingSha256,
      role: assignment.role, familyId: assignment.familyId, hostStoreRootDir: consumed.value.rootDir,
      existingMainSessionId: null });
    let rendered, configuration;
    try {
      rendered = renderConfiguration(expected);
      configuration = isObject(rendered) ? freeze({ ...rendered, binding: { ...expected } }) : null;
    }
    catch { return unqualified(); }
    if (!isObject(configuration)) return unqualified();
    const context = Object.freeze({ expected, prelaunchToken, request: nativeRequest, invocation, revalidate });
    try {
      const applied = await port.applyConfiguration({ configuration, context });
      if (!applied || applied.ok !== true) return fail("MAIN_PRELAUNCH_CONFIGURATION_REFUSED");
      const readback = await port.readAppliedConfiguration({ context });
      if (!readback || readback.ok !== true || stable(readback.configuration) !== stable(configuration)) {
        return fail("MAIN_PRELAUNCH_CONFIGURATION_MISMATCH");
      }
      let rechecked;
      try { rechecked = await context.revalidate?.(); }
      catch { return fail("MAIN_PRELAUNCH_RECHECK_REFUSED"); }
      if (!rechecked || rechecked.ok !== true) return fail("MAIN_PRELAUNCH_RECHECK_REFUSED");
      const launched = await port.launchMain({ configuration, context });
      if (!launched || launched.ok !== true || typeof launched.operationId !== "string" || !launched.operationId) {
        return fail(launched?.code === "MAIN_PRELAUNCH_UNQUALIFIED" ? launched.code : "MAIN_PRELAUNCH_LAUNCH_FAILED");
      }
      const observed = await port.readActualMainIdentity({ expected, operationId: launched.operationId, context });
      if (!observed || observed.ok !== true || !isObject(observed.identity)) return fail("MAIN_PRELAUNCH_IDENTITY_UNAVAILABLE");
      const identity = observed.identity;
      const effortObserved = (value) => value === undefined || value === null || value === "unknown"
        || value === receipt.effort;
      const correlated = identity.kind === "main-session" && identity.runner === runner
        && identity.sessionId === key.sessionId && identity.invocationId === key.invocationId
        && identity.taskRoute === assignment.taskRoute && identity.candidateCommit === receipt.candidateCommit
        && identity.candidateTree === receipt.candidateTree && identity.modelId === receipt.selectedModelId
        && identity.authoritySha256 === receipt.authoritySha256
        && identity.adapterContractSha256 === receipt.adapterContractSha256
        && identity.packetBindingSha256 === receipt.packetBindingSha256
        && effortObserved(identity.effort) && effortObserved(identity.effectiveEffort)
        && identity.operationId === launched.operationId
        && typeof identity.mainSessionId === "string" && identity.mainSessionId.length > 0
        && identity.mainSessionId !== key.sessionId && identity.mainSessionId !== key.invocationId;
      if (!correlated) return fail("MAIN_PRELAUNCH_IDENTITY_MISMATCH");
      return { ok: true, code: "MAIN_PRELAUNCH_OBSERVED", value: Object.freeze({
        operationId: launched.operationId, mainSessionId: identity.mainSessionId, identity: Object.freeze({ ...identity }) }) };
    } catch { return fail("MAIN_PRELAUNCH_UNQUALIFIED"); }
  }
  return Object.freeze({ runner, launchFromDriverContext });
}
