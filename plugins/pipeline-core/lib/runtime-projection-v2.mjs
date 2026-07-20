// SPDX-License-Identifier: Apache-2.0

/**
 * Read-only v2 runtime projection planning.
 *
 * This module deliberately has no activation or filesystem-write entry point.
 * I3 owns source migration and the transaction/apply boundary.  I2 receives a
 * validated pipeline.user.v2 intent plus runtime baseline bytes and returns
 * deterministic proposed target bytes, byte digests, ownership evidence, and
 * decision-labelled baseline conflicts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadRunnerProfilesV2Registry,
  validatePipelineUserV2,
  validatePipelineUserV2Json,
} from "./runner-profiles-v2.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(HERE, "..", "config");
const OWNED_KEYS_PATH = join(CONFIG_DIR, "runtime-projection-v2-owned-keys.json");
const OWNED_KEYS_SCHEMA = "pipeline.runtime-projection-owned-keys.v2";
const EFFECTIVE_MODEL_UNKNOWN = "effective-model-not-observed";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function byteLength(value) {
  return Buffer.byteLength(value, "utf8");
}

function describeBytes(bytes) {
  if (bytes === null) return { status: "absent", byteLength: 0, sha256: null };
  return { status: "present", byteLength: byteLength(bytes), sha256: sha256(bytes) };
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function addDiagnostic(diagnostics, path, code, message, repair) {
  diagnostics.push({ path, code, message, repair });
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
}

function frozen(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

const FROZEN_OWNED_KEYS = frozen(JSON.parse(readFileSync(OWNED_KEYS_PATH, "utf8")));
const FROZEN_OWNED_KEYS_CANONICAL_JSON = JSON.stringify(stableValue(FROZEN_OWNED_KEYS));

export const RUNTIME_PROJECTION_V2_OWNED_KEYS_PATH = OWNED_KEYS_PATH;

/** Returns a caller-safe copy of I2's explicit target/key boundary. */
export function loadRuntimeProjectionV2OwnedKeys(path = OWNED_KEYS_PATH) {
  return clone(JSON.parse(readFileSync(path, "utf8")));
}

function validateCellReference(cell, path, diagnostics) {
  if (!isObject(cell) || !["duty", "profile-phase"].includes(cell.kind)) {
    addDiagnostic(diagnostics, path, "invalid_cell", "target binding must name one registered duty or profile-phase cell", "restore the committed I2 owned-key manifest");
    return;
  }
  if (cell.kind === "duty" && typeof cell.dutyId !== "string") {
    addDiagnostic(diagnostics, path, "invalid_cell", "duty binding must name dutyId", "restore the committed I2 owned-key manifest");
  }
  if (cell.kind === "profile-phase" && (typeof cell.profileId !== "string" || typeof cell.phaseId !== "string")) {
    addDiagnostic(diagnostics, path, "invalid_cell", "profile-phase binding must name profileId and phaseId", "restore the committed I2 owned-key manifest");
  }
}

