// SPDX-License-Identifier: Apache-2.0

/**
 * Deterministic, project-local migration from the two accepted pre-v2 intent
 * shapes to pipeline.user.v2.  Runtime bytes are planned through I2; this
 * module is the sole owner of the source/transaction boundary.
 *
 * The journal makes an interrupted multi-file application recoverable.  It
 * deliberately does not claim cross-file crash atomicity: a later command
 * restores recorded preimages before it reads the source intent again.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  loadRunnerProfilesV2Registry,
  validatePipelineUserV2,
} from "./runner-profiles-v2.mjs";
import {
  loadRuntimeProjectionV2OwnedKeys,
  planRuntimeProjectionV2,
  readRuntimeProjectionV2Baselines,
} from "./runtime-projection-v2.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const SOURCE_FILE = "pipeline.user.yaml";
const TXN_DIR = ".pipeline-runner-profile-migration-v2";
const LOCK_DIR = ".pipeline-runner-profile-migration-v2.lock";
const JOURNAL_FILE = "journal.json";
const JOURNAL_SCHEMA = "pipeline.runner-profile-migration-journal.v2";
const PLAN_SCHEMA = "pipeline.runner-profile-migration-plan.v2";
const INSPECT_SCHEMA = "pipeline.runner-profile-migration-inspect.v2";
// A migration plan is reviewable public data, not an apply capability.  The
// actual staged bytes and their authority stay module-private and are bound to
// the exact object returned by planRunnerProfileMigrationV2.
const AUTHENTICATED_PLANS = new WeakMap();
const V0_MODELS = new Map([
  ["fable-5", { kind: "alias", value: "fable" }],
  ["opus-4.8", { kind: "alias", value: "opus" }],
  ["sonnet-5", { kind: "alias", value: "sonnet" }],
  // Historical Public templates used the native Claude aliases directly.
  // They are exact compatibility spellings, not an open alias namespace.
  ["opus", { kind: "alias", value: "opus" }],
  ["sonnet", { kind: "alias", value: "sonnet" }],
]);
const PROFILE_IDS = ["design", "feature", "mini"];
const PHASE_IDS = ["design_phase", "execution_phase", "advisory"];
const V0_DUTY_MAP = { implement: "implement", mechanic: "mechanic", deep: "deep", review: "critic_normal" };
const V1_DUTY_MAP = {
  implement: "implement",
  mechanic: "mechanic",
  deep: "deep",
  review: "critic_normal",
  codex_design: "design.design_phase",
  codex_independent_critic: "critic_normal",
  codex_implementation: "implement",
  codex_goldfish: "implement",
  codex_mechanic: "mechanic",
  codex_deep: "deep",
};
// Dot-prefixed project paths such as .claude/ are valid; dot and dot-dot
// path components themselves are not.
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function same(left, right) {
  return JSON.stringify(stable(left)) === JSON.stringify(stable(right));
}

function diagnostic(path, code, message, repair) {
  return { path, code, message, repair };
}

function result(status, source, diagnostics = [], extra = {}) {
  return { schema: PLAN_SCHEMA, status, source, diagnostics, requiresExplicitActivation: true, ...extra };
}

function dependencySet(overrides = {}) {
  return {
    closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync,
    realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync,
    process: globalThis.process,
    ...overrides,
  };
}

class IntentionalMigrationInterruption extends Error {
  constructor(target) {
    super(`test interruption after durable rename of ${target}`);
    this.name = "IntentionalMigrationInterruption";
    this.target = target;
  }
}

function safeRoot(rootDir, deps) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("root must be a non-empty path");
  const requested = resolve(rootDir);
  const stat = deps.lstatSync(requested);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("root must be a real project directory");
  return deps.realpathSync(requested);
}

function safeProjectPath(root, projectRelative) {
  if (typeof projectRelative !== "string" || !SAFE_RELATIVE.test(projectRelative) || projectRelative.split("/").includes("..")) {
    throw new Error("unsafe project-relative path");
  }
  const target = resolve(root, projectRelative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("project path escapes selected root");
  return target;
}

/**
 * Reject a link at every existing component from the already-real root through
 * a project-relative target.  All callers repeat this immediately before a
 * read or write; Node's synchronous fs API cannot make that entirely race-free
 * without an fd-relative/O_NOFOLLOW interface, so uncertainty fails closed.
 */
