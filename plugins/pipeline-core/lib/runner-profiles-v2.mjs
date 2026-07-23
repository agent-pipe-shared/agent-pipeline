// SPDX-License-Identifier: SUL-1.0

/**
 * Closed, data-only validation for the frozen P3B runner-profile contract.
 * Diagnostics deliberately describe contract locations and safe expected values,
 * never arbitrary configuration values.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, "..", "config");
const SCRIPTS_DIR = join(HERE, "..", "scripts");
const REGISTRY_PATH = join(CONFIG_DIR, "runner-profiles-v2.json");
const USER_SCHEMA_PATH = join(SCRIPTS_DIR, "pipeline-user-v2.schema.json");
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

export const RUNNER_PROFILES_V2_REGISTRY_PATH = REGISTRY_PATH;
export const PIPELINE_USER_V2_SCHEMA_PATH = USER_SCHEMA_PATH;

export function loadRunnerProfilesV2Registry(path = REGISTRY_PATH) {
  return clone(readJson(path));
}

export function loadPipelineUserV2Schema(path = USER_SCHEMA_PATH) {
  return clone(readJson(path));
}

export function registeredRouting(registry = FROZEN_REGISTRY) {
  return {
    profiles: clone(registry.profiles),
    duties: clone(registry.duties),
  };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function same(left, right) {
  if (left === right) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left)) {
    return Array.isArray(right)
      && left.length === right.length
      && left.every((item, index) => same(item, right[index]));
  }
  if (typeof left === "object") {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key, index) => key === rightKeys[index] && same(left[key], right[key]));
  }
  return false;
}

function typeMatches(value, expected) {
  const kinds = Array.isArray(expected) ? expected : [expected];
  return kinds.some((kind) => {
    if (kind === "integer") return Number.isInteger(value);
    if (kind === "number") return typeof value === "number" && Number.isFinite(value);
    if (kind === "object") return isObject(value);
    if (kind === "array") return Array.isArray(value);
    if (kind === "null") return value === null;
    return typeof value === kind;
  });
}

function add(errors, path, code, message, repair) {
  if (errors.length < MAX_ERRORS) errors.push({ path, code, message, repair });
}

function isIsoDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function resolveRef(root, ref) {
  if (!ref.startsWith("#/")) return null;
  return ref.slice(2).split("/").reduce((node, part) => node?.[part.replace(/~1/g, "/").replace(/~0/g, "~")], root);
}

function schemaErrors(value, schema, root, path = "$") {
  const errors = [];
  validateSchema(value, schema, root, path, errors);
  return errors;
}

function validates(value, schema, root) {
  return schemaErrors(value, schema, root).length === 0;
}

function validateSchema(value, schema, root, path, errors) {
  if (!schema || typeof schema !== "object") {
    add(errors, path, "invalid_schema", "the frozen validation schema is unusable", "restore the committed I0 schema");
    return;
  }
  if (schema.$ref) {
    const resolved = resolveRef(root, schema.$ref);
    if (!resolved) {
      add(errors, path, "unsupported_reference", "the frozen validation schema contains an unsupported reference", "restore the committed I0 schema");
      return;
    }
    validateSchema(value, resolved, root, path, errors);
  }

  if (schema.type && !typeMatches(value, schema.type)) {
    add(errors, path, "type", `expected ${Array.isArray(schema.type) ? schema.type.join(" or ") : schema.type}`, "supply a value of the registered type");
    return;
  }
  if (Object.hasOwn(schema, "const") && !same(value, schema.const)) {
    add(errors, path, "const", "value is not the required registered value", "use the registered value");
  }
  if (schema.enum && !schema.enum.some((entry) => same(value, entry))) {
    add(errors, path, "enum", `value is not one of the registered values: ${schema.enum.filter((entry) => typeof entry !== "object").join(", ")}`, "use a registered value");
  }
  if (typeof value === "string") {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      add(errors, path, "min_length", `value must be at least ${schema.minLength} character${schema.minLength === 1 ? "" : "s"}`, "supply a non-empty approved value");
    }
    if (schema.pattern && !new RegExp(schema.pattern, "u").test(value)) {
      add(errors, path, "pattern", "value does not have the required safe format", "use the required registered format");
    }
    if (schema.format === "date" && !isIsoDate(value)) {
      add(errors, path, "format", "value must be a real YYYY-MM-DD date", "supply a calendar date in YYYY-MM-DD form");
    }
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) {
      add(errors, path, "minimum", `value must be at least ${schema.minimum}`, `supply a value of at least ${schema.minimum}`);
    }
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      add(errors, path, "min_items", `array requires at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}`, "supply every required registered item");
    }
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      add(errors, path, "max_items", `array allows at most ${schema.maxItems} item${schema.maxItems === 1 ? "" : "s"}`, "remove unsupported items");
    }
    if (schema.uniqueItems && value.some((item, index) => value.slice(0, index).some((other) => same(other, item)))) {
      add(errors, path, "unique_items", "array items must be unique", "remove duplicate registered items");
    }
    if (schema.items) value.forEach((item, index) => validateSchema(item, schema.items, root, `${path}[${index}]`, errors));
    if (schema.contains && !value.some((item) => validates(item, schema.contains, root))) {
      add(errors, path, "contains", "array is missing a required registered item", "include the selected registered item");
    }
  }
  if (isObject(value)) {
    for (const key of schema.required ?? []) {
      if (!Object.hasOwn(value, key)) add(errors, `${path}.${key}`, "required", "required property is missing", "add the required property");
    }
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      if (Object.hasOwn(value, key)) validateSchema(value[key], child, root, `${path}.${key}`, errors);
    }
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    const extra = Object.keys(value).filter((key) => !allowed.has(key));
    if (schema.additionalProperties === false && extra.length > 0) {
      add(errors, path, "additional_property", "object is closed and contains an unregistered property", "remove the unregistered property");
    } else if (isObject(schema.additionalProperties)) {
      for (const key of extra) validateSchema(value[key], schema.additionalProperties, root, `${path}.*`, errors);
    }
    for (const [key, dependencies] of Object.entries(schema.dependentRequired ?? {})) {
      if (Object.hasOwn(value, key)) {
        for (const dependency of dependencies) {
          if (!Object.hasOwn(value, dependency)) {
            add(errors, `${path}.${dependency}`, "dependent_required", `property is required when ${key} is supplied`, `add ${dependency} or remove ${key}`);
          }
        }
      }
    }
  }
  for (const child of schema.allOf ?? []) validateSchema(value, child, root, path, errors);
  if (schema.anyOf && !schema.anyOf.some((child) => validates(value, child, root))) {
    add(errors, path, "any_of", "value does not match an approved contract shape", "use one approved contract shape");
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((child) => validates(value, child, root)).length;
    if (matches !== 1) add(errors, path, "one_of", "value must match exactly one approved contract shape", "supply one complete state-specific shape");
  }
  if (schema.not && validates(value, schema.not, root)) {
    add(errors, path, "not", "value uses a forbidden contract shape", "remove the forbidden fields or choose an approved state shape");
  }
  if (schema.if) {
    const branch = validates(value, schema.if, root) ? schema.then : schema.else;
    if (branch) validateSchema(value, branch, root, path, errors);
  }
}

function exactObjectKeys(value, expected, path, errors) {
  if (!isObject(value)) {
    add(errors, path, "type", "expected object", "supply the required registered object");
    return false;
  }
  for (const key of expected) {
    if (!Object.hasOwn(value, key)) add(errors, `${path}.${key}`, "required", "registered entry is missing", "add every registered entry");
  }
  if (Object.keys(value).some((key) => !expected.includes(key))) {
    add(errors, path, "unknown_identifier", `object contains an unregistered identifier; expected: ${expected.join(", ")}`, "remove it or obtain an approved I0 registry update");
  }
  return true;
}

function exactStringList(value, expected, path, errors) {
  if (!Array.isArray(value)) {
    add(errors, path, "type", "expected ordered registry array", "supply the committed registry values");
    return;
  }
  if (!same(value, expected)) {
    add(errors, path, "registry_list", `registry list must be exactly: ${expected.join(", ")}`, "restore the committed registered values and order");
  }
}

function cellSchemaRef(runner, phase) {
  if (phase === "advisory") return runner === "claude" ? "#/$defs/claudeAdvisoryCell" : "#/$defs/codexAdvisoryCell";
  return runner === "claude" ? "#/$defs/claudeCell" : "#/$defs/codexCell";
}

function validateRegistryCell(value, runner, phase, path, errors) {
  const schema = resolveRef(USER_SCHEMA, cellSchemaRef(runner, phase));
  validateSchema(value, schema, USER_SCHEMA, path, errors);
}

function compareToFrozen(value, expected, path, errors) {
  if (errors.length >= MAX_ERRORS || same(value, expected)) return;
  if (isObject(expected) && isObject(value)) {
    for (const key of Object.keys(expected)) {
      if (Object.hasOwn(value, key)) compareToFrozen(value[key], expected[key], `${path}.${key}`, errors);
    }
    return;
  }
  if (Array.isArray(expected) && Array.isArray(value)) {
    expected.forEach((entry, index) => {
      if (index < value.length) compareToFrozen(value[index], entry, `${path}[${index}]`, errors);
    });
    return;
  }
  add(errors, path, "frozen_mapping", "value differs from the frozen I0 registry", "use the committed registered cell or obtain a PO-approved I0 contract update");
}

function validateRegistryShape(candidate, registry, errors) {
  if (!isObject(candidate)) {
    add(errors, "$", "type", "registry must be an object", "supply the committed registry object");
    return;
  }
  exactObjectKeys(candidate, ["schema", "runners", "phases", "profiles", "duties"], "$", errors);
  if (candidate.schema !== registry.schema) add(errors, "$.schema", "const", "registry schema id is not registered", "use pipeline.runner-profiles.v2");
  exactStringList(candidate.runners, registry.runners, "$.runners", errors);
  exactStringList(candidate.phases, registry.phases, "$.phases", errors);

  const profiles = Object.keys(registry.profiles);
  const duties = Object.keys(registry.duties);
  if (exactObjectKeys(candidate.profiles, profiles, "$.profiles", errors)) {
    for (const profile of profiles) {
      const profileValue = candidate.profiles[profile];
      if (!exactObjectKeys(profileValue, registry.phases, `$.profiles.${profile}`, errors)) continue;
      for (const phase of registry.phases) {
        const pair = profileValue[phase];
        if (!exactObjectKeys(pair, registry.runners, `$.profiles.${profile}.${phase}`, errors)) continue;
        for (const runner of registry.runners) {
          if (Object.hasOwn(pair, runner)) validateRegistryCell(pair[runner], runner, phase, `$.profiles.${profile}.${phase}.${runner}`, errors);
        }
      }
    }
  }
  if (exactObjectKeys(candidate.duties, duties, "$.duties", errors)) {
    for (const duty of duties) {
      const pair = candidate.duties[duty];
      if (!exactObjectKeys(pair, registry.runners, `$.duties.${duty}`, errors)) continue;
      for (const runner of registry.runners) {
        if (Object.hasOwn(pair, runner)) validateRegistryCell(pair[runner], runner, "duty", `$.duties.${duty}.${runner}`, errors);
      }
    }
  }
}

function result(errors, source) {
  return {
    ok: errors.length === 0,
    source,
    errors: errors.slice(0, MAX_ERRORS),
  };
}

/** Validates a registry candidate against the frozen I0 mapping and cell grammar. */
export function validateRunnerProfilesV2Registry(candidate, { source = "runner-profiles-v2.json" } = {}) {
  const errors = [];
  validateRegistryShape(candidate, FROZEN_REGISTRY, errors);
  if (errors.length === 0) compareToFrozen(candidate, FROZEN_REGISTRY, "$", errors);
  return result(errors, source);
}