function validateOwnedKeysManifest(manifest) {
  const diagnostics = [];
  if (!isObject(manifest) || manifest.schema !== OWNED_KEYS_SCHEMA || !Array.isArray(manifest.targets)) {
    addDiagnostic(diagnostics, "$", "invalid_manifest", "owned-key manifest has an unsupported schema or shape", "restore the committed I2 owned-key manifest");
    return diagnostics;
  }
  const seenPaths = new Set();
  for (const [index, target] of manifest.targets.entries()) {
    const path = `$.targets[${index}]`;
    if (!isObject(target) || typeof target.path !== "string" || typeof target.format !== "string" || typeof target.projection !== "string" || !Array.isArray(target.ownedKeys)) {
      addDiagnostic(diagnostics, path, "invalid_target", "target must declare path, format, projection, and ownedKeys", "restore the committed I2 owned-key manifest");
      continue;
    }
    if (target.path.startsWith("/") || target.path.split("/").includes("..") || seenPaths.has(target.path)) {
      addDiagnostic(diagnostics, `${path}.path`, "unsafe_target_path", "target path must be one unique project-relative path", "restore the committed I2 owned-key manifest");
    }
    seenPaths.add(target.path);
    if (new Set(target.ownedKeys).size !== target.ownedKeys.length || target.ownedKeys.some((key) => typeof key !== "string" || key.length === 0)) {
      addDiagnostic(diagnostics, `${path}.ownedKeys`, "invalid_owned_keys", "owned keys must be a unique list of non-empty strings", "restore the committed I2 owned-key manifest");
    }
    if (target.projection === "claude-model-routing-v2") {
      if (!isObject(target.nativeModelAliases) || !Array.isArray(target.bindings) || !target.ownedKeys.includes("modelRouting")) {
        addDiagnostic(diagnostics, path, "invalid_claude_target", "Claude target must own modelRouting with native aliases and bindings", "restore the committed I2 owned-key manifest");
      }
      for (const [bindingIndex, binding] of (target.bindings ?? []).entries()) {
        if (!isObject(binding) || typeof binding.targetKey !== "string") {
          addDiagnostic(diagnostics, `${path}.bindings[${bindingIndex}]`, "invalid_binding", "Claude binding must name targetKey", "restore the committed I2 owned-key manifest");
        } else {
          validateCellReference(binding, `${path}.bindings[${bindingIndex}]`, diagnostics);
        }
      }
    }
    if (target.projection === "codex-custom-agent-v2") {
      if (target.format !== "toml" || !target.ownedKeys.includes("model") || !target.ownedKeys.includes("model_reasoning_effort")) {
        addDiagnostic(diagnostics, path, "invalid_codex_target", "Codex custom-agent target must own model and model_reasoning_effort", "restore the committed I2 owned-key manifest");
      }
      validateCellReference(target.cell, `${path}.cell`, diagnostics);
    }
  }
  return diagnostics;
}

function isCommittedOwnedKeysManifest(manifest) {
  try {
    return JSON.stringify(stableValue(manifest)) === FROZEN_OWNED_KEYS_CANONICAL_JSON;
  } catch {
    return false;
  }
}

function uncommittedManifestPlan(source) {
  return {
    schema: "pipeline.runtime-projection-plan.v2",
    status: "invalid-manifest",
    source,
    diagnostics: [{
      path: "$.ownedKeyManifest",
      code: "invalid_manifest",
      message: "owned-key manifest differs from the committed frozen I2 manifest",
      repair: "remove the caller-supplied manifest or restore the committed I2 owned-key manifest",
    }],
    targets: [],
    decisionConflicts: [],
    requiresExplicitActivation: true,
  };
}

function normalizedBaseline(value, path, diagnostics) {
  if (typeof value === "string") return { status: "present", bytes: value };
  if (isObject(value) && value.status === "absent" && value.bytes === undefined) return { status: "absent", bytes: null };
  if (isObject(value) && value.status === "present" && typeof value.bytes === "string") return { status: "present", bytes: value.bytes };
  addDiagnostic(diagnostics, path, "invalid_baseline", "baseline must be UTF-8 bytes or an explicit absent marker", "supply project-local target bytes without activating a projection");
  return null;
}

function lineStarts(text) {
  const starts = [0];
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "\n" && index + 1 < text.length) starts.push(index + 1);
  }
  return starts;
}

function yamlTopLevelMappingHeader(line) {
  if (line.startsWith(" ") || line.startsWith("\t")) return null;
  const parsed = parseYaml(line);
  if (!isObject(parsed) || Object.keys(parsed).length !== 1) return null;
  return Object.keys(parsed)[0];
}

