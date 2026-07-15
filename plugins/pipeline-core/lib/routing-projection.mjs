import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, "..", "config");
const SUPPORTED_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const MANIFEST_EFFORTS = new Set([...SUPPORTED_EFFORTS, "not-applicable"]);
const DIRECT_UNAVAILABILITY = new Set(["defer", "mapped-fallback"]);
const DIRECT_EVIDENCE_REQUIREMENTS = new Set(["dispatch-receipt"]);

const AUTHORITY_RAW = readFileSync(join(CONFIG_DIR, "routing-authority.json"), "utf8");
const MAPPINGS_RAW = readFileSync(join(CONFIG_DIR, "runner-mappings.json"), "utf8");
export const ROUTING_AUTHORITY = Object.freeze(JSON.parse(AUTHORITY_RAW));
export const RUNNER_MAPPINGS = Object.freeze(JSON.parse(MAPPINGS_RAW));

function shortHash(value) {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

export function routingProvenance(runner = "claude") {
  mappingFor(runner);
  return `authority=${shortHash(AUTHORITY_RAW)} mappings=${shortHash(MAPPINGS_RAW)} runner=${runner}`;
}

function mappingFor(runner) {
  const mapping = RUNNER_MAPPINGS.runners?.[runner];
  if (!mapping) throw new Error(`Unsupported runner: ${runner}`);
  if (mapping.effortMode !== "identity") throw new Error(`Unsupported effort mapping for runner: ${runner}`);
  return mapping;
}

function resolveCapability(runner, capability) {
  const model = mappingFor(runner).capabilities?.[capability];
  if (!model) throw new Error(`Runner ${runner} has no mapping for capability: ${capability}`);
  return model;
}

export function projectRunnerAssignment(runner, assignment) {
  if (!assignment || !SUPPORTED_EFFORTS.has(assignment.effort)) {
    throw new Error(`Unsupported effort: ${assignment?.effort}`);
  }
  if (assignment && typeof assignment.model === "string") {
    const model = mappingFor(runner).aliases?.[assignment.model.toLowerCase()];
    if (!model) throw new Error(`Runner ${runner} has no mapping for alias: ${assignment.model}`);
    return { model, effort: assignment.effort };
  }
  return {
    model: resolveCapability(runner, assignment.capability),
    effort: assignment.effort,
  };
}

export function projectPreset(preset = "max", runner = "claude") {
  // Retained solely to migrate a v0 source document before it is rendered as
  // v1. Interactive setup no longer asks for or writes subscription presets.
  const source = ROUTING_AUTHORITY.legacyMigrationPresets?.[preset];
  if (!source) throw new Error(`Unknown routing preset: ${preset}`);

  const worktypes = {};
  for (const [name, profile] of Object.entries(source.worktypes)) {
    worktypes[name] = {
      design_phase: projectRunnerAssignment(runner, profile.design_phase),
      execution_phase: projectRunnerAssignment(runner, profile.execution_phase),
      advisor: profile.advisor === null ? "off" : resolveCapability(runner, profile.advisor.capability),
    };
  }

  const models = {};
  for (const [name, assignment] of Object.entries(source.models)) {
    models[name] = projectRunnerAssignment(runner, assignment);
  }
  return { worktypes, models };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function directSelectorFor(runner, capability) {
  const selector = mappingFor(runner).directSelectors?.[capability];
  if (!selector || typeof selector !== "object") {
    throw new Error(`Runner ${runner} has no direct selector for capability: ${capability}`);
  }
  return clone(selector);
}

function directRouteFor(runner, assignment) {
  if (!assignment || !MANIFEST_EFFORTS.has(assignment.effort)) {
    throw new Error(`Unsupported direct-route effort: ${assignment?.effort}`);
  }
  const selector = directSelectorFor(runner, assignment.capability);
  return {
    runner,
    selector: { kind: selector.kind, value: selector.value },
    effort: assignment.effort,
    unavailability: "defer",
    evidenceRequirement: "dispatch-receipt",
  };
}

/**
 * Produce the sole v1 user-config source. The historical Claude projection is
 * represented as direct routes too; the separate Codex duties make the
 * provider-neutral runtime projection explicit without claiming a Terra ID.
 */
export function projectDirectRoutingDefaults() {
  const source = ROUTING_AUTHORITY.directDefaults;
  if (!source?.claude?.worktypes || !source.claude.duties || !source?.codex?.duties) {
    throw new Error("Direct routing defaults unavailable");
  }
  const worktypes = {};
  for (const [profileName, profile] of Object.entries(source.claude.worktypes)) {
    worktypes[profileName] = {
      design_phase: directRouteFor("claude", profile.design_phase),
      execution_phase: directRouteFor("claude", profile.execution_phase),
      advisor: profile.advisor === null ? "off" : directRouteFor("claude", profile.advisor),
    };
  }
  const duties = {};
  for (const [name, assignment] of Object.entries(source.claude.duties)) {
    duties[name] = directRouteFor("claude", assignment);
  }
  for (const [name, assignment] of Object.entries(source.codex.duties)) {
    duties[name] = directRouteFor("codex", assignment);
  }
  return { worktypes, duties };
}

function exactKeys(value, names) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === names.length
    && names.every((name) => Object.prototype.hasOwnProperty.call(value, name));
}

function expectedDirectShape() {
  return projectDirectRoutingDefaults();
}

/**
 * Validate the public v1 source before setup writes anything. A concrete model
 * id is accepted only when this runner mapping carries the committed observed
 * binding; aliases remain unresolved until a host/CLI dispatch receipt proves
 * the effective model.
 */
export function validateDirectRoute(route) {
  if (!exactKeys(route, ["runner", "selector", "effort", "unavailability", "evidenceRequirement"])
    || typeof route.runner !== "string"
    || !exactKeys(route.selector, ["kind", "value"])
    || !["alias", "model-id"].includes(route.selector.kind)
    || typeof route.selector.value !== "string" || route.selector.value.length === 0
    || !MANIFEST_EFFORTS.has(route.effort)
    || !DIRECT_UNAVAILABILITY.has(route.unavailability)
    || !DIRECT_EVIDENCE_REQUIREMENTS.has(route.evidenceRequirement)) {
    return { ok: false, reason: "invalid direct route shape" };
  }
  let mapping;
  try { mapping = mappingFor(route.runner); } catch { return { ok: false, reason: "unknown direct route runner" }; }
  const known = Object.values(mapping.directSelectors ?? {}).find((candidate) =>
    candidate?.kind === route.selector.kind && candidate?.value === route.selector.value,
  );
  if (route.selector.kind === "model-id" && known?.resolutionStatus !== "observed-model-id") {
    return { ok: false, reason: "unobserved concrete model id" };
  }
  return {
    ok: true,
    route: {
      runner: route.runner,
      selector: clone(route.selector),
      effort: route.effort,
      unavailability: route.unavailability,
      evidenceRequirement: route.evidenceRequirement,
      resolutionStatus: known?.resolutionStatus ?? (route.selector.kind === "alias" ? "unresolved-alias" : "unresolved-model-id"),
      resolutionEvidence: known?.resolutionEvidence ?? null,
    },
  };
}

export function validateDirectRouting(routing) {
  const expected = expectedDirectShape();
  const errors = [];
  if (!exactKeys(routing, ["worktypes", "duties"])) return { ok: false, errors: ["routing must contain only worktypes and duties"] };
  if (!exactKeys(routing.worktypes, Object.keys(expected.worktypes))) errors.push("routing.worktypes keys drift");
  if (!exactKeys(routing.duties, Object.keys(expected.duties))) errors.push("routing.duties keys drift");
  for (const [profileName, profile] of Object.entries(expected.worktypes)) {
    const actual = routing.worktypes?.[profileName];
    if (!exactKeys(actual, Object.keys(profile))) { errors.push(`routing.worktypes.${profileName} shape drift`); continue; }
    for (const [phase, expectedRoute] of Object.entries(profile)) {
      const value = actual[phase];
      // Advisory work is optional. Design/execution are required routes: an
      // "off" sentinel there would leave the Claude compatibility projection
      // incomplete. Runner ownership remains fixed through P3; cross-runner
      // worktype substitution belongs to the later full adapter architecture.
      if (phase === "advisor" && value === "off") continue;
      const validated = validateDirectRoute(value);
      if (!validated.ok || value.runner !== expectedRoute.runner) {
        errors.push(`routing.worktypes.${profileName}.${phase} invalid`);
      }
    }
  }
  for (const name of Object.keys(expected.duties)) {
    const value = routing.duties?.[name];
    if (!validateDirectRoute(value).ok || value.runner !== expected.duties[name].runner) errors.push(`routing.duties.${name} invalid`);
  }
  return { ok: errors.length === 0, errors };
}

function manifestModelForDirectRoute(route) {
  const validation = validateDirectRoute(route);
  if (!validation.ok) throw new Error(`Invalid direct route: ${validation.reason}`);
  if (route.runner !== "claude") throw new Error("Claude modelRouting accepts only Claude routes");
  // Return the source selector here; projectManifestRouting applies the one
  // established Claude manifest alias projection (sonnet -> sonnet-5).
  return route.selector.value;
}

/** Convert v1 direct routes to the legacy-shaped Claude manifest projection. */
export function projectClaudeRouteInputs(routing) {
  const checked = validateDirectRouting(routing);
  if (!checked.ok) throw new Error(`Invalid direct routing: ${checked.errors.join(", ")}`);
  const worktypes = {};
  for (const [profile, value] of Object.entries(routing.worktypes)) {
    worktypes[profile] = {
      design_phase: { model: manifestModelForDirectRoute(value.design_phase), effort: value.design_phase.effort },
      execution_phase: { model: manifestModelForDirectRoute(value.execution_phase), effort: value.execution_phase.effort },
      advisor: value.advisor === "off" ? "off" : manifestModelForDirectRoute(value.advisor),
    };
  }
  const models = {};
  for (const name of ["implement", "mechanic", "deep", "review"]) {
    const route = routing.duties[name];
    models[name] = { model: manifestModelForDirectRoute(route), effort: route.effort };
  }
  return { worktypes, models };
}

export function projectClaudeManifestRouting(routing) {
  const { worktypes, models } = projectClaudeRouteInputs(routing);
  return projectManifestRouting(worktypes, models);
}

/** Flatten every v1 source route into the provider-neutral runtime projection. */
export function projectRunnerRoutes(routing) {
  const checked = validateDirectRouting(routing);
  if (!checked.ok) throw new Error(`Invalid direct routing: ${checked.errors.join(", ")}`);
  const out = {};
  const projection = (route) => {
    const resolved = validateDirectRoute(route).route;
    if (resolved.resolutionEvidence === null) delete resolved.resolutionEvidence;
    return resolved;
  };
  for (const [profile, value] of Object.entries(routing.worktypes)) {
    for (const phase of ["design_phase", "execution_phase", "advisor"]) {
      if (value[phase] !== "off") out[`worktype_${profile}_${phase}`] = projection(value[phase]);
    }
  }
  for (const [duty, route] of Object.entries(routing.duties)) out[`duty_${duty}`] = projection(route);
  return out;
}

/** Explicitly convert a pre-v1 user source into the single v1 routing authority. */
export function migrateLegacyRouting(worktypes, models) {
  const next = projectDirectRoutingDefaults();
  const routeFromLegacy = (assignment, fallback) => ({
    ...fallback,
    runner: "claude",
    selector: { kind: "alias", value: String(assignment?.model ?? fallback.selector.value) },
    effort: String(assignment?.effort ?? fallback.effort),
  });
  for (const profile of Object.keys(next.worktypes)) {
    const legacy = worktypes?.[profile] ?? {};
    next.worktypes[profile].design_phase = routeFromLegacy(legacy.design_phase, next.worktypes[profile].design_phase);
    next.worktypes[profile].execution_phase = routeFromLegacy(legacy.execution_phase, next.worktypes[profile].execution_phase);
    if (legacy.advisor === "off") next.worktypes[profile].advisor = "off";
    else if (legacy.advisor !== undefined) {
      const fallback = next.worktypes[profile].advisor === "off"
        ? { ...next.worktypes.feature.advisor }
        : next.worktypes[profile].advisor;
      next.worktypes[profile].advisor = routeFromLegacy({ model: legacy.advisor, effort: "not-applicable" }, fallback);
    }
  }
  for (const duty of ["implement", "mechanic", "deep", "review"]) {
    next.duties[duty] = routeFromLegacy(models?.[duty], next.duties[duty]);
  }
  return next;
}

export function projectAgentFrontmatter(preset = "max", runner = "claude") {
  const result = {};
  for (const [path, assignment] of Object.entries(ROUTING_AUTHORITY.agentAssignments)) {
    result[path] = projectRunnerAssignment(runner, assignment);
  }
  return result;
}

export function resolveRunnerAlias(runner, alias, effort) {
  return projectRunnerAssignment(runner, { model: String(alias), effort });
}

export function projectHostDuty(duty, runner) {
  const source = ROUTING_AUTHORITY.hostDuties?.[duty];
  if (!source) throw new Error(`Unknown host duty: ${duty}`);
  if (source.dispatch !== "host-native") throw new Error(`Unsupported host dispatch for duty: ${duty}`);
  return {
    duty,
    runner,
    ...projectRunnerAssignment(runner, source),
    dispatch: source.dispatch,
    assurance: source.assurance,
  };
}

function manifestAssignment(runner, assignment) {
  if (!MANIFEST_EFFORTS.has(assignment.effort)) {
    throw new Error(`Unsupported manifest effort: ${assignment.effort}`);
  }
  const mapping = mappingFor(runner);
  return {
    model: mapping.manifestAliases?.[assignment.model] ?? assignment.model,
    effort: assignment.effort,
  };
}

export function projectManifestRouting(worktypes, models, runner = "claude") {
  const routing = {};
  for (const [profileName, profile] of Object.entries(worktypes)) {
    routing[`elephant_${profileName}_design`] = manifestAssignment(runner, profile.design_phase);
    routing[`elephant_${profileName}_execution`] = manifestAssignment(runner, profile.execution_phase);
    if (profile.advisor !== "off") {
      routing[`advisor_${profileName}`] = manifestAssignment(runner, {
        model: profile.advisor,
        effort: ROUTING_AUTHORITY.advisorProjectionEffort,
      });
    }
  }
  routing.goldfish = manifestAssignment(runner, models.implement);
  routing.goldfish_mechanic = manifestAssignment(runner, models.mechanic);
  routing.goldfish_deep = manifestAssignment(runner, models.deep);
  routing.critic = manifestAssignment(runner, models.review);
  return routing;
}
