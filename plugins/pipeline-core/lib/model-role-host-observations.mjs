// SPDX-License-Identifier: SUL-1.0
/**
 * Collect account/installation observations for the complete launchable V3
 * route set. This does not approve a model: policy and compatibility evidence
 * are separate inputs to bootstrap admission.
 */
import { observeAntigravityModels } from "./antigravity-model-host-observation.mjs";
import { observeClaudeModelAlias } from "./claude-model-host-observation.mjs";
import { observeCodexModels } from "./codex-model-host-observation.mjs";
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

const fail = (code) => ({ ok: false, code, observations: [] });
const key = (route) => `${route.runner}:${route.role}:${route.effort}`;

export async function collectModelRoleHostObservations({
  routeSource = registeredFunctionalTaskRoutes(),
  observeAgy = observeAntigravityModels,
  observeClaude = observeClaudeModelAlias,
  observeCodex = observeCodexModels,
} = {}) {
  if (!routeSource?.ok || !Array.isArray(routeSource.configuredRoutes)
    || routeSource.configuredRoutes.length === 0
    || new Set(routeSource.configuredRoutes.map(key)).size !== routeSource.configuredRoutes.length) {
    return fail("MODEL-ROLE-HOST-ROUTE-SOURCE-INVALID");
  }
  const observed = new Map();
  const observations = [];
  for (const route of routeSource.configuredRoutes) {
    const observationKey = route.runner === "claude" ? `claude:${route.selector?.value}`
      : route.runner === "codex" ? `codex:${route.effort}` : route.runner;
    if (!observed.has(observationKey)) {
      let result;
      try {
        if (route.runner === "claude" && route.selector?.kind === "alias") {
          result = await observeClaude({ alias: route.selector.value });
        } else if (route.runner === "codex") {
          result = await observeCodex({ effort: route.effort });
        } else if (route.runner === "antigravity") {
          result = await observeAgy();
        } else return fail("MODEL-ROLE-HOST-ROUTE-SOURCE-INVALID");
      } catch { return fail("MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE"); }
      observed.set(observationKey, result);
    }
    const result = observed.get(observationKey);
    let availableModelIds;
    if (route.runner === "claude") {
      if (result?.ok !== true || result.observation?.alias !== route.selector.value
        || result.observation?.assurance !== "host-observed-single-call-not-provider-attested"
        || typeof result.observation.modelId !== "string") {
        return fail("MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
      }
      availableModelIds = [result.observation.modelId];
    } else {
      if (result?.ok !== true || result.assurance !== "installed-host-observed"
        || !Array.isArray(result.availableModelIds)) {
        return fail("MODEL-ROLE-HOST-OBSERVATION-UNAVAILABLE");
      }
      availableModelIds = result.availableModelIds;
    }
    observations.push({ runner: route.runner, role: route.role, effort: route.effort,
      ok: true, assurance: route.runner === "claude"
        ? "host-observed-single-call-not-provider-attested" : "installed-host-observed",
      availableModelIds: [...availableModelIds] });
  }
  return { ok: true, code: "MODEL-ROLE-HOST-OBSERVATIONS-COMPLETE", observations };
}
