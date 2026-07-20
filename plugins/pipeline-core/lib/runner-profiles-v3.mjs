// SPDX-License-Identifier: Apache-2.0

/**
 * Closed validator for the V3 runner-neutral advisory contract.
 *
 * V3 intentionally does not interpret advisory as a profile phase.  It is a
 * duty with a profile eligibility policy, so a project cannot turn an epic
 * advisory request into a different runner/profile route by editing one cell.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { validateHumanDecisionLabel } from "./human-role-labels.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, "..", "config");
const SCRIPTS_DIR = join(HERE, "..", "scripts");
const REGISTRY_PATH = join(CONFIG_DIR, "runner-profiles-v3.json");
const USER_SCHEMA_PATH = join(SCRIPTS_DIR, "pipeline-user-v3.schema.json");
const MAX_ERRORS = 100;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

const FROZEN_REGISTRY = freeze(readJson(REGISTRY_PATH));
const USER_SCHEMA = freeze(readJson(USER_SCHEMA_PATH));

export const RUNNER_PROFILES_V3_REGISTRY_PATH = REGISTRY_PATH;
export const PIPELINE_USER_V3_SCHEMA_PATH = USER_SCHEMA_PATH;

export function loadRunnerProfilesV3Registry(path = REGISTRY_PATH) {
  return clone(readJson(path));
}

export function loadPipelineUserV3Schema(path = USER_SCHEMA_PATH) {
  return clone(readJson(path));
}

export function registeredRouting(registry = FROZEN_REGISTRY) {
  return { profiles: clone(registry.profiles), duties: clone(registry.duties) };
}

export function registeredCriticExportPolicy(registry = FROZEN_REGISTRY) {
  return clone(registry.criticExportPolicy);
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left)) return Array.isArray(right) && left.length === right.length && left.every((item, index) => same(item, right[index]));
  if (typeof left === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length && leftKeys.every((key, index) => key === rightKeys[index] && same(left[key], right[key]));
  }
  return false;
}

function add(errors, path, code, message, repair) {
  if (errors.length < MAX_ERRORS) errors.push({ path, code, message, repair });
}

function compareExact(actual, expected, path, errors, code = "frozen_mapping") {
  if (same(actual, expected) || errors.length >= MAX_ERRORS) return;
  if (isObject(expected) && isObject(actual)) {
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) add(errors, `${path}.${key}`, "required", "registered entry is missing", "restore every registered entry");
      else compareExact(actual[key], expected[key], `${path}.${key}`, errors, code);
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) add(errors, `${path}.${key}`, "additional_property", "entry is not registered", "remove the unregistered entry");
    }
    return;
  }
  if (Array.isArray(expected) && Array.isArray(actual)) {
    if (actual.length !== expected.length) add(errors, path, code, "array length differs from the registered contract", "restore the registered ordered fallback chain");
    expected.forEach((entry, index) => {
      if (index < actual.length) compareExact(actual[index], entry, `${path}[${index}]`, errors, code);
    });
    return;
  }
  add(errors, path, code, "value differs from the registered V3 contract", "use the registered mapping or submit a PO-approved V3 contract update");
}

function result(errors, source, extra = {}) {
  return { ok: errors.length === 0, source, errors: errors.slice(0, MAX_ERRORS), ...extra };
}

function validateAdvisorContract(value, path, errors) {
  if (!isObject(value)) {
    add(errors, path, "type", "advisory duty must be an object", "restore the registered advisory duty");
    return;
  }
  const expected = FROZEN_REGISTRY.duties.advisory;
  compareExact(value, expected, path, errors);
}

function validateClosedObject(value, path, required, errors, repair) {
  if (!isObject(value)) {
    add(errors, path, "type", `${path} must be an object`, repair);
    return false;
  }
  for (const key of required) {
    if (!Object.hasOwn(value, key)) add(errors, `${path}.${key}`, "required", "required property is missing", repair);
  }
  for (const key of Object.keys(value)) {
    if (!required.includes(key)) add(errors, `${path}.${key}`, "additional_property", "property is not part of pipeline.user.v3", "remove the unregistered property");
  }
  return true;
}

/**
 * Validate the only V3 human-facing role value.  The returned diagnostic is
 * intentionally typed so callers reject the source before any runtime target
 * is read or projection is planned; this is not a normalizer.
 */
