// SPDX-License-Identifier: SUL-1.0
/**
 * Host orchestration for the complete functional-route set. The host owns
 * catalogue provenance, approved policy loading, human acknowledgement and
 * the private durable store; no supplied receipt can authorize itself.
 */
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";
import { admitModelRoleBootstrap, resolveModelRoleBootstrap } from "./model-role-session.mjs";
import { bindModelRoleTaskDispatch } from "./model-role-dispatch.mjs";

const keyOf = ({ runner, role, effort }) => `${runner}:${role}:${effort}`;
const fail = (code) => ({ ok: false, code });

export function prepareModelRoleHostBootstrap({ sessionId, candidateCommit, observedAt,
  approvedPolicies, observations, previousReceipts = [],
  routeSource = registeredFunctionalTaskRoutes() } = {}) {
  if (!routeSource?.ok || !Array.isArray(routeSource.configuredRoutes)
    || !Array.isArray(approvedPolicies) || !Array.isArray(observations)
    || approvedPolicies.length !== routeSource.configuredRoutes.length
    || observations.length !== routeSource.configuredRoutes.length) {
    return fail("MODEL-ROLE-HOST-SOURCE-INCOMPLETE");
  }
  const policies = new Map(approvedPolicies.map((entry) => [keyOf(entry), entry.policy]));
  const available = new Map(observations.map((entry) => [keyOf(entry), entry]));
  if (policies.size !== approvedPolicies.length || available.size !== observations.length) {
    return fail("MODEL-ROLE-HOST-SOURCE-DUPLICATE");
  }
  const routes = [];
  for (const configured of routeSource.configuredRoutes) {
    const key = keyOf(configured);
    const observed = available.get(key);
    const expectedAssurance = configured.runner === "claude"
      ? "host-observed-single-call-not-provider-attested" : "installed-host-observed";
    if (!policies.has(key) || !observed || observed.ok !== true
      || !Array.isArray(observed.availableModelIds)
      || observed.assurance !== expectedAssurance) {
      return fail("MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
    }
    routes.push({ runner: configured.runner, role: configured.role, effort: configured.effort,
      sessionId, candidateCommit, observedAt, policy: policies.get(key),
      availableModelIds: observed.availableModelIds });
  }
  const configuredRoutes = routeSource.configuredRoutes.map(({ runner, role, effort }) => ({ runner, role, effort }));
  const proposal = resolveModelRoleBootstrap({ sessionId, configuredRoutes, routes, previousReceipts });
  return proposal.ok ? { ...proposal, configuredRoutes, previousReceipts } : proposal;
}

/** Store must be a trusted, exclusive host-owned writer, never a caller JSON sink. */
export function admitModelRoleHostBootstrap({ proposal, acknowledgement, store, authority } = {}) {
  if (!proposal?.ok || !Array.isArray(proposal.configuredRoutes)
    || typeof store?.persist !== "function") return fail("MODEL-ROLE-HOST-ADMISSION-INVALID");
  const admitted = admitModelRoleBootstrap({ sessionId: proposal.readback.sessionId,
    configuredRoutes: proposal.configuredRoutes, receipts: proposal.receipts,
    previousReceipts: proposal.previousReceipts, acknowledgement });
  if (!admitted.ok) return admitted;
  if (admitted.readbackSha256 !== proposal.readback.readbackSha256) {
    return fail("MODEL-ROLE-HOST-ADMISSION-DRIFT");
  }
  try {
    const stored = store.persist({ sessionId: proposal.readback.sessionId,
      runner: proposal.configuredRoutes[0]?.runner,
      admission: admitted, receipts: proposal.receipts,
      previousReceipts: proposal.previousReceipts, acknowledgement, authority });
    return stored?.ok === true ? admitted : fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE");
  } catch { return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE"); }
}

/** The dispatch consumer reads the host store afresh; it accepts no receipt argument. */
export function bindStoredModelRoleDispatch({ taskRoute, runner, sessionId, requestedModel,
  store, routeSource = registeredFunctionalTaskRoutes() } = {}) {
  if (typeof store?.read !== "function") return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE");
  let stored;
  try { stored = store.read(sessionId); } catch { return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE"); }
  if (!stored?.ok || stored.sessionId !== sessionId || !Array.isArray(stored.receipts)) {
    return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE");
  }
  const pinnedSource = stored.authority?.routeSource ?? routeSource;
  const route = pinnedSource?.taskRoutes?.find((item) => item.taskRoute === taskRoute && item.runner === runner);
  const receipts = stored.receipts.filter((item) => item.runner === runner
    && item.role === route?.role && item.effort === route?.effort);
  if (receipts.length !== 1) return fail("MODEL-ROLE-HOST-RECEIPT-UNAVAILABLE");
  return bindModelRoleTaskDispatch({ taskRoute, runner, sessionId, requestedModel,
    admission: stored.admission, receipt: receipts[0], routeSource: pinnedSource });
}

/** Select before sealing a packet; a caller cannot nominate the model. */
export function selectStoredModelRoleDispatch({ taskRoute, runner, sessionId,
  store, routeSource = registeredFunctionalTaskRoutes() } = {}) {
  if (typeof store?.read !== "function") return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE");
  let stored;
  try { stored = store.read(sessionId); } catch { return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE"); }
  if (!stored?.ok || stored.sessionId !== sessionId || stored.runner !== runner
    || !Array.isArray(stored.receipts)) return fail("MODEL-ROLE-HOST-STORE-UNAVAILABLE");
  const pinnedSource = stored.authority?.routeSource ?? routeSource;
  const routes = pinnedSource?.taskRoutes?.filter((item) =>
    item.taskRoute === taskRoute && item.runner === runner) ?? [];
  if (routes.length !== 1 || routes[0].state === "unavailable") {
    return fail("MODEL-ROLE-HOST-ROUTE-UNAVAILABLE");
  }
  const receipts = stored.receipts.filter((item) => item.runner === runner
    && item.role === routes[0].role && item.effort === routes[0].effort);
  if (receipts.length !== 1) return fail("MODEL-ROLE-HOST-RECEIPT-UNAVAILABLE");
  const bound = bindModelRoleTaskDispatch({ taskRoute, runner, sessionId,
    requestedModel: receipts[0].modelId, admission: stored.admission,
    receipt: receipts[0], routeSource: pinnedSource });
  return bound.ok ? bound : fail(bound.code);
}
