// SPDX-License-Identifier: SUL-1.0
/** One host-owned family entry for bootstrap and every new dispatch. */
import { createHash } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";
import { createModelFamilyRuntimeHost } from "./model-family-runtime-host.mjs";
import { registeredModelFamilyTaskRoutes, modelFamilyTaskRouteFor } from "./model-family-route-source.mjs";
import { readHeldModelFamilyInvocation as readHeldFromStore } from "./model-family-host-store.mjs";

const SHA = /^[a-f0-9]{64}$/u;
const OID = /^[a-f0-9]{40}$/u;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;
const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const KIND = new Set(["bootstrap", "dispatch"]);
const fail = (code, retryable = false, status = "unavailable") => ({ ok: false, code, retryable, status });
const sha = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const invocationHandles = new WeakMap();
const bindingHandles = new WeakMap();

function validInput(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === ["kind", "taskRoute", "runner", "sessionId", "invocationId",
      "candidateCommit", "candidateTree"].sort().join("\0")
    && KIND.has(value.kind) && RUNNERS.has(value.runner)
    && typeof value.taskRoute === "string" && /^((profile|duty)\.[A-Za-z0-9_.-]{1,120})$/u.test(value.taskRoute)
    && ID.test(value.sessionId ?? "") && ID.test(value.invocationId ?? "")
    && OID.test(value.candidateCommit ?? "") && OID.test(value.candidateTree ?? "")
    && value.candidateCommit !== value.candidateTree;
}

function validKey(key, input) {
  return key !== null && typeof key === "object" && !Array.isArray(key)
    && Object.keys(key).sort().join("\0") === ["runner", "installationBindingSha256", "accountBindingSha256",
      "sessionId", "invocationId"].sort().join("\0")
    && key.runner === input.runner && key.sessionId === input.sessionId && key.invocationId === input.invocationId
    && SHA.test(key.installationBindingSha256 ?? "") && SHA.test(key.accountBindingSha256 ?? "");
}

const keyTuple = (key) => JSON.stringify([key.runner, key.installationBindingSha256,
  key.accountBindingSha256, key.sessionId, key.invocationId]);

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function immutableSnapshot(value) { return deepFreeze(structuredClone(value)); }

function publicReceipt(receipt) {
  if (!receipt || typeof receipt !== "object" || !SHA.test(receipt.receiptSha256 ?? "")
    || !SHA.test(receipt.packetBindingSha256 ?? "")) return null;
  return immutableSnapshot(receipt);
}

/**
 * Trusted construction seam for synthetic host tests and later qualified
 * runner ports. Runtime/wire inputs cannot supply a store or host capability.
 */