function validateRoutingMapping(routing, registry, errors) {
  if (!isObject(routing)) return;
  // The registry itself stays exact.  A v2 project intent may retain a
  // schema-valid legacy Claude selector and effort in its original Claude cell
  // after I3 migration. State and all non-route capability semantics remain
  // frozen, and the paired Codex cell remains the frozen declaration.
  for (const [profile, phases] of Object.entries(registry.profiles)) {
    for (const [phase, runners] of Object.entries(phases)) {
      for (const [runner, expected] of Object.entries(runners)) {
        const actual = routing.profiles?.[profile]?.[phase]?.[runner];
        if (actual === undefined) continue;
        const path = `$.routing.profiles.${profile}.${phase}.${runner}`;
        if (runner === "claude") compareLegacyClaudeRoute(actual, expected, path, errors);
        else compareToFrozen(actual, expected, path, errors);
      }
    }
  }
  for (const [duty, runners] of Object.entries(registry.duties)) {
    for (const [runner, expected] of Object.entries(runners)) {
      const actual = routing.duties?.[duty]?.[runner];
      if (actual === undefined) continue;
      const path = `$.routing.duties.${duty}.${runner}`;
      if (runner === "claude") compareLegacyClaudeRoute(actual, expected, path, errors);
      else compareToFrozen(actual, expected, path, errors);
    }
  }
}

