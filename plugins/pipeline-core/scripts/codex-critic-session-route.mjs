// SPDX-License-Identifier: SUL-1.0
/** Resolve a Codex high-risk Critic route without letting optional roles replace V3 authority. */
import { resolveCriticHighRiskRoute, validateCriticHighRiskRoute } from "../lib/critic-route-v3.mjs";
import { applyCriticSessionModelRoute } from "../lib/critic-session-model-route.mjs";
import { selectModelRoleForTask } from "./model-role-dispatch-select.mjs";

export function resolveSessionCodexCriticHighRiskRoute({ rootDir, candidateCommit,
  env = process.env, resolveV3 = resolveCriticHighRiskRoute,
  select = selectModelRoleForTask, authorityDependencies = {} } = {}) {
  const route = validateCriticHighRiskRoute(resolveV3({
    ...authorityDependencies, rootDir, candidateCommit,
  }));
  const identityAvailable = env?.CODEX_SESSION_ID !== undefined
    || env?.CODEX_THREAD_ID !== undefined;
  if (!identityAvailable) return route;
  let selected = null;
  try { selected = select({ rootDir, runner: "codex",
    taskRoute: "duty.critic_high_risk", env }); }
  catch { /* Optional role selection cannot strand the valid V3 route. */ }
  const bound = applyCriticSessionModelRoute(route, selected);
  return validateCriticHighRiskRoute({ ...route, ...bound });
}