export function validatePoDisplayLabel(value) {
  const validation = validateHumanDecisionLabel(value, { path: "$.roles.po.display_label" });
  return validation.ok
    ? { ok: true, value: validation.value }
    : { ok: false, ...validation.error };
}

function validateRoles(value, errors) {
  if (!Object.hasOwn(value, "roles")) return;
  const roles = value.roles;
  if (!isObject(roles)) {
    add(errors, "$.roles", "type", "$.roles must be an object", "supply only the optional po role object");
    return;
  }
  for (const key of Object.keys(roles)) {
    if (key !== "po") add(errors, `$.roles.${key}`, "additional_property", "property is not part of pipeline.user.v3", "remove the unregistered role");
  }
  if (!Object.hasOwn(roles, "po")) return;
  if (!validateClosedObject(roles.po, "$.roles.po", ["display_label"], errors, "supply exactly one display_label for the PO role")) return;
  if (!Object.hasOwn(roles.po, "display_label")) return;
  const display = validatePoDisplayLabel(roles.po.display_label);
  if (!display.ok) add(errors, "$.roles.po.display_label", display.code, display.message, display.repair);
}

function validateSession(value, errors) {
  if (!Object.hasOwn(value, "session")) return;
  if (!validateClosedObject(value.session, "$.session", ["keep_awake"], errors, "supply exactly the optional keep_awake boolean")) return;
  if (typeof value.session.keep_awake !== "boolean") {
    add(errors, "$.session.keep_awake", "type", "keep_awake must be a boolean", "use true or false; commands and arguments are never configurable");
  }
}

function validateAdvisorExport(value, errors) {
  if (!Object.hasOwn(value, "advisor_export")) return { consent: "missing", enabled: false };
  const advisorExport = value.advisor_export;
  if (!validateClosedObject(advisorExport, "$.advisor_export", ["consent"], errors, "supply exactly approved or declined advisor export consent")) {
    return { consent: "invalid", enabled: false };
  }
  if (!["approved", "declined"].includes(advisorExport.consent)) {
    add(errors, "$.advisor_export.consent", "enum", "advisor export consent must be approved or declined", "use approved only after the repository owner accepts the export disclosure; otherwise use declined");
    return { consent: "invalid", enabled: false };
  }
  return { consent: advisorExport.consent, enabled: advisorExport.consent === "approved" };
}

/** Validates a candidate against the frozen V3 registry, including advisory order. */
export function validateRunnerProfilesV3Registry(candidate, { source = "runner-profiles-v3.json" } = {}) {
  const errors = [];
  if (!isObject(candidate)) add(errors, "$", "type", "registry must be an object", "supply the committed V3 registry");
  else {
    compareExact(candidate, FROZEN_REGISTRY, "$", errors);
    if (candidate.duties?.advisory) validateAdvisorContract(candidate.duties.advisory, "$.duties.advisory", errors);
  }
  return result(errors, source);
}

