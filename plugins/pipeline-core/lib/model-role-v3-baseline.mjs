// SPDX-License-Identifier: SUL-1.0
/** The PO-approved exact V3 selectors, not a general model-family approval. */
import { createHash } from "node:crypto";
import { canonical } from "./po-approval-proof.mjs";
import { modelRoleRouteSourceSha256 } from "./model-role-approved-policy.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

const hash = (value) => createHash("sha256").update(canonical(value)).digest("hex");
const key = (route) => `${route.runner}:${route.role}:${route.effort}`;
const fail = (code) => ({ ok: false, code });

/** Catalogue/effort admission only; role-quality evidence remains a separate gate. */
export function deriveV3BaselinePolicies({ routeSource, runner, observations } = {}) {
  const sourceSha256 = modelRoleRouteSourceSha256(routeSource);
  if (!sourceSha256 || !["codex", "claude", "antigravity"].includes(runner)
    || !Array.isArray(observations)) return fail("MODEL-ROLE-V3-BASELINE-SOURCE");
  const routes = routeSource.configuredRoutes.filter((route) => route.runner === runner);
  if (routes.length === 0 || observations.length !== routes.length) {
    return fail("MODEL-ROLE-V3-BASELINE-ROUTES");
  }
  const observedByKey = new Map(observations.map((item) => [key(item), item]));
  if (observedByKey.size !== observations.length) return fail("MODEL-ROLE-V3-BASELINE-OBSERVATIONS");
  const byRole = new Map();
  for (const route of routes) {
    const observation = observedByKey.get(key(route));
    if (route.selector?.kind !== "model-id" || typeof route.selector.value !== "string"
      || observation?.ok !== true || observation.assurance !== "installed-host-observed"
      || !Array.isArray(observation.availableModelIds)
      || !observation.availableModelIds.includes(route.selector.value)) {
      return fail(route.selector?.kind === "alias"
        ? "MODEL-ROLE-V3-BASELINE-ALIAS-NEEDS-EXACT-APPROVAL"
        : "MODEL-ROLE-V3-BASELINE-COMPATIBILITY-UNAVAILABLE");
    }
    const roleKey = `${runner}:${route.role}`;
    if (!byRole.has(roleKey)) byRole.set(roleKey, []);
    byRole.get(roleKey).push({ modelId: route.selector.value, effort: route.effort,
      evidenceSha256: hash({ schema: "pipeline.model-role-v3-host-compatibility.v1",
        sourceSha256, runner, role: route.role, effort: route.effort,
        selector: route.selector, assurance: observation.assurance,
        availableModelIds: observation.availableModelIds }) });
  }
  const policies = new Map();
  for (const [roleKey, rows] of byRole) {
    const approved = [];
    const grouped = new Map();
    for (const row of rows) {
      if (!grouped.has(row.modelId)) grouped.set(row.modelId, []);
      grouped.get(row.modelId).push(row);
    }
    for (const [modelId, modelRows] of grouped) {
      approved.push({ modelId, rank: approved.length + 1,
        efforts: modelRows.map((row) => row.effort).sort(),
        compatibilityEvidenceSha256: hash(modelRows.map((row) => row.evidenceSha256).sort()) });
    }
    const [policyRunner, role] = roleKey.split(":");
    policies.set(roleKey, { schema: "pipeline.model-role-policy.v1",
      runner: policyRunner, role, approved });
  }
  return { ok: true, code: "MODEL-ROLE-V3-BASELINE-QUALIFIED", sourceSha256,
    approvedPolicies: routes.map(({ runner: routeRunner, role, effort }) => ({
      runner: routeRunner, role, effort, policy: policies.get(`${routeRunner}:${role}`) })),
    observations: structuredClone(observations) };
}

/** Recompute from the current governed V3 registry, not from a mutable store claim. */
export function verifyV3BaselineAuthority({ authority, runner,
  currentSource = registeredFunctionalTaskRoutes() } = {}) {
  if (authority?.mode !== "v3-baseline" || !authority.routeSource?.ok
    || !Array.isArray(authority.observations)
    || modelRoleRouteSourceSha256(authority.routeSource) !== modelRoleRouteSourceSha256(currentSource)) {
    return fail("MODEL-ROLE-V3-BASELINE-SOURCE-DRIFT");
  }
  const qualified = deriveV3BaselinePolicies({ routeSource: currentSource, runner,
    observations: authority.observations });
  return qualified.ok && canonical(authority.routeSource) === canonical(currentSource)
    ? qualified : fail(qualified.code ?? "MODEL-ROLE-V3-BASELINE-SOURCE-DRIFT");
}
