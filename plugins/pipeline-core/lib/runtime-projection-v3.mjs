// SPDX-License-Identifier: SUL-1.0

/**
 * Read-only V3 runtime projection planning.
 *
 * V3 keeps the byte-preserving V2 rendering kernel only for the target-byte
 * mechanics. V3 validates and renders every V3-owned route itself, so the
 * frozen V2 routing registry never substitutes for or rejects a registered V3
 * route.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadRunnerProfilesV2Registry } from "./runner-profiles-v2.mjs";
import {
  isPhysicalPathContained,
  planRuntimeProjectionV2,
  readRuntimeProjectionV2Baselines,
} from "./runtime-projection-v2.mjs";
import {
  loadRunnerProfilesV3Registry,
  validatePipelineUserV3,
  validatePipelineUserV3Json,
} from "./runner-profiles-v3.mjs";
import { criticExportPolicyDigest } from "./critic-export-policy.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const OWNED_KEYS_PATH = join(HERE, "..", "config", "runtime-projection-v3-owned-keys.json");
const PLAN_SCHEMA = "pipeline.runtime-projection-plan.v3";
const EFFECTIVE_MODEL_UNKNOWN = "effective-model-not-observed";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (isObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
  }
  return value;
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

function frozen(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) frozen(child);
    Object.freeze(value);
  }
  return value;
}

const FROZEN_OWNED_KEYS = frozen(JSON.parse(readFileSync(OWNED_KEYS_PATH, "utf8")));
const FROZEN_OWNED_KEYS_JSON = JSON.stringify(stableValue(FROZEN_OWNED_KEYS));

export const RUNTIME_PROJECTION_V3_OWNED_KEYS_PATH = OWNED_KEYS_PATH;

export function loadRuntimeProjectionV3OwnedKeys(path = OWNED_KEYS_PATH) {
  return clone(JSON.parse(readFileSync(path, "utf8")));
}

function isCommittedManifest(manifest) {
  try {
    return JSON.stringify(stableValue(manifest)) === FROZEN_OWNED_KEYS_JSON;
  } catch {
    return false;
  }
}

function emptyPlan(status, source, diagnostics) {
  return {
    schema: PLAN_SCHEMA,
    status,
    source,
    diagnostics,
    targets: [],
    decisionConflicts: [],
    requiresExplicitActivation: true,
  };
}

function manifestFailure(source) {
  return emptyPlan("invalid-manifest", source, [{
    path: "$.ownedKeyManifest",
    code: "invalid_manifest",
    message: "owned-key manifest differs from the committed frozen V3 manifest",
    repair: "remove the caller-supplied manifest or restore the committed V3 owned-key manifest",
  }]);
}

function v2CompatibilityIntent(intent) {
  const v2 = loadRunnerProfilesV2Registry();
  const compatibilityIntent = clone(intent);
  delete compatibilityIntent.critic_export;
  delete compatibilityIntent.roles;
  delete compatibilityIntent.session;
  // Repository export consent gates advisory dispatch only. It has no runtime
  // projection and must not leak into the closed V2 byte-rendering kernel.
  delete compatibilityIntent.advisor_export;
  return {
    ...compatibilityIntent,
    schema: "pipeline.user.v2",
    routing: {
      // The V2 routes are a valid carrier only.  `replaceClaudeTarget` and
      // `replaceCodexAgentTarget` below render the V3 profile and duty cells.
      profiles: clone(v2.profiles),
      // V2 is only the byte-preserving parse/render kernel. Keep its frozen
      // duty cells here and explicitly project every V3-owned duty below.
      duties: clone(v2.duties),
    },
  };
}

function cellForBinding(intent, binding) {
  if (binding.kind === "duty") return intent.routing.duties[binding.dutyId]?.claude;
  if (binding.kind === "profile-phase") return intent.routing.profiles[binding.profileId]?.[binding.phaseId]?.claude;
  if (binding.kind === "advisory-profile") {
    const advisory = intent.routing.duties.advisory;
    if (advisory?.eligibility?.[binding.profileId] !== "required") return null;
    return advisory.claude;
  }
  return null;
}

function describeBinding(binding) {
  if (binding.kind === "duty") return { kind: "duty", dutyId: binding.dutyId };
  if (binding.kind === "profile-phase") {
    return { kind: "profile-phase", profileId: binding.profileId, phaseId: binding.phaseId };
  }
  return { kind: "advisory-profile", dutyId: "advisory", profileId: binding.profileId };
}

function requestedRoute(cell) {
  return {
    requested: {
      selector: clone(cell.selector),
      effort: cell.effort,
      ...(cell.adapter ? { adapter: cell.adapter } : {}),
    },
    effective: { status: "unknown", reasonCode: EFFECTIVE_MODEL_UNKNOWN },
  };
}

function renderClaudeModelRouting(target, intent, eol) {
  const lines = [
    "modelRouting:",
    "  # Generated V3 Claude compatibility projection; pipeline.user.v3 is the only routing authority.",
    "  # Requested selectors are not advisor-receipt, route-receipt, or effective-model evidence.",
  ];
  const routes = [];
  for (const binding of target.bindings) {
    const cell = cellForBinding(intent, binding);
    if (!cell?.selector || !cell.effort) {
      throw new Error(`V3 binding is not projectable: ${binding.targetKey}`);
    }
    const model = target.nativeModelAliases[cell.selector.value];
    if (!model) throw new Error(`V3 Claude selector is not natively projectable: ${cell.selector.value}`);
    lines.push(`  ${binding.targetKey}:`);
    lines.push(`    model: ${model}`);
    lines.push(`    effort: ${cell.effort}`);
    routes.push({ targetKey: binding.targetKey, cell: describeBinding(binding), ...requestedRoute(cell) });
  }
  return { bytes: `${lines.join(eol)}${eol}${eol}`, routes };
}

function renderCriticExport(intent, eol) {
  return [
    "criticExport:",
    `  policy: ${intent.critic_export.schema}`,
    `  mode: ${intent.critic_export.mode}`,
    `  policySha256: ${criticExportPolicyDigest(intent.critic_export)}`,
    "  packetSchema: pipeline.critic-candidate-packet.v1",
    "  packetBoundary: candidate-diff-and-allowlisted-references",
    "  hostGate: visible-not-bypassed",
    "  providerGate: visible-not-bypassed",
    "",
    "",
  ].join(eol);
}

function topLevelBlockRange(bytes, key) {
  const lines = bytes.split(/(?<=\n)/u);
  let offset = 0;
  let start = -1;
  let end = bytes.length;
  for (const rawLine of lines) {
    const line = rawLine.replace(/[\r\n]+$/u, "");
    if (line === `${key}:`) {
      if (start !== -1) throw new Error(`duplicate top-level ${key}`);
      start = offset;
    } else if (start !== -1 && line.length > 0 && !line.startsWith(" ") && !line.startsWith("\t") && !line.startsWith("#")) {
      end = offset;
      break;
    }
    offset += rawLine.length;
  }
  if (start === -1) throw new Error(`missing top-level ${key}`);
  return { start, end };
}

function locateHumanFacingLanguage(bytes) {
  const range = topLevelBlockRange(bytes, "language");
  const block = bytes.slice(range.start, range.end);
  const matches = [...block.matchAll(/^(  human_facing:\s*)(de|en)(\s*(?:#.*)?)(\r?\n|$)/gmu)];
  if (matches.length !== 1) throw new Error("language block must contain exactly one direct human_facing scalar");
  const match = matches[0];
  const start = range.start + match.index + match[1].length;
  return { start, end: start + match[2].length, value: match[2] };
}

function replaceHumanFacingLanguage(bytes, humanFacing) {
  const location = locateHumanFacingLanguage(bytes);
  return `${bytes.slice(0, location.start)}${humanFacing}${bytes.slice(location.end)}`;
}

function optionalTopLevelBlockRange(bytes, key) {
  try {
    return topLevelBlockRange(bytes, key);
  } catch (error) {
    if (error.message === `missing top-level ${key}`) return null;
    throw error;
  }
}

function complementBytes(bytes, spans) {
  let cursor = 0;
  let result = "";
  for (const span of [...spans].sort((left, right) => left.start - right.start)) {
    if (span.start < cursor) throw new Error("overlapping V3 owned YAML spans");
    result += bytes.slice(cursor, span.start);
    cursor = span.end;
  }
  return `${result}${bytes.slice(cursor)}`;
}

function yamlOwnedSpans(bytes) {
  return [
    locateHumanFacingLanguage(bytes),
    optionalTopLevelBlockRange(bytes, "session"),
    topLevelBlockRange(bytes, "modelRouting"),
    optionalTopLevelBlockRange(bytes, "runnerRoutes"),
    optionalTopLevelBlockRange(bytes, "criticExport"),
  ].filter(Boolean).map(({ start, end }) => ({ start, end }));
}

function renderSessionKeepAwake(intent, eol) {
  // An omitted optional V3 source is deliberately rendered as disabled.  This
  // makes legacy V3 projects explicit at the runtime boundary without ever
  // granting a host-power side effect from absence or an unknown value.
  const keepAwake = intent.session?.keep_awake === true;
  return `session:${eol}  keep_awake: ${keepAwake ? "true" : "false"}${eol}`;
}

function assertOwnedSessionBlock(bytes, range) {
  const lines = bytes.slice(range.start, range.end).split(/\r?\n/u);
  const content = lines.filter((line) => line.length > 0 && !line.startsWith("#"));
  if (content.length !== 2 || content[0] !== "session:" || !/^  keep_awake:\s*(?:true|false)(?:\s+#.*)?$/u.test(content[1])) {
    throw new Error("session block must contain exactly one direct keep_awake boolean");
  }
}

function replaceSessionKeepAwake(bytes, intent) {
  const eol = bytes.includes("\r\n") ? "\r\n" : "\n";
  const rendered = renderSessionKeepAwake(intent, eol);
  const current = optionalTopLevelBlockRange(bytes, "session");
  if (current) {
    assertOwnedSessionBlock(bytes, current);
    return `${bytes.slice(0, current.start)}${rendered}${bytes.slice(current.end)}`;
  }
  const language = topLevelBlockRange(bytes, "language");
  return `${bytes.slice(0, language.end)}${rendered}${bytes.slice(language.end)}`;
}

function baselineBytes(baseline) {
  if (typeof baseline === "string") return baseline;
  if (baseline?.status === "present" && typeof baseline.bytes === "string") return baseline.bytes;
  return null;
}

function replaceClaudeTarget(v2Target, target, intent, originalBytes) {
  const baseline = v2Target.before.status === "present" ? v2Target : null;
  if (!baseline || typeof originalBytes !== "string") throw new Error("V3 Claude runtime baseline is absent");
  const beforeUnowned = complementBytes(originalBytes, yamlOwnedSpans(originalBytes));
  let afterBytes = replaceHumanFacingLanguage(originalBytes, intent.language.human_facing);
  const legacyRunnerRoutes = optionalTopLevelBlockRange(afterBytes, "runnerRoutes");
  if (legacyRunnerRoutes) {
    afterBytes = `${afterBytes.slice(0, legacyRunnerRoutes.start)}${afterBytes.slice(legacyRunnerRoutes.end)}`;
  }
  const eol = afterBytes.includes("\r\n") ? "\r\n" : "\n";
  const range = topLevelBlockRange(afterBytes, "modelRouting");
  const rendered = renderClaudeModelRouting(target, intent, eol);
  afterBytes = `${afterBytes.slice(0, range.start)}${rendered.bytes}${afterBytes.slice(range.end)}`;
  const criticExportBytes = renderCriticExport(intent, eol);
  const existingCriticExport = optionalTopLevelBlockRange(afterBytes, "criticExport");
  if (existingCriticExport) {
    afterBytes = `${afterBytes.slice(0, existingCriticExport.start)}${criticExportBytes}${afterBytes.slice(existingCriticExport.end)}`;
  } else {
    const projectedRouting = topLevelBlockRange(afterBytes, "modelRouting");
    afterBytes = `${afterBytes.slice(0, projectedRouting.end)}${criticExportBytes}${afterBytes.slice(projectedRouting.end)}`;
  }
  if (optionalTopLevelBlockRange(afterBytes, "runnerRoutes")) {
    throw new Error("legacy runnerRoutes survived the V3 projection");
  }
  afterBytes = replaceSessionKeepAwake(afterBytes, intent);
  const afterUnowned = complementBytes(afterBytes, yamlOwnedSpans(afterBytes));
  if (beforeUnowned !== afterUnowned) throw new Error("V3 YAML projection changed unowned runtime bytes");
  return {
    ...v2Target,
    projection: target.projection,
    ownedKeys: [...target.ownedKeys],
    after: {
      status: "present",
      byteLength: byteLength(afterBytes),
      sha256: sha256(afterBytes),
      bytes: afterBytes,
    },
    changed: v2Target.before.sha256 !== sha256(afterBytes),
    unowned: {
      preserved: true,
      byteLength: byteLength(beforeUnowned),
      sha256: sha256(beforeUnowned),
    },
    routes: rendered.routes,
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
        const match = line.match(new RegExp(`^(\\s*${key}\\s*=\\s*)\"([^\"]*)\"\\s*(?:#.*)?$`, "u"));
        if (!match) continue;
        if (found.has(key)) throw new Error(`duplicate top-level ${key}`);
        const start = offset + match[1].length + 1;
        found.set(key, { start, end: start + match[2].length, value: match[2] });
      }
    }
    offset += rawLine.length;
  }
  for (const key of keys) if (!found.has(key)) throw new Error(`missing top-level ${key}`);
  return found;
}

function patchTomlValues(bytes, locations, values) {
  let result = bytes;
  for (const [key, location] of [...locations.entries()].sort((left, right) => right[1].start - left[1].start)) {
    result = `${result.slice(0, location.start)}${values[key]}${result.slice(location.end)}`;
  }
  return result;
}

function replaceCodexAgentTarget(v2Target, target, intent) {
  const cell = intent.routing.duties[target.cell.dutyId]?.codex;
  if (!cell?.selector?.value || !cell.effort) throw new Error(`V3 Codex duty is not projectable: ${target.cell.dutyId}`);
  const keys = target.ownedKeys;
  const locations = locateTomlTopLevelValues(v2Target.after.bytes, keys);
  const wanted = { model: cell.selector.value, model_reasoning_effort: cell.effort };
  const afterBytes = patchTomlValues(v2Target.after.bytes, locations, wanted);
  return {
    ...v2Target,
    projection: target.projection,
    ownedKeys: [...keys],
    after: {
      status: "present",
      byteLength: byteLength(afterBytes),
      sha256: sha256(afterBytes),
      bytes: afterBytes,
    },
    changed: v2Target.before.sha256 !== sha256(afterBytes),
    route: {
      cell: { kind: "duty", dutyId: target.cell.dutyId },
      ...requestedRoute(cell),
    },
  };
}

function skipJsonWhitespace(bytes, index) {
  let cursor = index;
  while (cursor < bytes.length && /[\u0009\u000A\u000D\u0020]/u.test(bytes[cursor])) cursor += 1;
  return cursor;
}

function parseJsonString(bytes, start) {
  if (bytes[start] !== '"') throw new Error("JSON string expected");
  let cursor = start + 1;
  while (cursor < bytes.length) {
    const character = bytes[cursor];
    if (character === '"') {
      const end = cursor + 1;
      return { type: "string", start, end, value: JSON.parse(bytes.slice(start, end)) };
    }
    if (character === "\\") {
      cursor += 1;
      if (bytes[cursor] === "u") cursor += 4;
    }
    cursor += 1;
  }
  throw new Error("unterminated JSON string");
}

function parseJsonValue(bytes, start) {
  const index = skipJsonWhitespace(bytes, start);
  if (index >= bytes.length) throw new Error("JSON value expected");
  if (bytes[index] === '"') return parseJsonString(bytes, index);
  if (bytes[index] === "{") {
    const properties = [];
    let cursor = skipJsonWhitespace(bytes, index + 1);
    if (bytes[cursor] === "}") return { type: "object", start: index, end: cursor + 1, open: index, close: cursor, properties };
    while (cursor < bytes.length) {
      const key = parseJsonString(bytes, cursor);
      cursor = skipJsonWhitespace(bytes, key.end);
      if (bytes[cursor] !== ":") throw new Error("JSON object property colon expected");
      const value = parseJsonValue(bytes, cursor + 1);
      properties.push({ key: key.value, keyStart: key.start, keyEnd: key.end, value });
      cursor = skipJsonWhitespace(bytes, value.end);
      if (bytes[cursor] === "}") return { type: "object", start: index, end: cursor + 1, open: index, close: cursor, properties };
      if (bytes[cursor] !== ",") throw new Error("JSON object property separator expected");
      cursor = skipJsonWhitespace(bytes, cursor + 1);
    }
    throw new Error("unterminated JSON object");
  }
  if (bytes[index] === "[") {
    let cursor = skipJsonWhitespace(bytes, index + 1);
    if (bytes[cursor] === "]") return { type: "array", start: index, end: cursor + 1 };
    while (cursor < bytes.length) {
      const value = parseJsonValue(bytes, cursor);
      cursor = skipJsonWhitespace(bytes, value.end);
      if (bytes[cursor] === "]") return { type: "array", start: index, end: cursor + 1 };
      if (bytes[cursor] !== ",") throw new Error("JSON array separator expected");
      cursor = skipJsonWhitespace(bytes, cursor + 1);
    }
    throw new Error("unterminated JSON array");
  }
  const primitive = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/u.exec(bytes.slice(index));
  if (!primitive) throw new Error("JSON primitive expected");
  return { type: "primitive", start: index, end: index + primitive[0].length };
}

function parseJsonObject(bytes) {
  // JSON.parse supplies the exact grammar check; the small scanner retains the
  // source spans needed to patch just the declared owned key.
  JSON.parse(bytes);
  const root = parseJsonValue(bytes, 0);
  if (root.type !== "object" || skipJsonWhitespace(bytes, root.end) !== bytes.length) {
    throw new Error("pipeline calibration must be one JSON object");
  }
  return root;
}

function oneProperty(object, key) {
  const matches = object.properties.filter((property) => property.key === key);
  if (matches.length > 1) throw new Error(`duplicate JSON property ${key}`);
  return matches[0] ?? null;
}

function indentationAt(bytes, offset) {
  const lineStart = bytes.lastIndexOf("\n", offset - 1) + 1;
  return /^[\t ]*/u.exec(bytes.slice(lineStart, offset))?.[0] ?? "";
}