function yamlTopLevelBlockRange(bytes, key) {
  let document;
  try {
    document = parseYaml(bytes);
  } catch (error) {
    return { ok: false, reason: "unsupported-or-ambiguous-baseline" };
  }
  if (!isObject(document)) return { ok: false, reason: "not-a-top-level-mapping" };

  const headers = [];
  for (const start of lineStarts(bytes)) {
    const lineEnd = bytes.indexOf("\n", start);
    const line = bytes.slice(start, lineEnd === -1 ? bytes.length : lineEnd).replace(/\r$/, "");
    let header;
    try {
      header = yamlTopLevelMappingHeader(line);
    } catch (error) {
      return { ok: false, reason: "unsupported-or-ambiguous-baseline" };
    }
    if (header === key) {
      if (line !== `${key}:`) return { ok: false, reason: "owned-header-is-not-strict" };
      headers.push(start);
    }
  }
  if (headers.length !== 1) return { ok: false, reason: headers.length === 0 ? "missing" : "duplicate" };

  const start = headers[0];
  for (const candidate of lineStarts(bytes)) {
    if (candidate <= start) continue;
    const lineEnd = bytes.indexOf("\n", candidate);
    const line = bytes.slice(candidate, lineEnd === -1 ? bytes.length : lineEnd).replace(/\r$/, "");
    let header;
    try {
      header = yamlTopLevelMappingHeader(line);
    } catch (error) {
      return { ok: false, reason: "unsupported-or-ambiguous-baseline" };
    }
    if (header !== null) return { ok: true, start, end: candidate };
  }
  return { ok: true, start, end: bytes.length };
}

function cellForIntent(intent, cell) {
  if (cell.kind === "duty") return intent.routing.duties[cell.dutyId]?.codex;
  return intent.routing.profiles[cell.profileId]?.[cell.phaseId]?.codex;
}

function runnerCellForIntent(intent, cell, runner) {
  if (cell.kind === "duty") return intent.routing.duties[cell.dutyId]?.[runner];
  return intent.routing.profiles[cell.profileId]?.[cell.phaseId]?.[runner];
}

function describeCell(cell) {
  return cell.kind === "duty"
    ? { kind: "duty", dutyId: cell.dutyId }
    : { kind: "profile-phase", profileId: cell.profileId, phaseId: cell.phaseId };
}

function requestedRoute(cell) {
  return {
    requested: {
      selector: clone(cell.selector),
      effort: cell.effort,
    },
    effective: {
      status: "unknown",
      reasonCode: EFFECTIVE_MODEL_UNKNOWN,
    },
  };
}

function renderClaudeModelRouting(target, intent, eol, diagnostics) {
  const lines = [
    "modelRouting:",
    "  # Generated v2 Claude compatibility projection; pipeline.user.v2 is the only routing authority.",
    "  # Requested selectors are not route-receipt or effective-model evidence.",
  ];
  const routes = [];
  for (const binding of target.bindings) {
    const cell = runnerCellForIntent(intent, binding, "claude");
    if (!cell || !cell.selector || !cell.effort) {
      addDiagnostic(diagnostics, `$.routing.${binding.kind === "duty" ? "duties" : "profiles"}`, "unprojectable_cell", "owned Claude target binding has no active registered route", "repair the frozen I2 target binding");
      continue;
    }
    const model = target.nativeModelAliases[cell.selector.value];
    if (typeof model !== "string") {
      addDiagnostic(diagnostics, `$.routing.${binding.targetKey}`, "unsupported_native_selector", "Claude selector has no declared native target projection", "obtain an approved I2 owned-key manifest update");
      continue;
    }
    lines.push(`  ${binding.targetKey}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    effort: ${cell.effort}`);
    routes.push({ targetKey: binding.targetKey, cell: describeCell(binding), ...requestedRoute(cell) });
  }
  return { bytes: `${lines.join(eol)}${eol}${eol}`, routes };
}