function assertNoSymlinkProjectPath(root, projectRelative, deps) {
  const target = safeProjectPath(root, projectRelative);
  let current = root;
  for (const component of projectRelative.split("/")) {
    current = join(current, component);
    let stat;
    try { stat = deps.lstatSync(current); } catch (error) {
      if (error?.code === "ENOENT") return target;
      throw error;
    }
    if (stat.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${projectRelative}`);
    if (current !== target && !stat.isDirectory()) throw new Error(`project path has a non-directory parent: ${projectRelative}`);
  }
  return target;
}

function declaredRuntimeTargets() {
  const manifest = loadRuntimeProjectionV2OwnedKeys();
  if (!isObject(manifest) || !Array.isArray(manifest.targets) || manifest.targets.length !== 5) {
    throw new Error("frozen I2 owned-key manifest is unavailable or does not declare exactly five runtime targets");
  }
  const paths = manifest.targets.map((target) => target?.path);
  if (paths.some((path) => typeof path !== "string" || !SAFE_RELATIVE.test(path)) || new Set(paths).size !== paths.length) {
    throw new Error("frozen I2 owned-key manifest has unsafe or duplicate runtime targets");
  }
  return paths;
}

function preflightRuntimeBaselines(root, deps) {
  for (const projectRelative of declaredRuntimeTargets()) {
    const target = assertNoSymlinkProjectPath(root, projectRelative, deps);
    if (!deps.existsSync(target)) throw new Error(`declared runtime baseline is missing: ${projectRelative}`);
    const stat = deps.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`declared runtime baseline is not a regular file: ${projectRelative}`);
    if (projectRelative.endsWith(".toml")) validateTomlBaseline(deps.readFileSync(target, "utf8"), projectRelative);
  }
}

/** Detect unsafe unterminated quoted scalars without normalizing unowned TOML. */
function validateTomlBaseline(bytes, projectRelative) {
  for (const rawLine of bytes.split(/\r?\n/u)) {
    let quote = null;
    for (let index = 0; index < rawLine.length; index += 1) {
      const character = rawLine[index];
      if (quote === '"' && character === "\\") {
        index += 1;
        continue;
      }
      if (quote) {
        if (character === quote) quote = null;
        continue;
      }
      if (character === "#") break;
      if (character === '"' || character === "'") quote = character;
    }
    if (quote) throw new Error(`malformed top-level TOML baseline: ${projectRelative}`);
  }
}

function sourcePath(root) {
  return safeProjectPath(root, SOURCE_FILE);
}

function sourceInfo(root, deps) {
  const path = assertNoSymlinkProjectPath(root, SOURCE_FILE, deps);
  const stat = deps.lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("pipeline.user.yaml must be a regular project-local file");
  return { path, bytes: deps.readFileSync(path, "utf8") };
}

function fsyncFile(path, deps) {
  const fd = deps.openSync(path, "r");
  try { deps.fsyncSync(fd); } finally { deps.closeSync(fd); }
}

function fsyncDirectory(path, deps) {
  const fd = deps.openSync(path, "r");
  try { deps.fsyncSync(fd); } finally { deps.closeSync(fd); }
}

function writeDurable(path, bytes, deps) {
  deps.writeFileSync(path, bytes, { encoding: "utf8", mode: 0o600 });
  fsyncFile(path, deps);
}

function removePath(path, deps) {
  if (deps.existsSync(path)) deps.rmSync(path, { recursive: true, force: true });
}

function readJson(path, deps) {
  return JSON.parse(deps.readFileSync(path, "utf8"));
}

function pathDigest(path, deps) {
  if (!deps.existsSync(path)) return { status: "absent", sha256: null, byteLength: 0 };
  const stat = deps.lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("target is not a regular file");
  const bytes = deps.readFileSync(path, "utf8");
  return { status: "present", sha256: sha256(bytes), byteLength: Buffer.byteLength(bytes, "utf8") };
}

function limitedString(value) {
  return typeof value === "string" && value.length > 0 && value.length < 4096;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function directRoute(value, path, expectedRunner, diagnostics, { advisory = false } = {}) {
  if (!isObject(value)) {
    diagnostics.push(diagnostic(path, "invalid_direct_route", "direct route must be one complete object", "restore the accepted v0/v1 direct route shape"));
    return null;
  }
  const required = ["runner", "selector", "effort", "unavailability", "evidenceRequirement"];
  const actualKeys = Object.keys(value).sort();
  if (!same(actualKeys, [...required].sort())) {
    diagnostics.push(diagnostic(path, "invalid_direct_route", "direct route has an unsupported or missing field", "use exactly runner, selector, effort, unavailability, evidenceRequirement"));
    return null;
  }
  if (value.runner !== expectedRunner || !isObject(value.selector) || !same(Object.keys(value.selector).sort(), ["kind", "value"])) {
    diagnostics.push(diagnostic(path, "invalid_direct_route", "direct route has a wrong runner or malformed selector", "restore the accepted direct route mapping"));
    return null;
  }
  const allowedSelectors = expectedRunner === "claude"
    ? [["alias", "fable"], ["alias", "opus"], ["alias", "sonnet"]]
    : [["model-id", "gpt-5.6-sol"], ["model-id", "gpt-5.6-terra"], ["alias", "terra"]];
  if (!allowedSelectors.some(([kind, selector]) => value.selector.kind === kind && value.selector.value === selector)) {
    diagnostics.push(diagnostic(`${path}.selector`, "unknown_selector", "direct route selector is not registered", "use a supported requested selector"));
    return null;
  }
  const allowedEfforts = expectedRunner === "claude"
    ? (advisory ? ["not-applicable"] : ["low", "medium", "high", "xhigh", "max"])
    : ["xhigh", "max"];
  if (!allowedEfforts.includes(value.effort) || value.unavailability !== "defer" || value.evidenceRequirement !== "dispatch-receipt") {
    diagnostics.push(diagnostic(path, "invalid_direct_route", "direct route effort, unavailability, or evidence requirement is unsupported", "restore a registered direct route"));
    return null;
  }
  return { selector: clone(value.selector), effort: value.effort };
}

function v2CellFromDirect(value, path, runner, diagnostics, options = {}) {
  if (value === "off") return { state: "off", unavailable: "defer", reasonCode: "profile-disabled" };
  const route = directRoute(value, path, runner, diagnostics, options);
  if (!route) return null;
  return { state: options.state ?? "default", ...route, unavailable: "defer", evidence: "dispatch-receipt" };
}

function checkClosedKeys(value, allowed, path, diagnostics) {
  if (!isObject(value)) {
    diagnostics.push(diagnostic(path, "invalid_object", "expected an object", "restore the accepted source shape"));
    return false;
  }
  const extra = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = allowed.filter((key) => !Object.hasOwn(value, key));
  if (extra.length || missing.length) {
    diagnostics.push(diagnostic(path, "unknown_or_missing_owner", "source has an unknown or missing semantic owner", "restore exactly the accepted source owners"));
    return false;
  }
  return true;
}

function registryIntent() {
  const registry = loadRunnerProfilesV2Registry();
  return {
    schema: "pipeline.user.v2",
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
  };
}

function copyCompatibility(source, intent, diagnostics) {
  const required = ["language", "agent_runtime", "autonomy", "gates"];
  for (const key of required) {
    if (!Object.hasOwn(source, key)) diagnostics.push(diagnostic(`$.${key}`, "missing_compatibility_value", "required compatibility value is absent", "restore the accepted source field"));
    else intent[key] = clone(source[key]);
  }
  for (const key of ["setup", "identity", "platform", "release"]) {
    if (Object.hasOwn(source, key)) intent[key] = clone(source[key]);
  }
  intent.runners = { enabled: ["claude", "codex"], default: "claude" };
  intent.usage = { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" };
}

function routeDescriptor(cell) {
  return cell?.selector && cell?.effort ? { selector: clone(cell.selector), effort: cell.effort } : null;
}

function collectCompatibilityDelta(deltas, path, oldRoute, newCell) {
  const next = routeDescriptor(newCell);
  if (!oldRoute || !next || same(oldRoute, next)) return;
  deltas.push({
    name: "po-approved-runner-routing-amendment",
    path,
    oldRequested: oldRoute,
    newRequested: next,
    effectiveModel: { status: "unknown", reasonCode: "effective-model-not-observed" },
  });
}

/**
 * The frozen registry remains the complete multi-runner capability matrix.
 * A legacy Claude source nevertheless owns its requested Claude selector and
 * effort.  Keep those runner-native facts in their original v2 Claude cell;
 * the paired Codex cell stays the frozen registry declaration.
 */
function preserveLegacyClaudeRoute(oldRoute, newCell, path, diagnostics) {
  if (!oldRoute) return;
  if (!routeDescriptor(newCell)) {
    diagnostics.push(diagnostic(
      path,
      "conflicting_legacy_route",
      "legacy Claude route targets a frozen v2 cell without an approved Claude route",
      "restore an accepted legacy route for this Claude cell or obtain a separate PO capability decision",
    ));
    return;
  }
  newCell.selector = clone(oldRoute.selector);
  newCell.effort = oldRoute.effort;
}

/**
 * A valid direct Codex v1 route is historical source intent, not a second v2
 * mapping authority.  The v2 result always keeps the frozen same-runner cell;
 * when its requested route changed, the public plan records that reconciliation
 * as a compatibility delta.  `directRoute` still rejects malformed, unknown,
 * wrong-runner, and unsupported-effort sources before this point.
 */
function reconcileLegacyCodexRoute(oldRoute, newCell, path, deltas) {
  if (!oldRoute) return;
  collectCompatibilityDelta(deltas, path, oldRoute, newCell);
}

function classifyV2(source, diagnostics) {
  const validation = validatePipelineUserV2(source, { source: SOURCE_FILE });
  if (!validation.ok) diagnostics.push(...validation.errors);
  return validation.ok ? { kind: "v2", intent: clone(source), compatibilityDeltas: [] } : null;
}

function classifyV1(source, diagnostics) {
  const allowedTop = ["schema", "setup", "identity", "platform", "release", "language", "agent_runtime", "routing", "autonomy", "gates"];
  const extra = Object.keys(source).filter((key) => !allowedTop.includes(key));
  if (extra.length || source.schema !== "pipeline.user.v1" || !isObject(source.routing)) {
    diagnostics.push(diagnostic("$", "invalid_v1_source", "source is not the accepted closed pipeline.user.v1 shape", "use the accepted v1 source or migrate from an exact v0 source"));
    return null;
  }
  if (!checkClosedKeys(source.routing, ["worktypes", "duties"], "$.routing", diagnostics)) return null;
  const intent = registryIntent();
  copyCompatibility(source, intent, diagnostics);
  const deltas = [];
  const worktypes = source.routing.worktypes;
  if (!checkClosedKeys(worktypes, PROFILE_IDS, "$.routing.worktypes", diagnostics)) return null;
  for (const profileId of PROFILE_IDS) {
    const phases = worktypes[profileId];
    if (!checkClosedKeys(phases, ["design_phase", "execution_phase", "advisor"], `$.routing.worktypes.${profileId}`, diagnostics)) continue;
    for (const phaseId of ["design_phase", "execution_phase"]) {
      const oldRoute = directRoute(phases[phaseId], `$.routing.worktypes.${profileId}.${phaseId}`, "claude", diagnostics);
      const newCell = intent.routing.profiles[profileId][phaseId].claude;
      preserveLegacyClaudeRoute(oldRoute, newCell, `$.routing.worktypes.${profileId}.${phaseId}`, diagnostics);
      collectCompatibilityDelta(deltas, `routing.profiles.${profileId}.${phaseId}.claude`, oldRoute, newCell);
    }
    const oldAdvisor = v2CellFromDirect(phases.advisor, `$.routing.worktypes.${profileId}.advisor`, "claude", diagnostics, { advisory: true });
    const newAdvisor = intent.routing.profiles[profileId].advisory.claude;
    const oldAdvisorRoute = routeDescriptor(oldAdvisor);
    preserveLegacyClaudeRoute(oldAdvisorRoute, newAdvisor, `$.routing.worktypes.${profileId}.advisor`, diagnostics);
    collectCompatibilityDelta(deltas, `routing.profiles.${profileId}.advisory.claude`, oldAdvisorRoute, newAdvisor);
  }
  const directDuties = source.routing.duties;
  if (!isObject(directDuties)) {
    diagnostics.push(diagnostic("$.routing.duties", "invalid_v1_source", "v1 duties must be a closed object", "restore accepted v1 duties"));
    return null;
  }
  const expectedDuties = Object.keys(V1_DUTY_MAP);
  if (!checkClosedKeys(directDuties, expectedDuties, "$.routing.duties", diagnostics)) return null;
  const seenTargets = new Map();
  for (const [legacyDuty, target] of Object.entries(V1_DUTY_MAP)) {
    const expectedRunner = legacyDuty.startsWith("codex_") ? "codex" : "claude";
    const oldRoute = directRoute(directDuties[legacyDuty], `$.routing.duties.${legacyDuty}`, expectedRunner, diagnostics);
    if (seenTargets.has(`${expectedRunner}:${target}`) && legacyDuty !== "codex_goldfish") {
      diagnostics.push(diagnostic(`$.routing.duties.${legacyDuty}`, "duplicate_semantic_owner", "two direct v1 duties own the same v2 cell", "restore the accepted direct duty mapping"));
      continue;
    }
    if (legacyDuty === "codex_goldfish") {
      const implementation = directRoute(directDuties.codex_implementation, "$.routing.duties.codex_implementation", "codex", diagnostics);
      if (!same(oldRoute, implementation)) {
        diagnostics.push(diagnostic("$.routing.duties.codex_goldfish", "duplicate_semantic_owner", "codex_implementation and codex_goldfish must be identical before collapsing", "make both direct routes byte-for-byte semantically equal"));
      }
    }
    seenTargets.set(`${expectedRunner}:${target}`, legacyDuty);
    const [profileId, phaseId] = target.split(".");
    const next = phaseId
      ? intent.routing.profiles[profileId][phaseId][expectedRunner]
      : intent.routing.duties[target][expectedRunner];
    const deltaPath = `routing.${phaseId ? `profiles.${profileId}.${phaseId}` : `duties.${target}`}.${expectedRunner}`;
    if (expectedRunner === "claude") {
      preserveLegacyClaudeRoute(oldRoute, next, `$.routing.duties.${legacyDuty}`, diagnostics);
      collectCompatibilityDelta(deltas, deltaPath, oldRoute, next);
    } else {
      reconcileLegacyCodexRoute(oldRoute, next, deltaPath, deltas);
    }
  }
  return diagnostics.length === 0 ? { kind: "v1", intent, compatibilityDeltas: deltas } : null;
}

function legacyV0Route(value, path, diagnostics, { advisory = false } = {}) {
  if (!isObject(value) || !same(Object.keys(value).sort(), ["effort", "model"])) {
    diagnostics.push(diagnostic(path, "invalid_v0_route", "legacy route must contain only model and effort", "restore the exact v0 route shape"));
    return null;
  }
  const selector = V0_MODELS.get(value.model);
  const allowedEfforts = advisory ? ["not-applicable"] : ["low", "medium", "high", "xhigh", "max"];
  if (!selector || !allowedEfforts.includes(value.effort)) {
    diagnostics.push(diagnostic(path, "unknown_legacy_route", "legacy model or effort is not a supported v0 value", "use fable-5, opus-4.8, sonnet-5, opus, or sonnet with a registered effort"));
    return null;
  }
  return { selector: clone(selector), effort: value.effort };
}

function classifyV0(source, diagnostics) {
  const allowedTop = ["setup", "identity", "platform", "release", "language", "agent_runtime", "worktypes", "models", "autonomy", "gates"];
  if (Object.hasOwn(source, "schema") || Object.hasOwn(source, "routing") || !Object.hasOwn(source, "worktypes") || !Object.hasOwn(source, "models") || Object.keys(source).some((key) => !allowedTop.includes(key))) {
    diagnostics.push(diagnostic("$", "invalid_v0_signature", "schema-less source must have exactly the accepted v0 worktypes/models signature", "remove ambiguous schema/routing keys and restore closed v0 owners"));
    return null;
  }
  const intent = registryIntent();
  copyCompatibility(source, intent, diagnostics);
  const deltas = [];
  if (!checkClosedKeys(source.worktypes, PROFILE_IDS, "$.worktypes", diagnostics)) return null;
  for (const profileId of PROFILE_IDS) {
    const phases = source.worktypes[profileId];
    if (!checkClosedKeys(phases, ["design_phase", "execution_phase", "advisor"], `$.worktypes.${profileId}`, diagnostics)) continue;
    for (const phaseId of ["design_phase", "execution_phase"]) {
      const oldRoute = legacyV0Route(phases[phaseId], `$.worktypes.${profileId}.${phaseId}`, diagnostics);
      const newCell = intent.routing.profiles[profileId][phaseId].claude;
      preserveLegacyClaudeRoute(oldRoute, newCell, `$.worktypes.${profileId}.${phaseId}`, diagnostics);
      collectCompatibilityDelta(deltas, `routing.profiles.${profileId}.${phaseId}.claude`, oldRoute, newCell);
    }
    let oldAdvisor = null;
    if (phases.advisor === "off") oldAdvisor = null;
    else if (typeof phases.advisor === "string" && V0_MODELS.has(phases.advisor)) oldAdvisor = { selector: clone(V0_MODELS.get(phases.advisor)), effort: "not-applicable" };
    else diagnostics.push(diagnostic(`$.worktypes.${profileId}.advisor`, "invalid_v0_advisor", "legacy advisor must be off or a supported legacy model", "use off, fable-5, opus-4.8, sonnet-5, opus, or sonnet"));
    const newAdvisor = intent.routing.profiles[profileId].advisory.claude;
    preserveLegacyClaudeRoute(oldAdvisor, newAdvisor, `$.worktypes.${profileId}.advisor`, diagnostics);
    collectCompatibilityDelta(deltas, `routing.profiles.${profileId}.advisory.claude`, oldAdvisor, newAdvisor);
  }
  if (!checkClosedKeys(source.models, Object.keys(V0_DUTY_MAP), "$.models", diagnostics)) return null;
  for (const [legacyDuty, dutyId] of Object.entries(V0_DUTY_MAP)) {
    const oldRoute = legacyV0Route(source.models[legacyDuty], `$.models.${legacyDuty}`, diagnostics);
    const newCell = intent.routing.duties[dutyId].claude;
    preserveLegacyClaudeRoute(oldRoute, newCell, `$.models.${legacyDuty}`, diagnostics);
    collectCompatibilityDelta(deltas, `routing.duties.${dutyId}.claude`, oldRoute, newCell);
  }
  return diagnostics.length === 0 ? { kind: "v0", intent, compatibilityDeltas: deltas } : null;
}

/** Parse and classify source without inspecting any runtime projection file. */
export function inspectRunnerProfileMigrationV2({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const deps = dependencySet(overrides);
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "invalid-root", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")] };
  }
  let recovery;
  try { recovery = recoverPendingTransaction(root, deps); } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "recovery-required", root, diagnostics: [diagnostic("$.transaction", "recovery_failed", error.message, "repair the journal/preimage manually before retrying")] };
  }
  try {
    const source = sourceInfo(root, deps);
    let parsed;
    try { parsed = parseYaml(source.bytes); } catch (error) {
      return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics: [diagnostic("$", "yaml_parse", "pipeline.user.yaml is not valid yaml-lite input", "repair the project-local source YAML")] };
    }
    if (!isObject(parsed)) return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics: [diagnostic("$", "invalid_source", "source root must be an object", "restore one accepted source shape")] };
    const diagnostics = [];
    const classified = parsed.schema === "pipeline.user.v2"
      ? classifyV2(parsed, diagnostics)
      : parsed.schema === "pipeline.user.v1"
        ? classifyV1(parsed, diagnostics)
        : classifyV0(parsed, diagnostics);
    if (!classified) return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics };
    return {
      schema: INSPECT_SCHEMA,
      status: "ready",
      root,
      source: SOURCE_FILE,
      sourceSha256: sha256(source.bytes),
      sourceKind: classified.kind,
      recovery: recovery.status,
      compatibilityDeltas: classified.compatibilityDeltas,
      diagnostics: [],
    };
  } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics: [diagnostic("$", "source_unreadable", error.message, "supply a readable regular project-local pipeline.user.yaml")] };
  }
}

function classifySource(root, deps) {
  const source = sourceInfo(root, deps);
  const parsed = parseYaml(source.bytes);
  if (!isObject(parsed)) return { source, diagnostics: [diagnostic("$", "invalid_source", "source root must be an object", "restore one accepted source shape")] };
  const diagnostics = [];
  const classified = parsed.schema === "pipeline.user.v2"
    ? classifyV2(parsed, diagnostics)
    : parsed.schema === "pipeline.user.v1"
      ? classifyV1(parsed, diagnostics)
      : classifyV0(parsed, diagnostics);
  return { source, classified, diagnostics };
}

function quoteYaml(value) {
  return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
}

function renderYaml(value, indent = "") {
  if (Array.isArray(value)) {
    return value.map((item) => {
      if (isObject(item) || Array.isArray(item)) return `${indent}-\n${renderYaml(item, `${indent}  `)}`;
      return `${indent}- ${renderScalar(item)}\n`;
    }).join("");
  }
  return Object.keys(value).sort().map((key) => {
    const renderedKey = /^[A-Za-z][A-Za-z0-9_-]*$/u.test(key) ? key : quoteYaml(key);
    const item = value[key];
    if (isObject(item) || Array.isArray(item)) return `${indent}${renderedKey}:\n${renderYaml(item, `${indent}  `)}`;
    return `${indent}${renderedKey}: ${renderScalar(item)}\n`;
  }).join("");
}

function renderScalar(value) {
  if (typeof value === "string") return quoteYaml(value);
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("compatibility value contains an unsupported YAML scalar");
}

function publicTarget(path, before, after, kind) {
  return {
    path,
    kind,
    before,
    after,
    changed: before.sha256 !== after.sha256,
  };
}

function publicPlanSignature(value) {
  const ancestors = new WeakSet();
  function encode(item) {
    if (item === null) return ["null"];
    if (["string", "boolean", "number", "undefined"].includes(typeof item)) return [typeof item, item];
    if (typeof item !== "object" || ancestors.has(item)) throw new Error("plan public data is not acyclic plain data");
    const prototype = Object.getPrototypeOf(item);
    if (prototype !== Object.prototype && prototype !== Array.prototype) throw new Error("plan public data has an unsupported prototype");
    if (Object.getOwnPropertySymbols(item).length > 0) throw new Error("plan public data has unsupported symbol properties");
    ancestors.add(item);
    const properties = Object.getOwnPropertyNames(item).sort().map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(item, key);
      if (!descriptor || !("value" in descriptor)) throw new Error("plan public data has an accessor property");
      return [key, descriptor.enumerable, descriptor.configurable, descriptor.writable, encode(descriptor.value)];
    });
    ancestors.delete(item);
    return [Array.isArray(item) ? "array" : "object", properties];
  }
  return JSON.stringify(encode(value));
}

function makeInternalPlan(publicPlan, targets) {
  AUTHENTICATED_PLANS.set(publicPlan, {
    changes: clone(publicPlan.changes),
    publicSignature: publicPlanSignature(publicPlan),
    root: publicPlan.root,
    sourceSha256: publicPlan.sourceSha256,
    status: publicPlan.status,
    targets: clone(targets),
  });
  return publicPlan;
}

function authenticatedPlanState(plan) {
  if (plan === null || (typeof plan !== "object" && typeof plan !== "function")) return null;
  const state = AUTHENTICATED_PLANS.get(plan);
  if (!state) return null;
  try {
    return publicPlanSignature(plan) === state.publicSignature ? state : null;
  } catch {
    return null;
  }
}

function assertExactMigrationTargets(root, targets, deps) {
  // Re-read the frozen I2 manifest immediately before staging, not only while
  // planning.  A trusted in-memory plan may name exactly those runtime paths
  // plus the source, with the source always committed last.
  if (safeRoot(root, deps) !== root) throw new Error("migration root no longer resolves to the authenticated project root");
  const runtimePaths = declaredRuntimeTargets().sort((left, right) => left.localeCompare(right));
  if (!Array.isArray(targets) || targets.length !== runtimePaths.length + 1) {
    throw new Error("authenticated plan does not name exactly the frozen migration targets");
  }
  for (const [index, path] of runtimePaths.entries()) {
    const target = targets[index];
    if (!isObject(target) || target.kind !== "runtime" || target.path !== path || typeof target.bytes !== "string") {
      throw new Error("authenticated plan runtime targets differ from the frozen I2 ownership boundary");
    }
  }
  const source = targets.at(-1);
  if (!isObject(source) || source.kind !== "source" || source.path !== SOURCE_FILE || typeof source.bytes !== "string") {
    throw new Error("authenticated plan does not commit pipeline.user.yaml last");
  }
}

/**
 * Produce a deterministic, read-only plan.  Recovery is performed before any
 * source parse or baseline read.  The returned JSON has digests only; staged
 * bytes are non-enumerable implementation state for an in-process apply.
 */
export function planRunnerProfileMigrationV2({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const deps = dependencySet(overrides);
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) {
    return result("invalid-root", SOURCE_FILE, [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")], { targets: [], changes: [] });
  }
  try { recoverPendingTransaction(root, deps); } catch (error) {
    return result("recovery-required", SOURCE_FILE, [diagnostic("$.transaction", "recovery_failed", error.message, "repair journal/preimages manually before retrying")], { root, targets: [], changes: [] });
  }
  let classified;
  let source;
  let sourceDiagnostics;
  try {
    ({ source, classified, diagnostics: sourceDiagnostics } = classifySource(root, deps));
  } catch (error) {
    return result("invalid-source", SOURCE_FILE, [diagnostic("$", "source_parse", "pipeline.user.yaml is unreadable or invalid YAML", "repair the project-local source YAML")], { root, targets: [], changes: [] });
  }
  if (!classified) {
    return result("invalid-source", SOURCE_FILE, sourceDiagnostics, { root, targets: [], changes: [] });
  }
  const validation = validatePipelineUserV2(classified.intent, { source: SOURCE_FILE });
  if (!validation.ok) {
    return result("invalid-intent", SOURCE_FILE, validation.errors, { root, sourceKind: classified.kind, targets: [], changes: [], compatibilityDeltas: classified.compatibilityDeltas });
  }
  let projection;
  try {
    // I2 is intentionally invoked only after complete v2 validation.
    // Preflight all declared paths first so I2 can never follow a project
    // symlink while reading a baseline.
    preflightRuntimeBaselines(root, deps);
    projection = planRuntimeProjectionV2(classified.intent, {
      source: SOURCE_FILE,
      baselines: readRuntimeProjectionV2Baselines(root),
    });
  } catch (error) {
    return result("invalid-baseline", SOURCE_FILE, [diagnostic("$.runtime", "baseline_read", error.message, "repair project-local declared runtime targets")], { root, sourceKind: classified.kind, targets: [], changes: [] });
  }
  if (projection.status !== "ready") {
    return result(projection.status, SOURCE_FILE, projection.diagnostics, {
      root, sourceKind: classified.kind, targets: [], changes: [], compatibilityDeltas: classified.compatibilityDeltas,
      decisionConflicts: projection.decisionConflicts,
    });
  }
  let renderedSource;
  try { renderedSource = classified.kind === "v2" ? source.bytes : renderYaml(classified.intent); } catch (error) {
    return result("invalid-intent", SOURCE_FILE, [diagnostic("$", "render", error.message, "use yaml-lite-compatible compatibility values")], { root, sourceKind: classified.kind, targets: [], changes: [] });
  }
  const sourceBefore = { status: "present", sha256: sha256(source.bytes), byteLength: Buffer.byteLength(source.bytes, "utf8") };
  const sourceAfter = { status: "present", sha256: sha256(renderedSource), byteLength: Buffer.byteLength(renderedSource, "utf8") };
  const internalTargets = projection.targets.map((target) => ({
    path: target.path,
    bytes: target.after.bytes,
    before: target.before,
    after: { status: target.after.status, sha256: target.after.sha256, byteLength: target.after.byteLength },
    kind: "runtime",
  })).sort((left, right) => left.path.localeCompare(right.path));
  internalTargets.push({ path: SOURCE_FILE, bytes: renderedSource, before: sourceBefore, after: sourceAfter, kind: "source" });
  const targets = internalTargets.map((target) => publicTarget(target.path, target.before, target.after, target.kind));
  const changes = targets.filter((target) => target.changed);
  const status = changes.length === 0 ? "noop" : "ready";
  return makeInternalPlan(result(status, SOURCE_FILE, [], {
    root,
    sourceKind: classified.kind,
    sourceSha256: sha256(source.bytes),
    intentSha256: sha256(JSON.stringify(stable(classified.intent))),
    compatibilityDeltas: classified.compatibilityDeltas,
    decisionConflicts: projection.decisionConflicts,
    targets,
    changes,
    activation: { required: true, command: "apply --activate", sourceCommittedLast: true },
  }), internalTargets);
}

function journalPaths(root) {
  const transaction = safeProjectPath(root, TXN_DIR);
  return { transaction, journal: join(transaction, JOURNAL_FILE), lock: safeProjectPath(root, LOCK_DIR) };
}

function assertTransactionPaths(root, deps, { lock = false } = {}) {
  assertNoSymlinkProjectPath(root, TXN_DIR, deps);
  if (lock) assertNoSymlinkProjectPath(root, LOCK_DIR, deps);
}

function processIsDead(pid, deps) {
  if (!Number.isInteger(pid) || pid <= 1) return false;
  try { deps.process.kill(pid, 0); return false; } catch (error) { return error?.code === "ESRCH"; }
}

function acquireLock(root, deps) {
  assertTransactionPaths(root, deps, { lock: true });
  const { lock } = journalPaths(root);
  try {
    deps.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const ownerPath = join(lock, "owner.json");
    let owner;
    try { owner = readJson(ownerPath, deps); } catch { throw new Error("migration lock is held without a valid recorded owner"); }
    if (!isObject(owner) || !processIsDead(owner.pid, deps)) throw new Error("migration lock is held by a live or unverifiable owner");
    // A dead, recorded owner is reclaimable only for crash recovery/continuation.
    removePath(lock, deps);
    deps.mkdirSync(lock, { mode: 0o700 });
  }
  assertNoSymlinkProjectPath(root, LOCK_DIR, deps);
  writeDurable(join(lock, "owner.json"), `${JSON.stringify({ pid: deps.process.pid, schema: JOURNAL_SCHEMA })}\n`, deps);
  fsyncDirectory(lock, deps);
  return lock;
}

function releaseLock(root, lock, deps) {
  assertNoSymlinkProjectPath(root, LOCK_DIR, deps);
  removePath(lock, deps);
}

/**
 * A read-only caller must not create a lock merely to discover that there is
 * nothing to recover.  An existing lock is still authoritative: parsing while
 * an apply may be between its source recheck and first durable journal would
 * race that apply, so fail closed without trying to reclaim it here.
 */
function assertNoExistingRecoveryLock(root, deps) {
  assertTransactionPaths(root, deps, { lock: true });
  const { lock } = journalPaths(root);
  if (!deps.existsSync(lock)) return;
  const stat = deps.lstatSync(lock);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("migration lock is not a real directory");
  let owner;
  try { owner = readJson(join(lock, "owner.json"), deps); } catch { throw new Error("migration lock is held without a valid recorded owner"); }
  if (!isObject(owner) || !processIsDead(owner.pid, deps)) throw new Error("migration lock is held by a live or unverifiable owner");
  throw new Error("migration lock is held by a dead owner without a recovery journal");
}

function journalTarget(root, entry, label) {
  if (!isObject(entry) || !SAFE_RELATIVE.test(entry.path) || !["runtime", "source"].includes(entry.kind)) throw new Error(`${label} has unsafe target entry`);
  const target = safeProjectPath(root, entry.path);
  if (!isObject(entry.before) || !["present", "absent"].includes(entry.before.status) || !isObject(entry.staged) || !["present", "absent"].includes(entry.staged.status) || !["staged", "renamed"].includes(entry.state)) throw new Error(`${label} has incomplete target proof`);
  if (entry.before.status === "present" && !/^[a-f0-9]{64}$/u.test(entry.before.sha256)) throw new Error(`${label} has invalid preimage digest`);
  if (entry.before.status === "absent" && entry.before.sha256 !== null) throw new Error(`${label} has invalid absent marker`);
  if (entry.staged.status === "present" && !/^[a-f0-9]{64}$/u.test(entry.staged.sha256)) throw new Error(`${label} has invalid staged digest`);
  if (entry.staged.status === "absent" && entry.staged.sha256 !== null) throw new Error(`${label} has invalid staged absent marker`);
  if (entry.before.status === "present" && (!SAFE_RELATIVE.test(entry.before.backup) || entry.before.backup.includes("/"))) throw new Error(`${label} has unsafe preimage path`);
  if (!SAFE_RELATIVE.test(entry.staged.file) || entry.staged.file.includes("/")) throw new Error(`${label} has unsafe staged path`);
  return target;
}

function matchesRecordedImage(actual, image) {
  return actual.status === image.status
    && actual.sha256 === image.sha256
    && actual.byteLength === image.byteLength;
}

function validateJournal(root, journal, deps) {
  assertTransactionPaths(root, deps);
  if (!isObject(journal) || journal.schema !== JOURNAL_SCHEMA || !["prepared", "applying", "rolling-back", "rolled-back", "complete"].includes(journal.state) || !Array.isArray(journal.targets) || journal.targets.length === 0) {
    throw new Error("transaction journal is corrupt or unsupported");
  }
  // The journal is untrusted crash-recovery input.  It may name only the
  // committed I2 ownership boundary, never merely a path that happens to be
  // syntactically project-relative.  This check occurs before recovery can
  // write even one recorded preimage back to a target.
  const expectedRuntimePaths = new Set(declaredRuntimeTargets());
  const paths = new Set();
  for (const [index, entry] of journal.targets.entries()) {
    journalTarget(root, entry, `journal target ${index}`);
    if (entry.kind === "runtime" && !expectedRuntimePaths.has(entry.path)) {
      throw new Error(`journal target ${index} is outside the frozen I2 runtime ownership boundary`);
    }
    assertNoSymlinkProjectPath(root, entry.path, deps);
    if (paths.has(entry.path)) throw new Error("transaction journal duplicates a target");
    paths.add(entry.path);
  }
  if (journal.targets.at(-1).path !== SOURCE_FILE || journal.targets.at(-1).kind !== "source") throw new Error("transaction journal does not commit source last");
  if (journal.targets.slice(0, -1).some((entry) => entry.kind !== "runtime")) throw new Error("transaction journal has unsafe target order");
  if (journal.targets.length !== expectedRuntimePaths.size + 1
    || journal.targets.slice(0, -1).some((entry) => !expectedRuntimePaths.has(entry.path))) {
    throw new Error("transaction journal does not name exactly the frozen I2 runtime targets");
  }
  const { transaction } = journalPaths(root);
  for (const entry of journal.targets) {
    const target = safeProjectPath(root, entry.path);
    const stage = join(transaction, entry.staged.file);
    const targetDigest = pathDigest(target, deps);
    const rollingBack = journal.state === "rolling-back" || journal.state === "rolled-back";
    if (entry.staged.status === "absent") {
      if (deps.existsSync(stage)) throw new Error("transaction absent output has an unexpected staged file");
      if (journal.state === "rolled-back" && !matchesRecordedImage(targetDigest, entry.before)) {
        throw new Error("rolled-back transaction target does not match its preimage");
      }
      if (!rollingBack && entry.state === "renamed" && targetDigest.status !== "absent") {
        throw new Error("transaction absent output was not applied");
      }
    } else if (deps.existsSync(stage)) {
      if (sha256(deps.readFileSync(stage, "utf8")) !== entry.staged.sha256) throw new Error("transaction staged proof is corrupt");
      if (journal.state === "rolled-back" && !matchesRecordedImage(targetDigest, entry.before)) {
        throw new Error("rolled-back transaction target does not match its preimage");
      }
    } else {
      // A rename may have completed just before a process/durability error and
      // before the per-entry journal advance.  The target's staged digest is
      // sufficient proof to recover from its independently validated preimage.
      // During a durable rollback, an earlier entry can already equal its
      // preimage; that remains recoverable because the preimage is still
      // verified below.  Once marked rolled-back, every target must be there.
      const matchesStaged = targetDigest.status === "present" && targetDigest.sha256 === entry.staged.sha256;
      const matchesPreimage = matchesRecordedImage(targetDigest, entry.before);
      if (journal.state === "rolled-back" ? !matchesPreimage : !matchesStaged && !(rollingBack && matchesPreimage)) {
        throw new Error("transaction staged proof is missing without a matching renamed target");
      }
    }
    if (entry.before.status === "present") {
      const backup = join(transaction, entry.before.backup);
      if (!deps.existsSync(backup) || sha256(deps.readFileSync(backup, "utf8")) !== entry.before.sha256) throw new Error("transaction preimage proof is missing or corrupt");
    }
  }
}

function durableJournal(root, journal, deps) {
  assertTransactionPaths(root, deps);
  const { journal: journalPath, transaction } = journalPaths(root);
  writeDurable(journalPath, `${JSON.stringify(journal)}\n`, deps);
  fsyncDirectory(transaction, deps);
}

function restorePreimage(root, entry, deps) {
  assertTransactionPaths(root, deps);
  const { transaction } = journalPaths(root);
  const target = assertNoSymlinkProjectPath(root, entry.path, deps);
  if (entry.before.status === "absent") {
    if (deps.existsSync(target)) deps.unlinkSync(target);
    fsyncDirectory(dirname(target), deps);
    if (deps.existsSync(target)) throw new Error("absent preimage could not be restored");
    return;
  }
  const backup = join(transaction, entry.before.backup);
  const temp = join(transaction, `restore-${sha256(entry.path).slice(0, 16)}.tmp`);
  writeDurable(temp, deps.readFileSync(backup, "utf8"), deps);
  deps.renameSync(temp, target);
  fsyncDirectory(dirname(target), deps);
  const restored = pathDigest(target, deps);
  if (restored.sha256 !== entry.before.sha256) throw new Error("restored preimage digest does not match journal");
}

function assertAllPreimagesRestored(root, entries, deps) {
  for (const entry of entries) {
    const target = assertNoSymlinkProjectPath(root, entry.path, deps);
    if (!matchesRecordedImage(pathDigest(target, deps), entry.before)) {
      throw new Error(`target does not match its recorded preimage: ${entry.path}`);
    }
  }
}

function cleanupTransaction(root, deps) {
  assertTransactionPaths(root, deps);
  const { transaction } = journalPaths(root);
  removePath(transaction, deps);
  fsyncDirectory(root, deps);
}

/**
 * Keep the proof durable through every target restoration.  A crash before
 * `rolled-back` is recorded leaves a `rolling-back` journal whose preimages
 * can be applied again; a crash after it is recorded permits cleanup only
 * after validation proves every target is already back at its preimage.
 */
function rollbackTransaction(root, record, deps) {
  record.state = "rolling-back";
  durableJournal(root, record, deps);
  for (const entry of record.targets) restorePreimage(root, entry, deps);
  assertAllPreimagesRestored(root, record.targets, deps);
  record.state = "rolled-back";
  durableJournal(root, record, deps);
  cleanupTransaction(root, deps);
}

function recoverWithHeldLock(root, deps) {
  assertTransactionPaths(root, deps, { lock: true });
  const { journal: journalPath } = journalPaths(root);
  if (!deps.existsSync(journalPath)) return { status: "none" };
  let journal;
  try { journal = readJson(journalPath, deps); } catch { throw new Error("transaction journal cannot be parsed"); }
  validateJournal(root, journal, deps);
  if (journal.state === "complete") {
    cleanupTransaction(root, deps);
    return { status: "completed-cleanup" };
  }
  if (journal.state === "rolled-back") {
    // validateJournal already proved all targets match their preimages; no
    // target write is needed after a crash between durable rollback and
    // transaction-directory cleanup.
    cleanupTransaction(root, deps);
    return { status: "rolled-back-cleanup" };
  }
  // validateJournal proves every preimage before this first target write.
  rollbackTransaction(root, journal, deps);
  return { status: "recovered" };
}

/** Recover an incomplete transaction before reading source or runtime intent. */
export function recoverPendingTransaction(rootDir, overrides = {}) {
  const deps = dependencySet(overrides);
  const root = safeRoot(rootDir, deps);
  assertTransactionPaths(root, deps, { lock: true });
  const { transaction, journal: journalPath } = journalPaths(root);
  if (!deps.existsSync(journalPath)) {
    // Inspect/plan callers must be side-effect-free in the normal case.
    // A staged directory without its durable proof cannot safely be removed.
    assertNoExistingRecoveryLock(root, deps);
    if (deps.existsSync(transaction)) throw new Error("transaction directory exists without a recoverable journal");
    return { status: "none" };
  }
  const lockPath = acquireLock(root, deps);
  try {
    return recoverWithHeldLock(root, deps);
  } finally {
    releaseLock(root, lockPath, deps);
  }
}

function prepareTransaction(root, targets, deps) {
  assertTransactionPaths(root, deps, { lock: true });
  const { transaction, journal } = journalPaths(root);
  if (deps.existsSync(transaction)) throw new Error("transaction directory already exists without a recoverable journal");
  try {
    deps.mkdirSync(transaction, { mode: 0o700 });
    fsyncDirectory(root, deps);
    const entries = [];
    for (const [index, target] of targets.entries()) {
      const targetPath = assertNoSymlinkProjectPath(root, target.path, deps);
      const actual = pathDigest(targetPath, deps);
      if (!same(actual, target.before)) throw new Error(`target changed since planning: ${target.path}`);
      const stageFile = `stage-${String(index).padStart(3, "0")}`;
      const stagedPath = join(transaction, stageFile);
      const staged = target.after.status === "absent"
        ? { status: "absent", file: stageFile, sha256: null, byteLength: 0 }
        : { status: "present", file: stageFile, sha256: sha256(target.bytes), byteLength: Buffer.byteLength(target.bytes, "utf8") };
      if (staged.status === "present") writeDurable(stagedPath, target.bytes, deps);
      const before = actual.status === "present"
        ? { ...actual, backup: `preimage-${String(index).padStart(3, "0")}` }
        : { status: "absent", sha256: null, byteLength: 0 };
      if (before.status === "present") writeDurable(join(transaction, before.backup), deps.readFileSync(targetPath, "utf8"), deps);
      entries.push({
        path: target.path,
        kind: target.kind,
        before,
        staged,
        state: "staged",
      });
    }
    fsyncDirectory(transaction, deps);
    const record = { schema: JOURNAL_SCHEMA, state: "prepared", targets: entries };
    // From this durable write onward proof is retained for recovery; on a
    // write/fsync uncertainty the journal is deliberately left in place.
    writeDurable(journal, `${JSON.stringify(record)}\n`, deps);
    fsyncDirectory(transaction, deps);
    return record;
  } catch (error) {
    if (!deps.existsSync(journal)) {
      // No external target has been renamed before the journal.  Remove only
      // our verified same-root staging directory, then make its removal durable.
      assertNoSymlinkProjectPath(root, TXN_DIR, deps);
      removePath(transaction, deps);
      fsyncDirectory(root, deps);
    }
    throw error;
  }
}

function applyTransaction(root, record, deps) {
  assertTransactionPaths(root, deps, { lock: true });
  const { transaction } = journalPaths(root);
  record.state = "applying";
  durableJournal(root, record, deps);
  for (const [index, entry] of record.targets.entries()) {
    const target = assertNoSymlinkProjectPath(root, entry.path, deps);
    if (entry.staged.status === "absent") {
      if (deps.existsSync(target)) deps.unlinkSync(target);
    } else {
      const staged = join(transaction, entry.staged.file);
      deps.renameSync(staged, target);
    }
    fsyncDirectory(dirname(target), deps);
    entry.state = "renamed";
    durableJournal(root, record, deps);
    if (typeof deps.interruptAfterRename === "function" && deps.interruptAfterRename({
      index,
      target: entry.path,
      journal: clone(record),
    })) {
      throw new IntentionalMigrationInterruption(entry.path);
    }
  }
  record.state = "complete";
  durableJournal(root, record, deps);
  removePath(transaction, deps);
  fsyncDirectory(root, deps);
}

/**
 * Apply a ready in-process plan only with explicit activation.  Any handled
 * staging/rename/durability error rolls every target back from validated proof.
 */
export function applyRunnerProfileMigrationV2(plan, {
  rootDir = plan?.root ?? process.cwd(), activate = false, deps: overrides = {}, interruptAfterRename,
} = {}) {
  const planState = authenticatedPlanState(plan);
  if (!planState || !["ready", "noop"].includes(planState.status)) {
    return { schema: PLAN_SCHEMA, status: "invalid-plan", diagnostics: [diagnostic("$", "invalid_plan", "apply accepts only a ready in-process migration plan", "run plan again and apply that reviewed result")] };
  }
  if (!activate) return { schema: PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "pass --activate only after reviewing the ready plan")] };
  if (planState.status === "noop") return { schema: PLAN_SCHEMA, status: "noop", diagnostics: [], changes: [] };
  const deps = dependencySet({ ...overrides, ...(interruptAfterRename ? { interruptAfterRename } : {}) });
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) {
    return { schema: PLAN_SCHEMA, status: "invalid-root", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")] };
  }
  if (root !== planState.root) {
    return { schema: PLAN_SCHEMA, status: "invalid-plan", diagnostics: [diagnostic("$.root", "plan_root_mismatch", "apply root differs from the authenticated migration plan root", "run plan again for the selected project root")] };
  }
  let lock;
  try {
    // The lock remains held from recovery through source recheck, stage, apply,
    // and handled rollback.  There is no recover/apply handoff window.
    lock = acquireLock(root, deps);
    recoverWithHeldLock(root, deps);
    const current = sourceInfo(root, deps);
    if (sha256(current.bytes) !== planState.sourceSha256) throw new Error("source changed since planning");
    // This is deliberately adjacent to staging.  It checks both the original
    // public object and the frozen I2/source target boundary after recovery.
    if (authenticatedPlanState(plan) !== planState) throw new Error("public migration plan changed since authentication");
    assertExactMigrationTargets(root, planState.targets, deps);
    const record = prepareTransaction(root, planState.targets, deps);
    try {
      applyTransaction(root, record, deps);
      return { schema: PLAN_SCHEMA, status: "applied", diagnostics: [], changes: planState.changes, sourceCommittedLast: true };
    } catch (error) {
      if (error instanceof IntentionalMigrationInterruption) {
        return {
          schema: PLAN_SCHEMA,
          status: "interrupted",
          diagnostics: [diagnostic("$.transaction", "intentional_interruption", error.message, "run inspect, plan, or apply again to recover recorded preimages")],
        };
      }
      try {
        validateJournal(root, record, deps);
        rollbackTransaction(root, record, deps);
      } catch (rollbackError) {
        return { schema: PLAN_SCHEMA, status: "rollback-failed", diagnostics: [diagnostic("$.transaction", "rollback_failed", rollbackError.message, "perform manual recovery from the validated transaction directory")] };
      }
      return { schema: PLAN_SCHEMA, status: "rolled-back", diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "no target bytes were retained; repair the failure and plan again")] };
    }
  } catch (error) {
    return { schema: PLAN_SCHEMA, status: "apply-failed", diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "repair the project state and plan again")] };
  } finally {
    if (lock) releaseLock(root, lock, deps);
  }
}