/**
 * I3 may retain only a legacy Claude request (selector plus effort).  Every
 * capability-state field stays identical to the frozen cell; accepting more
 * would make an arbitrary v2 edit look like a migration result.
 */
function compareLegacyClaudeRoute(actual, expected, path, errors) {
  if (!isObject(actual) || !isObject(expected)) return;
  const routeKeys = new Set(["selector", "effort"]);
  const actualFixedKeys = Object.keys(actual).filter((key) => !routeKeys.has(key)).sort();
  const expectedFixedKeys = Object.keys(expected).filter((key) => !routeKeys.has(key)).sort();
  if (!same(actualFixedKeys, expectedFixedKeys)) {
    add(errors, path, "frozen_mapping", "legacy preservation may not change frozen Claude capability fields", "restore the committed Claude state and capability fields");
    return;
  }
  for (const key of expectedFixedKeys) compareToFrozen(actual[key], expected[key], `${path}.${key}`, errors);
  for (const key of routeKeys) {
    if (Object.hasOwn(actual, key) !== Object.hasOwn(expected, key)) {
      add(errors, `${path}.${key}`, "frozen_mapping", "legacy preservation may not add or remove a frozen Claude route field", "restore the committed Claude route-field shape");
    }
  }
}

/**
 * Validates a complete pipeline.user.v2 value. The registry remains the exact
 * complete mapping, while schema-valid Claude selectors and efforts may retain
 * an accepted I3 legacy route in that same Claude cell. Its frozen capability
 * state remains exact. Codex cells remain required to use the committed
 * per-cell mapping; an alternative needs an I0 registry update backed by a PO
 * decision.
 */
export function validatePipelineUserV2(value, { source = "pipeline.user.v2", registry = FROZEN_REGISTRY } = {}) {
  const errors = [];
  const registryResult = validateRunnerProfilesV2Registry(registry, { source: "frozen I0 registry" });
  if (!registryResult.ok) {
    add(errors, "$", "registry_invalid", "the supplied registry is not the frozen I0 contract", "restore the committed registry before validating configuration");
    return result(errors, source);
  }
  validateSchema(value, USER_SCHEMA, USER_SCHEMA, "$", errors);
  if (errors.length === 0) validateRoutingMapping(value.routing, registry, errors);
  return result(errors, source);
}

export function validatePipelineUserV2Json(text, options = {}) {
  try {
    return validatePipelineUserV2(JSON.parse(text), options);
  } catch {
    return result([{ path: "$", code: "parse", message: "configuration is not valid JSON", repair: "provide one valid JSON document" }], options.source ?? "pipeline.user.v2");
  }
}