function renderYamlTarget(target, baseline, intent, diagnostics) {
  if (baseline.status !== "present") {
    addDiagnostic(diagnostics, target.path, "required_baseline_missing", "owned YAML target is absent; planning cannot preserve its unowned runtime bytes", "supply the project-local baseline before activation planning");
    return null;
  }
  const range = yamlTopLevelBlockRange(baseline.bytes, "modelRouting");
  if (!range.ok) {
    addDiagnostic(diagnostics, `${target.path}:modelRouting`, "yaml_target_parse", `owned modelRouting block is ${range.reason}`, "repair the baseline outside this compiler, then plan again");
    return null;
  }
  const eol = baseline.bytes.includes("\r\n") ? "\r\n" : "\n";
  const rendered = renderClaudeModelRouting(target, intent, eol, diagnostics);
  if (diagnostics.length > 0) return null;
  const after = `${baseline.bytes.slice(0, range.start)}${rendered.bytes}${baseline.bytes.slice(range.end)}`;
  const unownedBefore = `${baseline.bytes.slice(0, range.start)}${baseline.bytes.slice(range.end)}`;
  const unownedAfter = `${after.slice(0, range.start)}${after.slice(range.start + rendered.bytes.length)}`;
  return {
    after,
    routes: rendered.routes,
    unowned: {
      preserved: unownedBefore === unownedAfter,
      byteLength: byteLength(unownedBefore),
      sha256: sha256(unownedBefore),
    },
  };
}

function locateTomlTopLevelValues(bytes, keys) {
  const found = new Map();
  let offset = 0;
  let inSection = false;
  for (const rawLine of bytes.split(/(?<=\n)/u)) {
    const line = rawLine.replace(/[\r\n]+$/u, "");
    if (/^\s*\[.*\]\s*$/u.test(line)) inSection = true;
    if (!inSection) {
      for (const key of keys) {
        const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
        const assignment = new RegExp(`^\\s*${escapedKey}\\s*=`, "u");
        if (!assignment.test(line)) continue;
        const basicString = "\"((?:[^\"\\\\\\u0000-\\u001F\\u007F]|\\\\(?:[\"\\\\btnfr]|u[0-9A-Fa-f]{4}|U[0-9A-Fa-f]{8}))*)\"";
        const completeLine = new RegExp(`^(\\s*${escapedKey}\\s*=\\s*)${basicString}\\s*(?:#.*)?$`, "u");
        const match = line.match(completeLine);
        if (!match) return { ok: false, reason: `malformed top-level ${key}` };
        if (found.has(key)) return { ok: false, reason: `duplicate top-level ${key}` };
        const valueStart = offset + match[1].length + 1;
        found.set(key, { value: match[2], start: valueStart, end: valueStart + match[2].length });
      }
    }
    offset += rawLine.length;
  }
  const missing = keys.filter((key) => !found.has(key));
  if (missing.length > 0) return { ok: false, reason: `missing top-level ${missing.join(", ")}` };
  return { ok: true, values: found };
}

function encodeTomlBasicString(value) {
  return value.replace(/\\/gu, "\\\\").replace(/"/gu, "\\\"").replace(/\n/gu, "\\n");
}

function patchTomlValues(bytes, locations, wanted) {
  const replacements = [...locations.entries()]
    .map(([key, location]) => ({ ...location, replacement: encodeTomlBasicString(wanted[key]) }))
    .sort((left, right) => right.start - left.start);
  let after = bytes;
  for (const replacement of replacements) {
    after = `${after.slice(0, replacement.start)}${replacement.replacement}${after.slice(replacement.end)}`;
  }
  const spans = [...locations.values()].sort((left, right) => left.start - right.start);
  const unownedBefore = complementBytes(bytes, spans);
  const afterLocations = locateTomlTopLevelValues(after, [...locations.keys()]);
  if (!afterLocations.ok) throw new Error(`Renderer produced unreadable TOML target: ${afterLocations.reason}`);
  const afterSpans = [...afterLocations.values.values()].sort((left, right) => left.start - right.start);
  return { after, unownedBefore, unownedAfter: complementBytes(after, afterSpans) };
}

function complementBytes(bytes, spans) {
  let cursor = 0;
  let out = "";
  for (const span of spans) {
    out += bytes.slice(cursor, span.start);
    cursor = span.end;
  }
  return `${out}${bytes.slice(cursor)}`;
}

