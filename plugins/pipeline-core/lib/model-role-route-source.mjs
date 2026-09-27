// SPDX-License-Identifier: SUL-1.0
/**
 * Explicit PO task-to-functional-role source, paired with the committed V3
 * routing registry. Product-name similarity never assigns a functional role.
 * This is a read-only projection, not bootstrap admission or a model approval.
 */
import { loadRunnerProfilesV3Registry } from "./runner-profiles-v3.mjs";

const RUNNERS = ["claude", "codex", "antigravity"];
const PROFILES = ["epic", "feature", "mini"];
const PHASES = ["design_phase", "execution_phase"];
const DUTIES = ["implement", "mechanic", "deep", "test_author", "critic_normal",
  "critic_high_risk", "readiness", "advisory", "read"];

const PROFILE_ROLES = Object.freeze({
  epic: { design_phase: ["frontier", "frontier", "frontier"],
    execution_phase: ["frontier", "frontier", "worker"] },
  feature: { design_phase: ["frontier", "frontier", "frontier"],
    execution_phase: ["frontier", "frontier", "worker"] },
  mini: { design_phase: ["frontier", "frontier", "worker"],
    execution_phase: ["frontier", "frontier", "worker"] },
});
const DUTY_ROLES = Object.freeze({
  implement: ["worker", "worker", "worker"],
  mechanic: ["efficient", "efficient", "efficient"],
  deep: ["worker", "frontier", "worker"],
  test_author: ["frontier", "frontier", "worker"],
  critic_normal: ["frontier", "frontier", "worker"],
  critic_high_risk: ["frontier", "frontier", "frontier"],
  readiness: ["worker", "worker", "worker"],
  advisory: ["frontier", "frontier", "frontier"],
  read: ["efficient", "efficient", "efficient"],
});
export const CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE = "duty.advisory.fallback";

function exactKeys(value, keys) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).sort().join("\0") === [...keys].sort().join("\0");
}

function cellForTask(registry, taskRoute, runner) {
  const segments = taskRoute.split(".");
  return segments[0] === "profile"
    ? registry.profiles?.[segments[1]]?.[segments[2]]?.[runner]
    : registry.duties?.[segments[1]]?.[runner];
}

function routeCellValid({ cell, taskRoute, runner }) {
  const expectedKeys = taskRoute === CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE
    ? ["adapter", "runner", "selector", "effort", "isolation", "when"]
    : taskRoute === "duty.advisory"
    ? runner === "claude" ? ["state", "adapter", "selector", "effort", "evidence", "fallbacks"]
      : ["state", "adapter", "runner", "selector", "effort", "isolation", "evidence", "status"]
    : ["state", "selector", "effort", "unavailable", "evidence"];
  return exactKeys(cell, expectedKeys)
    && (taskRoute === CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE
      ? cell.adapter === "consult" && cell.runner === "claude"
      : ["default", "opt-in", "unavailable"].includes(cell.state))
    && exactKeys(cell.selector, ["kind", "value"])
    && ["alias", "model-id"].includes(cell.selector.kind)
    && typeof cell.selector.value === "string" && cell.selector.value.length > 0
    && typeof cell.effort === "string" && cell.effort.length > 0;
}

/**
 * The returned `configuredRoutes` can be fed to the pure bootstrap resolver
 * only when `ok` is true. Missing task routes are fatal to that complete set;
 * the diagnostics carry no permission to silently drop one.
 */