function validateRoot(value, errors) {
  if (!isObject(value)) {
    add(errors, "$", "type", "configuration must be an object", "supply one pipeline.user.v3 object");
    return;
  }
  const required = ["schema", "language", "agent_runtime", "runners", "routing", "usage", "autonomy", "gates", "critic_export"];
  for (const key of required) if (!Object.hasOwn(value, key)) add(errors, `$.${key}`, "required", "required property is missing", "add the required property");
  for (const key of Object.keys(value)) if (![...required, "roles", "session", "advisor_export"].includes(key)) add(errors, `$.${key}`, "additional_property", "property is not part of pipeline.user.v3", "remove the unregistered property");
  if (value.schema !== "pipeline.user.v3") add(errors, "$.schema", "const", "schema must be pipeline.user.v3", "use pipeline.user.v3");
  if (validateClosedObject(value.language, "$.language", ["human_facing", "agent_facing"], errors, "supply exactly both approved language values")
    && (!["de", "en"].includes(value.language.human_facing) || !["de", "en"].includes(value.language.agent_facing))) add(errors, "$.language", "contract", "language must declare approved human and agent languages", "supply both approved language values");
  if (!["claude-code", "other"].includes(value.agent_runtime)) add(errors, "$.agent_runtime", "enum", "agent runtime is not registered", "use claude-code or other");
  if (validateClosedObject(value.runners, "$.runners", ["enabled", "default"], errors, "supply exactly one valid enabled/default runner pair")) {
    const enabled = value.runners.enabled;
    if (!Array.isArray(enabled)
      || enabled.length < 1
      || enabled.length > 2
      || new Set(enabled).size !== enabled.length
      || enabled.some((runner) => !["claude", "codex"].includes(runner))
      || !["claude", "codex"].includes(value.runners.default)
      || !enabled.includes(value.runners.default)) add(errors, "$.runners", "contract", "runner declaration must contain one or two unique registered runners and its enabled default", "supply a valid enabled/default runner pair");
  }
  if (validateClosedObject(value.usage, "$.usage", ["common_projection", "raw_persistence"], errors, "restore exactly the V3 usage contract")
    && (value.usage.common_projection !== "pipeline.runner-usage.v1" || value.usage.raw_persistence !== "none")) add(errors, "$.usage", "contract", "usage persistence contract is not registered", "restore the V3 usage contract");
  if (validateClosedObject(value.autonomy, "$.autonomy", ["push_policy", "branch_model", "wip_limit"], errors, "restore exactly the registered autonomy values")
    && (!["gated", "standing-approved"].includes(value.autonomy.push_policy) || !["feature-branch", "direct-main"].includes(value.autonomy.branch_model) || !Number.isInteger(value.autonomy.wip_limit) || value.autonomy.wip_limit < 1)) add(errors, "$.autonomy", "contract", "autonomy contract is invalid", "restore registered autonomy values");
  if (validateClosedObject(value.gates, "$.gates", ["dev_plan", "push", "security", "claude_md_max_lines"], errors, "restore exactly the registered gate values")
    && (!["blocking", "warn", "off"].includes(value.gates.dev_plan) || !["blocking", "warn", "off"].includes(value.gates.push) || !["blocking", "warn", "off"].includes(value.gates.security) || !Number.isInteger(value.gates.claude_md_max_lines) || value.gates.claude_md_max_lines < 1)) add(errors, "$.gates", "contract", "gate contract is invalid", "restore registered gate values");
  validateRoles(value, errors);
  validateSession(value, errors);
  compareExact(value.critic_export, FROZEN_REGISTRY.criticExportPolicy, "$.critic_export", errors, "export_policy");
}

/**
 * Validates a complete pipeline.user.v3 intent. Routing is deliberately exact:
 * V3 is a one-way authority cutover, not another compatibility layer for the
 * old `design.advisor` phase.
 */
export function validatePipelineUserV3(value, { source = "pipeline.user.v3", registry = FROZEN_REGISTRY } = {}) {
  const errors = [];
  const registryResult = validateRunnerProfilesV3Registry(registry, { source: "frozen V3 registry" });
  if (!registryResult.ok) {
    add(errors, "$", "registry_invalid", "the supplied registry is not the frozen V3 contract", "restore the committed V3 registry before validating configuration");
    return result(errors, source);
  }
  validateRoot(value, errors);
  const advisoryExport = isObject(value)
    ? validateAdvisorExport(value, errors)
    : { consent: "invalid", enabled: false };
  if (isObject(value)) {
    const routingIsClosed = validateClosedObject(value.routing, "$.routing", ["profiles", "duties"], errors, "restore exactly the registered routing object");
    if (routingIsClosed) {
      compareExact(value.routing.profiles, registry.profiles, "$.routing.profiles", errors);
      compareExact(value.routing.duties, registry.duties, "$.routing.duties", errors);
    }
  }
  return result(errors, source, { advisoryExport });
}

export function validatePipelineUserV3Json(text, options = {}) {
  try {
    return validatePipelineUserV3(JSON.parse(text), options);
  } catch {
    return result([{ path: "$", code: "parse", message: "configuration is not valid JSON", repair: "provide one valid JSON document" }], options.source ?? "pipeline.user.v3");
  }
}
