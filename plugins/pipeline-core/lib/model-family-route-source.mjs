// SPDX-License-Identifier: SUL-1.0
/** Proposed family target inventory, derived from the validated historical V3 inventory. */
import { registeredFunctionalTaskRoutes } from "./model-role-route-source.mjs";

const RUNNERS = new Set(["claude", "codex", "antigravity"]);
const EXPECTED_CELLS = 46;
const EXPECTED_UNAVAILABLE = 14;
const EXPECTED_CODEX_LAUNCHABLE = 15;
const fail = (code, extra = {}) => ({ ok: false, code, ...extra });

function key(route) { return `${route.runner}\0${route.taskRoute}`; }

/**
 * Preserve the historic registry and its route-source validator. The family
 * target is a separate proposal whose only deltas are the three declared in
 * the r3 migration matrix.
 */
export function registeredModelFamilyTaskRoutes({ historicSource = registeredFunctionalTaskRoutes() } = {}) {
  if (!historicSource?.ok || !Array.isArray(historicSource.taskRoutes)
    || historicSource.taskRoutes.length !== EXPECTED_CELLS) return fail("MODEL-FAMILY-ROUTE-SOURCE-HISTORIC");
  const taskRoutes = historicSource.taskRoutes.map((route) => ({ ...structuredClone(route),
    selector: structuredClone(route.selector) }));
  const identities = new Set();
  for (const route of taskRoutes) {
    if (!RUNNERS.has(route.runner) || typeof route.taskRoute !== "string"
      || identities.has(key(route))) return fail("MODEL-FAMILY-ROUTE-SOURCE-INVALID");
    identities.add(key(route));
  }
  const find = (runner, taskRoute) => taskRoutes.find((route) => route.runner === runner && route.taskRoute === taskRoute);
  const mechanic = find("codex", "duty.mechanic");
  const critic = find("codex", "duty.critic_normal");
  const advisory = find("codex", "duty.advisory");
  const highRisk = find("codex", "duty.critic_high_risk");
  if (!mechanic || !critic || !advisory || !highRisk) return fail("MODEL-FAMILY-ROUTE-SOURCE-INVALID");
  mechanic.effort = "medium";
  critic.effort = "xhigh";
  for (const route of [advisory, highRisk]) route.selector = { kind: "model-id", value: "gpt-6-astra" };

  const unavailableTaskRoutes = taskRoutes.filter((route) => route.state === "unavailable")
    .map(({ taskRoute, runner, role, effort }) => ({ taskRoute, runner, role, effort }));
  if (unavailableTaskRoutes.length !== EXPECTED_UNAVAILABLE) return fail("MODEL-FAMILY-ROUTE-SOURCE-UNAVAILABLE-COUNT");
  const launchableCodexTasks = taskRoutes.filter((route) => route.runner === "codex" && route.state !== "unavailable");
  if (launchableCodexTasks.length !== EXPECTED_CODEX_LAUNCHABLE) return fail("MODEL-FAMILY-ROUTE-SOURCE-CODEX-COUNT");

  const configured = new Map();
  for (const route of taskRoutes) {
    if (route.state === "unavailable") continue;
    const routeKey = `${route.runner}:${route.role}:${route.effort}`;
    const previous = configured.get(routeKey);
    if (previous && (previous.selector.kind !== route.selector.kind || previous.selector.value !== route.selector.value)) {
      return fail("MODEL-FAMILY-ROUTE-SOURCE-CONFLICT", { routeKey });
    }
    configured.set(routeKey, { runner: route.runner, role: route.role, effort: route.effort,
      selector: structuredClone(route.selector) });
  }
  return { ok: true, code: "MODEL-FAMILY-ROUTE-SOURCE-REGISTERED", taskRoutes,
    unavailableTaskRoutes, configuredRoutes: [...configured.values()].sort((a, b) =>
      `${a.runner}:${a.role}:${a.effort}`.localeCompare(`${b.runner}:${b.role}:${b.effort}`)) };
}

export function modelFamilyTaskRouteFor({ routeSource = registeredModelFamilyTaskRoutes(), runner, taskRoute } = {}) {
  if (!routeSource?.ok || !RUNNERS.has(runner) || typeof taskRoute !== "string") {
    return fail("MODEL-FAMILY-ROUTE-SOURCE-INVALID");
  }
  const route = routeSource.taskRoutes.find((item) => item.runner === runner && item.taskRoute === taskRoute);
  return route ? { ok: true, code: "MODEL-FAMILY-TASK-ROUTE", value: structuredClone(route) }
    : fail("MODEL-FAMILY-TASK-ROUTE-UNKNOWN");
}