function applySpan(bytes, start, end, replacement) {
  return `${bytes.slice(0, start)}${replacement}${bytes.slice(end)}`;
}

function addJsonProperty(bytes, object, key, renderedValue) {
  const property = `${JSON.stringify(key)}: ${renderedValue}`;
  const indent = indentationAt(bytes, object.open);
  const childIndent = `${indent}  `;
  if (object.properties.length === 0) {
    const interior = bytes.slice(object.open + 1, object.close);
    const replacement = /[\r\n]/u.test(interior)
      ? `\n${childIndent}${property}\n${indent}`
      : property;
    return applySpan(bytes, object.open + 1, object.close, replacement);
  }
  const last = object.properties.at(-1);
  const multiline = /[\r\n]/u.test(bytes.slice(object.open, object.close));
  return applySpan(bytes, last.value.end, last.value.end, multiline ? `,\n${childIndent}${property}` : `, ${property}`);
}

function renderPoObject(label, indent) {
  return `{\n${indent}  "displayLabel": ${JSON.stringify(label)}\n${indent}}`;
}

function renderHumanRolesObject(label, indent) {
  return `{\n${indent}  "po": ${renderPoObject(label, `${indent}  `)}\n${indent}}`;
}

function patchHumanRoleCalibration(bytes, label) {
  const root = parseJsonObject(bytes);
  const humanRoles = oneProperty(root, "humanRoles");
  if (!humanRoles) {
    const rootChildIndent = `${indentationAt(bytes, root.open)}  `;
    return addJsonProperty(bytes, root, "humanRoles", renderHumanRolesObject(label, rootChildIndent));
  }
  if (humanRoles.value.type !== "object") throw new Error("humanRoles must be a JSON object");

  const po = oneProperty(humanRoles.value, "po");
  if (!po) {
    const poIndent = `${indentationAt(bytes, humanRoles.value.open)}  `;
    return addJsonProperty(bytes, humanRoles.value, "po", renderPoObject(label, poIndent));
  }
  if (po.value.type !== "object") throw new Error("humanRoles.po must be a JSON object");

  const displayLabel = oneProperty(po.value, "displayLabel");
  if (!displayLabel) return addJsonProperty(bytes, po.value, "displayLabel", JSON.stringify(label));
  if (displayLabel.value.type !== "string") throw new Error("humanRoles.po.displayLabel must be a JSON string");
  return applySpan(bytes, displayLabel.value.start, displayLabel.value.end, JSON.stringify(label));
}

