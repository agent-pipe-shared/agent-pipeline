import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, "..", "config");
const SUPPORTED_EFFORTS = new Set(["low", "medium", "high", "xhigh", "max"]);
const MANIFEST_EFFORTS = new Set([...SUPPORTED_EFFORTS, "not-applicable"]);

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
  const source = ROUTING_AUTHORITY.presets?.[preset];
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