function renderCodexAgentTarget(target, baseline, intent, diagnostics) {
  if (baseline.status !== "present") {
    addDiagnostic(diagnostics, target.path, "required_baseline_missing", "owned custom-agent target is absent; planning cannot synthesize its unowned agent contract", "supply the project-local custom-agent baseline before activation planning");
    return null;
  }
  const cell = cellForIntent(intent, target.cell);
  if (!cell || !cell.selector || !cell.effort || cell.state === "unavailable" || cell.state === "unknown") {
    addDiagnostic(diagnostics, `$.routing.duties.${target.cell.dutyId}.codex`, "unprojectable_cell", "owned Codex agent binding has no active registered route", "repair the frozen I2 target binding");
    return null;
  }
  const locations = locateTomlTopLevelValues(baseline.bytes, target.ownedKeys);
  if (!locations.ok) {
    addDiagnostic(diagnostics, target.path, "toml_target_parse", `owned custom-agent keys cannot be safely located: ${locations.reason}`, "repair the baseline outside this compiler, then plan again");
    return null;
  }
  const wanted = { model: cell.selector.value, model_reasoning_effort: cell.effort };
  const patched = patchTomlValues(baseline.bytes, locations.values, wanted);
  const observed = Object.fromEntries([...locations.values.entries()].map(([key, value]) => [key, value.value]));
  const conflicts = Object.entries(wanted)
    .filter(([key, value]) => observed[key] !== value)
    .map(([key, value]) => ({ key, observed: observed[key], required: value }));
  return {
    after: patched.after,
    route: { cell: describeCell(target.cell), ...requestedRoute(cell) },
    observed,
    conflicts,
    unowned: {
      preserved: patched.unownedBefore === patched.unownedAfter,
      byteLength: byteLength(patched.unownedBefore),
      sha256: sha256(patched.unownedBefore),
    },
  };
}

function preserveOnlyTarget(target, baseline) {
  const bytes = baseline.bytes;
  return {
    after: bytes,
    unowned: {
      preserved: true,
      byteLength: bytes === null ? 0 : byteLength(bytes),
      sha256: bytes === null ? null : sha256(bytes),
    },
  };
}

function targetPlan(target, baseline, rendered) {
  const before = describeBytes(baseline.bytes);
  const after = describeBytes(rendered.after);
  return {
    path: target.path,
    format: target.format,
    projection: target.projection,
    ownedKeys: [...target.ownedKeys],
    before,
    after: {
      ...after,
      bytes: rendered.after,
    },
    changed: before.sha256 !== after.sha256,
    unowned: rendered.unowned,
    ...(rendered.routes ? { routes: rendered.routes } : {}),
    ...(rendered.route ? { route: rendered.route } : {}),
  };
}