function replaceHumanRoleCalibrationTarget(target, intent, originalBytes) {
  if (typeof originalBytes !== "string") throw new Error("V3 human-role calibration baseline is absent");
  const label = intent.roles?.po?.display_label ?? "PO";
  const afterBytes = patchHumanRoleCalibration(originalBytes, label);
  const before = describeBytes(originalBytes);
  const after = describeBytes(afterBytes);
  return {
    path: target.path,
    format: target.format,
    projection: target.projection,
    ownedKeys: [...target.ownedKeys],
    before,
    after: { ...after, bytes: afterBytes },
    changed: before.sha256 !== after.sha256,
    // The scanner changes only the owned value or inserts the owned path.  It
    // never parses/re-serializes unrelated calibration bytes.
    unowned: { preserved: true, byteLength: byteLength(originalBytes), sha256: sha256(originalBytes) },
  };
}

function projectValidatedIntent(intent, { source, baselines }) {
  const compatibility = planRuntimeProjectionV2(v2CompatibilityIntent(intent), {
    source: `${source}#v3-render-kernel`,
    baselines,
  });
  if (compatibility.status !== "ready") {
    const diagnostics = compatibility.status === "invalid-intent"
      ? [{
        path: "$.routing",
        code: "v3_kernel_incompatible",
        message: "V3 non-advisory routes cannot be represented by the frozen byte-preserving render kernel",
        repair: "update the V3 runtime renderer explicitly before changing registered non-advisory routes",
      }]
      : compatibility.diagnostics;
    return emptyPlan(compatibility.status, source, diagnostics);
  }

  const manifestTargets = Object.fromEntries(FROZEN_OWNED_KEYS.targets.map((target) => [target.path, target]));
  let targets;
  try {
    targets = compatibility.targets.map((target) => {
      const manifestTarget = manifestTargets[target.path];
      if (target.path === ".claude/pipeline.yaml") {
        return replaceClaudeTarget(target, manifestTarget, intent, baselineBytes(baselines?.[target.path]));
      }
      if (manifestTarget.projection === "codex-custom-agent-v3") {
        return replaceCodexAgentTarget(target, manifestTarget, intent);
      }
      return {
        ...target,
        projection: manifestTarget.projection,
        ownedKeys: [...manifestTarget.ownedKeys],
      };
    });
    targets.push(replaceHumanRoleCalibrationTarget(
      manifestTargets[".claude/pipeline.json"],
      intent,
      baselineBytes(baselines?.[".claude/pipeline.json"]),
    ));
  } catch (error) {
    return emptyPlan("invalid-baseline", source, [{
      path: ".claude/pipeline.json:humanRoles.po.displayLabel",
      code: "v3_projection_error",
      message: error.message,
      repair: "repair the baseline or committed V3 projection boundary before activation planning",
    }]);
  }

  const decisionConflicts = FROZEN_OWNED_KEYS.targets.flatMap((target) => {
    if (!target.decision || target.projection !== "codex-custom-agent-v3") return [];
    const bytes = baselineBytes(baselines?.[target.path]);
    if (bytes === null) return [];
    const observed = Object.fromEntries(locateTomlTopLevelValues(bytes, target.ownedKeys).entries()
      .map(([key, location]) => [key, location.value]));
    const cell = intent.routing.duties[target.cell.dutyId].codex;
    const required = { model: cell.selector.value, model_reasoning_effort: cell.effort };
    const differences = Object.entries(required)
      .filter(([key, value]) => observed[key] !== value)
      .map(([key, value]) => ({ key, observed: observed[key], required: value }));
    if (differences.length === 0) return [];
    return [{
      decision: target.decision,
      target: target.path,
      cell: { kind: "duty", dutyId: target.cell.dutyId },
      observed,
      required,
      differences,
      resolution: "frozen V3 registry",
      applyGuard: "explicit V3 activation is required; this plan never writes",
    }];
  }).sort((left, right) => left.decision - right.decision);

  return {
    schema: PLAN_SCHEMA,
    status: "ready",
    source,
    intentSha256: sha256(JSON.stringify(stableValue(intent))),
    ownedKeyManifest: {
      schema: FROZEN_OWNED_KEYS.schema,
      sha256: sha256(FROZEN_OWNED_KEYS_JSON),
      targets: FROZEN_OWNED_KEYS.targets.map((target) => ({
        path: target.path,
        format: target.format,
        projection: target.projection,
        ownedKeys: [...target.ownedKeys],
      })),
    },
    diagnostics: [],
    decisionConflicts,
    requiresExplicitActivation: true,
    targets: targets.sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function planRuntimeProjectionV3(intent, {
  source = "pipeline.user.v3",
  baselines = {},
  registry = loadRunnerProfilesV3Registry(),
  ownedKeyManifest = FROZEN_OWNED_KEYS,
} = {}) {
  if (!isCommittedManifest(ownedKeyManifest)) return manifestFailure(source);
  const validation = validatePipelineUserV3(intent, { source, registry });
  if (!validation.ok) return emptyPlan("invalid-intent", source, validation.errors);
  return projectValidatedIntent(intent, { source, baselines });
}

export function planRuntimeProjectionV3Json(text, options = {}) {
  const source = options.source ?? "pipeline.user.v3";
  const validation = validatePipelineUserV3Json(text, {
    source,
    registry: options.registry ?? loadRunnerProfilesV3Registry(),
  });
  if (!validation.ok) return emptyPlan("invalid-intent", source, validation.errors);
  return planRuntimeProjectionV3(JSON.parse(text), options);
}

export function readRuntimeProjectionV3Baselines(rootDir) {
  const baselines = readRuntimeProjectionV2Baselines(rootDir);
  const target = FROZEN_OWNED_KEYS.targets.find((entry) => entry.path === ".claude/pipeline.json");
  if (!target) throw new Error("V3 human-role calibration target is missing");
  const root = resolve(rootDir);
  const path = resolve(root, target.path);
  if (!isPhysicalPathContained(root, path)) throw new Error(`Unsafe owned target path: ${target.path}`);
  baselines[target.path] = existsSync(path)
    ? { status: "present", bytes: readFileSync(path, "utf8") }
    : { status: "absent" };
  return baselines;
}