export function registeredFunctionalTaskRoutes(registry = loadRunnerProfilesV3Registry()) {
  if (!exactKeys(registry?.profiles, PROFILES)
    || !PROFILES.every((profile) => exactKeys(registry.profiles[profile], PHASES))
    || !exactKeys(registry?.duties, DUTIES)) {
    const missing = DUTIES.filter((duty) => !Object.hasOwn(registry?.duties ?? {}, duty));
    return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INCOMPLETE",
      missingTaskRoutes: missing.map((duty) => `duty.${duty}`) };
  }
  const taskRoutes = [];
  for (const profile of PROFILES) for (const phase of PHASES) {
    const taskRoute = `profile.${profile}.${phase}`;
    if (!exactKeys(registry.profiles[profile][phase], RUNNERS)) {
      return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INVALID", taskRoute };
    }
    RUNNERS.forEach((runner, index) => taskRoutes.push({
      taskRoute, runner, role: PROFILE_ROLES[profile][phase][index],
      cell: cellForTask(registry, taskRoute, runner),
    }));
  }
  for (const duty of DUTIES) {
    const taskRoute = `duty.${duty}`;
    const cells = registry.duties[duty];
    const keys = duty === "advisory" ? [...RUNNERS, "eligibility", "receipt"] : RUNNERS;
    if (!exactKeys(cells, keys)) {
      return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INVALID", taskRoute };
    }
    RUNNERS.forEach((runner, index) => taskRoutes.push({
      taskRoute, runner, role: DUTY_ROLES[duty][index],
      cell: cellForTask(registry, taskRoute, runner),
    }));
  }
  // Claude's native Advisor has no applicable effort tier, while its fresh
  // consult fallback has its own governed max-effort V3 cell. Model/effort
  // selection for one may never be copied into the other. This derived task
  // route is separately bootstrap-admitted when optional role selection is
  // available; V3 remains the safe fallback when it is not.
  const claudeFallbacks = registry.duties.advisory.claude.fallbacks;
  const consultFallbacks = Array.isArray(claudeFallbacks)
    ? claudeFallbacks.filter((cell) => cell?.adapter === "consult" && cell.runner === "claude") : [];
  if (consultFallbacks.length !== 1) {
    return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INVALID", taskRoute: CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE };
  }
  taskRoutes.push({ taskRoute: CLAUDE_ADVISORY_FALLBACK_TASK_ROUTE,
    runner: "claude", role: "frontier", cell: consultFallbacks[0] });
  if (taskRoutes.some((route) => !routeCellValid(route))) {
    return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-INVALID" };
  }
  const configured = new Map();
  for (const route of taskRoutes) {
    // A V3-unavailable route is part of the visible task inventory but is not
    // a launchable session slot. Do not force catalogue/policy admission for
    // an intentionally unavailable runner capability.
    if (route.cell.state === "unavailable") continue;
    const key = `${route.runner}:${route.role}:${route.cell.effort}`;
    const previous = configured.get(key);
    if (previous && (previous.selector.kind !== route.cell.selector.kind
      || previous.selector.value !== route.cell.selector.value)) {
      return { ok: false, code: "MODEL-ROLE-ROUTE-SOURCE-CONFLICT", routeKey: key };
    }
    configured.set(key, { runner: route.runner, role: route.role,
      effort: route.cell.effort, selector: structuredClone(route.cell.selector) });
  }
  return { ok: true, code: "MODEL-ROLE-ROUTE-SOURCE-REGISTERED",
    taskRoutes: taskRoutes.map(({ cell, ...route }) => ({ ...route,
      effort: cell.effort, state: cell.state ?? "default", selector: structuredClone(cell.selector) })),
    unavailableTaskRoutes: taskRoutes.filter(({ cell }) => cell.state === "unavailable")
      .map(({ taskRoute, runner, role, cell }) => ({ taskRoute, runner, role, effort: cell.effort })),
    configuredRoutes: [...configured.values()].sort((a, b) =>
      `${a.runner}:${a.role}:${a.effort}`.localeCompare(`${b.runner}:${b.role}:${b.effort}`)),
  };
}

/** A session observes only its installed runner; the full source remains the approval subject. */
export function functionalTaskRoutesForRunner(source, runner) {
  if (!source?.ok || !RUNNERS.includes(runner) || !Array.isArray(source.taskRoutes)
    || !Array.isArray(source.configuredRoutes)) {
    return { ok: false, code: "MODEL-ROLE-RUNNER-SOURCE-INVALID" };
  }
  const configuredRoutes = source.configuredRoutes.filter((route) => route.runner === runner);
  if (configuredRoutes.length === 0) return { ok: false, code: "MODEL-ROLE-RUNNER-SOURCE-EMPTY" };
  return { ok: true, code: "MODEL-ROLE-RUNNER-SOURCE", taskRoutes: source.taskRoutes.filter((route) => route.runner === runner),
    configuredRoutes, unavailableTaskRoutes: (source.unavailableTaskRoutes ?? []).filter((route) => route.runner === runner) };
}