function planFromValidatedIntent(intent, { source, baselines, manifest }) {
  const diagnostics = [];
  const manifestDiagnostics = validateOwnedKeysManifest(manifest);
  if (manifestDiagnostics.length > 0) {
    return {
      schema: "pipeline.runtime-projection-plan.v2",
      status: "invalid-manifest",
      source,
      diagnostics: manifestDiagnostics,
      targets: [],
      decisionConflicts: [],
      requiresExplicitActivation: true,
    };
  }
  const plans = [];
  const decisionConflicts = [];
  for (const target of manifest.targets) {
    const baseline = normalizedBaseline(baselines?.[target.path], `$.baselines.${target.path}`, diagnostics);
    if (!baseline) continue;
    let rendered;
    if (target.projection === "claude-model-routing-v2") {
      rendered = renderYamlTarget(target, baseline, intent, diagnostics);
    } else if (target.projection === "codex-custom-agent-v2") {
      rendered = renderCodexAgentTarget(target, baseline, intent, diagnostics);
    } else {
      rendered = preserveOnlyTarget(target, baseline);
    }
    if (!rendered) continue;
    const plan = targetPlan(target, baseline, rendered);
    plans.push(plan);
    if (target.decision && rendered.conflicts?.length > 0) {
      decisionConflicts.push({
        decision: target.decision,
        target: target.path,
        cell: describeCell(target.cell),
        observed: rendered.observed,
        required: { model: rendered.route.requested.selector.value, model_reasoning_effort: rendered.route.requested.effort },
        differences: rendered.conflicts,
        resolution: "frozen I0 registry",
        applyGuard: "I3 explicit activation is required; this I2 plan never writes",
      });
    }
  }
  if (diagnostics.length > 0) {
    return {
      schema: "pipeline.runtime-projection-plan.v2",
      status: "invalid-baseline",
      source,
      diagnostics,
      targets: [],
      decisionConflicts,
      requiresExplicitActivation: true,
    };
  }
  const stableTargets = plans.sort((left, right) => left.path.localeCompare(right.path));
  return {
    schema: "pipeline.runtime-projection-plan.v2",
    status: "ready",
    source,
    intentSha256: sha256(JSON.stringify(stableValue(intent))),
    ownedKeyManifest: {
      schema: manifest.schema,
      sha256: sha256(JSON.stringify(stableValue(manifest))),
      targets: manifest.targets.map((target) => ({ path: target.path, format: target.format, projection: target.projection, ownedKeys: [...target.ownedKeys] })),
    },
    diagnostics: [],
    decisionConflicts: decisionConflicts.sort((left, right) => left.decision - right.decision),
    requiresExplicitActivation: true,
    targets: stableTargets,
  };
}

/**
 * Plan from an already parsed v2 intent. Invalid intent returns diagnostics
 * before any baseline is inspected or any target bytes are rendered.
 */
export function planRuntimeProjectionV2(intent, {
  source = "pipeline.user.v2",
  baselines = {},
  registry = loadRunnerProfilesV2Registry(),
  ownedKeyManifest = FROZEN_OWNED_KEYS,
} = {}) {
  if (!isCommittedOwnedKeysManifest(ownedKeyManifest)) return uncommittedManifestPlan(source);
  const validation = validatePipelineUserV2(intent, { source, registry });
  if (!validation.ok) {
    return {
      schema: "pipeline.runtime-projection-plan.v2",
      status: "invalid-intent",
      source,
      diagnostics: validation.errors,
      decisionConflicts: [],
      requiresExplicitActivation: true,
      targets: [],
    };
  }
  return planFromValidatedIntent(intent, { source, baselines, manifest: FROZEN_OWNED_KEYS });
}

/** Parses a JSON v2 source and returns the same pure read-only plan surface. */
export function planRuntimeProjectionV2Json(text, options = {}) {
  const parsed = validatePipelineUserV2Json(text, {
    source: options.source ?? "pipeline.user.v2",
    registry: options.registry ?? loadRunnerProfilesV2Registry(),
  });
  if (!parsed.ok) {
    return {
      schema: "pipeline.runtime-projection-plan.v2",
      status: "invalid-intent",
      source: parsed.source,
      diagnostics: parsed.errors,
      decisionConflicts: [],
      requiresExplicitActivation: true,
      targets: [],
    };
  }
  return planRuntimeProjectionV2(JSON.parse(text), options);
}

/**
 * Read declared project targets only.  It never creates directories/files and
 * represents a missing baseline explicitly, so callers can fail closed before
 * an apply transaction is even considered.
 */
export function readRuntimeProjectionV2Baselines(rootDir) {
  const root = resolve(rootDir);
  const baselines = {};
  for (const target of FROZEN_OWNED_KEYS.targets) {
    const path = resolve(root, target.path);
    if (!path.startsWith(`${root}/`) && path !== root) {
      throw new Error(`Unsafe owned target path: ${target.path}`);
    }
    baselines[target.path] = existsSync(path)
      ? { status: "present", bytes: readFileSync(path, "utf8") }
      : { status: "absent" };
  }
  return baselines;
}