export function createModelFamilyInvocationEntry({ runtimeHost = createModelFamilyRuntimeHost(),
  routeSource = registeredModelFamilyTaskRoutes() } = {}) {
  if (!runtimeHost || typeof runtimeHost.observeActivation !== "function"
    || typeof runtimeHost.store !== "function" || typeof runtimeHost.resolveInvocationContext !== "function"
    || typeof runtimeHost.withFreshDiscovery !== "function") {
    throw new TypeError("family invocation host boundary is incomplete");
  }

  function observeActivation() {
    try { return runtimeHost.observeActivation(); } catch { return fail("MODEL-FAMILY-ACTIVATION-UNCERTAIN"); }
  }

  async function prepareModelFamilyInvocation(input = {}) {
    if (!validInput(input)) return fail("MODEL-FAMILY-INVOCATION-INPUT");
    const activation = observeActivation();
    if (!activation.ok) return { ...fail(activation.code ?? "MODEL-FAMILY-ACTIVATION-UNCERTAIN"),
      activationStatus: "uncertain" };
    if (activation.status === "inactive") return fail("MODEL-FAMILY-INACTIVE", false, "inactive");
    if (activation.status !== "active") return fail("MODEL-FAMILY-ACTIVATION-UNCERTAIN", false, "uncertain");
    if (!routeSource?.ok) return fail("MODEL-FAMILY-ROUTE-SOURCE-UNAVAILABLE");
    const route = modelFamilyTaskRouteFor({ routeSource, runner: input.runner, taskRoute: input.taskRoute });
    if (!route.ok || route.value.state === "unavailable") return fail(route.code ?? "MODEL-FAMILY-TASK-ROUTE-UNAVAILABLE");
    let context;
    try { context = runtimeHost.resolveInvocationContext({ runner: input.runner, requestedSessionId: input.sessionId,
      invocationId: input.invocationId, kind: input.kind, taskRoute: input.taskRoute }); }
    catch { return fail("MODEL-FAMILY-IDENTITY-UNAVAILABLE"); }
    if (!context?.ok) return fail(context?.code ?? "MODEL-FAMILY-IDENTITY-UNAVAILABLE", context?.retryable === true);
    const assignment = context.assignment;
    if (!validKey(context.key, input) || context.candidateCommit !== input.candidateCommit
      || context.candidateTree !== input.candidateTree || !assignment || assignment.runner !== route.value.runner
      || assignment.taskRoute !== route.value.taskRoute || assignment.role !== route.value.role
      || assignment.effort !== route.value.effort || typeof assignment.familyId !== "string") {
      return fail("MODEL-FAMILY-INVOCATION-CONTEXT-MISMATCH");
    }
    let store;
    try { store = runtimeHost.store(); } catch { return fail("MODEL-FAMILY-STORE-UNAVAILABLE"); }
    if (typeof store.prepare !== "function") return fail("MODEL-FAMILY-STORE-UNAVAILABLE");
    let prepared;
    const selectedAssignment = {
      runner: route.value.runner, taskRoute: route.value.taskRoute, role: route.value.role,
      effort: route.value.effort, familyId: assignment.familyId,
    };
    const discoveryRequest = { authoritySha256: activation.authoritySha256,
      assignment: selectedAssignment, key: context.key };
    try {
      const state = typeof store.readState === "function" ? store.readState() : null;
      if (state && !state.ok) return fail(state.code ?? "MODEL-FAMILY-STATE-UNCERTAIN", state.retryable === true);
      const held = state?.invocationEntries?.some((entry) => entry?.key
        && keyTuple(entry.key) === keyTuple(context.key)) === true;
      prepared = held ? store.prepare({ key: context.key, assignment: selectedAssignment })
        : await runtimeHost.withFreshDiscovery(discoveryRequest,
          () => store.prepare({ key: context.key, assignment: selectedAssignment }));
    }
    catch { return fail("MODEL-FAMILY-INVOCATION-UNAVAILABLE"); }
    if (!prepared?.ok || !prepared.value?.receipt) return fail(prepared?.code ?? "MODEL-FAMILY-INVOCATION-UNAVAILABLE",
      prepared?.retryable === true);
    const receipt = publicReceipt(prepared.value.receipt);
    if (!receipt || receipt.kind !== "model-family-invocation" || receipt.runner !== input.runner
      || receipt.sessionId !== input.sessionId || receipt.invocationId !== input.invocationId
      || receipt.candidateCommit !== input.candidateCommit || receipt.candidateTree !== input.candidateTree
      || receipt.taskRoute !== input.taskRoute || receipt.role !== route.value.role || receipt.effort !== route.value.effort
      || receipt.selectedModelId === undefined || receipt.authoritySha256 !== activation.authoritySha256) {
      return fail("MODEL-FAMILY-RECEIPT-BINDING");
    }
    const handle = Object.freeze(Object.create(null));
    invocationHandles.set(handle, { store, invocation: prepared.value, receipt,
      discoveryRequest: immutableSnapshot(discoveryRequest), input: Object.freeze({ ...input }) });
    return { ok: true, code: prepared.code ?? "MODEL-FAMILY-INVOCATION-READY", status: "ready",
      value: Object.freeze({ handle, receipt: immutableSnapshot(receipt) }) };
  }

  async function bindModelFamilyInvocation(input = {}) {
    const { invocation, packet } = input;
    const held = invocationHandles.get(invocation);
    const fields = ["runner", "sessionId", "invocationId", "candidateCommit", "candidateTree", "taskRoute",
      "role", "effort", "selectedModelId", "authoritySha256", "discoverySha256", "packetBindingSha256"];
    if (!held || packet === null || typeof packet !== "object" || Array.isArray(packet)
      || Object.keys(packet).sort().join("\0") !== [...fields].sort().join("\0")) return fail("MODEL-FAMILY-BINDING-HANDLE-REQUIRED");
    const receipt = held.receipt;
    const expected = { runner: receipt.runner, sessionId: receipt.sessionId, invocationId: receipt.invocationId,
      candidateCommit: receipt.candidateCommit, candidateTree: receipt.candidateTree, taskRoute: receipt.taskRoute,
      role: receipt.role, effort: receipt.effort, selectedModelId: receipt.selectedModelId,
      authoritySha256: receipt.authoritySha256, discoverySha256: receipt.discoverySha256,
      packetBindingSha256: receipt.packetBindingSha256 };
    if (sha(packet) !== sha(expected)) return fail("MODEL-FAMILY-PACKET-BINDING-MISMATCH");
    let checked;
    try { checked = await runtimeHost.withFreshDiscovery(held.discoveryRequest, () =>
      held.store.prelaunch({ invocation: held.invocation, packetBindingSha256: receipt.packetBindingSha256 })); }
    catch { return fail("MODEL-FAMILY-PRELAUNCH-UNAVAILABLE"); }
    if (!checked?.ok || !checked.value) return fail(checked?.code ?? "MODEL-FAMILY-PRELAUNCH-UNAVAILABLE",
      checked?.retryable === true);
    let nativeRequestCapability;
    if (Object.hasOwn(input, "nativeRequest")) {
      if (typeof held.store.admitNativeRequest !== "function") return fail("MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
      let admission;
      try { admission = await held.store.admitNativeRequest({ invocation: held.invocation, request: input.nativeRequest }); }
      catch { return fail("MODEL-FAMILY-NATIVE-REQUEST-REFUSED"); }
      if (!admission?.ok || !admission.value) return fail(admission?.code ?? "MODEL-FAMILY-NATIVE-REQUEST-REFUSED",
        admission?.retryable === true);
      nativeRequestCapability = admission.value;
    }
    const binding = Object.freeze(Object.create(null));
    bindingHandles.set(binding, { store: held.store, invocation: held.invocation,
      prelaunchToken: checked.value, receipt, discoveryRequest: held.discoveryRequest,
      packet: Object.freeze({ ...packet }), nativeRequestCapability });
    return { ok: true, code: "MODEL-FAMILY-LAUNCH-CAPABILITY", value: binding };
  }

  async function launchModelFamilyInvocation({ binding } = {}) {
    const held = bindingHandles.get(binding);
    if (!held) return fail("MODEL-FAMILY-LAUNCH-CAPABILITY-REQUIRED");
    let result;
    try { result = await runtimeHost.withFreshDiscovery(held.discoveryRequest, () =>
      held.store.launch({ invocation: held.invocation,
        packetBindingSha256: held.receipt.packetBindingSha256,
        ...(held.nativeRequestCapability ? { nativeRequestCapability: held.nativeRequestCapability } : {}) })); }
    catch { return fail("MODEL-FAMILY-LAUNCH-FAILED"); }
    return result?.ok ? { ok: true, code: result.code, value: result.value ?? null }
      : fail(result?.code ?? "MODEL-FAMILY-LAUNCH-FAILED", result?.retryable === true);
  }

  async function prepareCurrentModelFamilyInvocation({ kind, runner, taskRoute, invocationId } = {}) {
    if (!KIND.has(kind) || !RUNNERS.has(runner) || !ID.test(invocationId ?? "")
      || typeof taskRoute !== "string" || !/^((profile|duty)\.[A-Za-z0-9_.-]{1,120})$/u.test(taskRoute)) {
      return fail("MODEL-FAMILY-INVOCATION-INPUT");
    }
    if (typeof runtimeHost.resolveCurrentInvocationIdentity !== "function") {
      return fail("MODEL-FAMILY-NATIVE-PORT-UNQUALIFIED");
    }
    let identity;
    try { identity = runtimeHost.resolveCurrentInvocationIdentity({ runner, taskRoute, invocationId }); }
    catch { return fail("MODEL-FAMILY-IDENTITY-UNAVAILABLE"); }
    if (!identity?.ok || !validKey(identity.key, { runner, sessionId: identity.key?.sessionId, invocationId })
      || identity.key.sessionId === invocationId || identity.key.invocationId !== invocationId
      || identity.candidateCommit === identity.candidateTree || !OID.test(identity.candidateCommit ?? "")
      || !OID.test(identity.candidateTree ?? "") || !identity.assignment
      || identity.assignment.runner !== runner || identity.assignment.taskRoute !== taskRoute) {
      return fail(identity?.code ?? "MODEL-FAMILY-IDENTITY-UNAVAILABLE", identity?.retryable === true);
    }
    return prepareModelFamilyInvocation({ kind, runner, taskRoute, sessionId: identity.key.sessionId,
      invocationId, candidateCommit: identity.candidateCommit, candidateTree: identity.candidateTree });
  }

  function readHeld({ runner, sessionId, invocationId } = {}) {
    if (!RUNNERS.has(runner) || !ID.test(sessionId ?? "") || !ID.test(invocationId ?? "")) {
      return fail("MODEL-FAMILY-INVOCATION-KEY");
    }
    const activation = observeActivation();
    if (!activation.ok || activation.status !== "active") return fail(activation.code ?? "MODEL-FAMILY-ACTIVATION-UNCERTAIN");
    let context;
    try { context = runtimeHost.resolveInvocationContext({ runner, requestedSessionId: sessionId, invocationId, kind: "dispatch" }); }
    catch { return fail("MODEL-FAMILY-IDENTITY-UNAVAILABLE"); }
    if (!context?.ok || !validKey(context.key, { runner, sessionId, invocationId })) {
      return fail(context?.code ?? "MODEL-FAMILY-IDENTITY-UNAVAILABLE");
    }
    const root = runtimeHost.root?.();
    if (!root?.privateRoot) return fail("MODEL-FAMILY-STORE-UNAVAILABLE");
    const read = readHeldFromStore({ rootDir: root.privateRoot, key: context.key });
    return read.ok ? { ok: true, code: read.code, value: Object.freeze(publicReceipt(read.value)) }
      : fail(read.code ?? "MODEL-FAMILY-RECEIPT-UNAVAILABLE");
  }

  return Object.freeze({ observeActivation, prepareModelFamilyInvocation, prepareCurrentModelFamilyInvocation, bindModelFamilyInvocation,
    launchModelFamilyInvocation, readHeld });
}

const defaultEntry = createModelFamilyInvocationEntry();
export const prepareModelFamilyInvocation = (input) => defaultEntry.prepareModelFamilyInvocation(input);
export const prepareCurrentModelFamilyInvocation = (input) => defaultEntry.prepareCurrentModelFamilyInvocation(input);
export const bindModelFamilyInvocation = (input) => defaultEntry.bindModelFamilyInvocation(input);
export const launchModelFamilyInvocation = (input) => defaultEntry.launchModelFamilyInvocation(input);
export const readHeldModelFamilyInvocation = (input) => defaultEntry.readHeld(input);
