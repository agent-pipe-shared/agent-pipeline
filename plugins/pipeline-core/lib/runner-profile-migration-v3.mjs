// SPDX-License-Identifier: Apache-2.0

/**
 * One-way v0/v1/v2 -> v3 runner-profile migration.
 *
 * The public plan contains digests only.  Target bytes stay in a WeakMap and
 * can be applied only by passing the unchanged in-process plan together with
 * an explicit activation flag.  All runtime projections are renamed before
 * pipeline.user.yaml, and every handled failure restores every preimage.
 */
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";

import { applyRunnerProfileMigrationV2, planRunnerProfileMigrationV2 } from "./runner-profile-migration-v2.mjs";
import { validatePipelineUserV2 } from "./runner-profiles-v2.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import {
  loadRuntimeProjectionV3OwnedKeys,
  planRuntimeProjectionV3,
} from "./runtime-projection-v3.mjs";
import {
  attestRecoveryPreviewDelivery,
  createRecoveryPreviewInvocation,
} from "./recovery-preview-attestation.mjs";
import { parseYaml } from "./yaml-lite.mjs";

const SOURCE_FILE = "pipeline.user.yaml";
const TXN_DIR = ".pipeline-runner-profile-migration-v3";
const LOCK_DIR = ".pipeline-runner-profile-migration-v3.lock";
const JOURNAL_FILE = "journal.json";
const JOURNAL_SCHEMA = "pipeline.runner-profile-migration-journal.v3";
const PLAN_SCHEMA = "pipeline.runner-profile-migration-plan.v3";
const INSPECT_SCHEMA = "pipeline.runner-profile-migration-inspect.v3";
const RECOVERY_PLAN_SCHEMA = "pipeline.runner-profile-migration-recovery-plan.v3";
const RECOVERY_AUTHORIZATION_SCHEMA = "pipeline.runner-profile-migration-recovery-authorization.v3";
const PREWRITE_PREVIEW_SCHEMA = "pipeline.runner-profile-migration-prewrite-preview.v3";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const AUTHENTICATED_PLANS = new WeakMap();
const AUTHENTICATED_RECOVERY_PLANS = new WeakMap();
const AUTHENTICATED_RECOVERY_AUTHORIZATIONS = new WeakMap();
const LEGACY_CLASSIFIER_BASELINES = Object.freeze({
  ".claude/settings.json": "{}\n",
  ".claude/pipeline.json": "{}\n",
  ".claude/pipeline.yaml": "modelRouting:\n  legacy:\n    model: legacy\n    effort: low\n",
  ".codex/config.toml": "# classifier baseline\n",
  ".codex/agents/implementor.toml": 'model = "legacy"\nmodel_reasoning_effort = "low"\n',
  ".codex/agents/critic.toml": 'model = "legacy"\nmodel_reasoning_effort = "low"\n',
});
// These seeds exist only in authenticated legacy -> V3 planning memory. They
// contain the minimum syntax required by the byte-preserving renderer and are
// never written before the V3-owned values replace them. The preserve-only
// config seed is deliberately empty: provider, machine and communication
// preferences are user-owned, not Public migration policy.
const LEGACY_V3_RUNTIME_SEEDS = Object.freeze({
  ".codex/config.toml": "",
  ".codex/agents/implementor.toml": 'model = ""\nmodel_reasoning_effort = ""\n',
  ".codex/agents/critic.toml": 'model = ""\nmodel_reasoning_effort = ""\n',
});
// A slim private overlay can carry the complete, already-valid V3 source while
// deliberately omitting every ignored runtime projection. These in-memory
// baselines contain only the syntax needed by the byte-preserving renderer.
// They are opt-in at planning, are never used for a present target, and the
// resulting authenticated plan still records every seeded preimage as absent.
const SLIM_V3_RUNTIME_SEEDS = Object.freeze({
  ".claude/settings.json": "{}\n",
  ".claude/pipeline.json": "{}\n",
  ".claude/pipeline.yaml": "language:\n  human_facing: en\nmodelRouting:\n  legacy:\n    model: legacy\n    effort: low\n",
  ".codex/config.toml": "",
  ".codex/agents/implementor.toml": 'model = ""\nmodel_reasoning_effort = ""\n',
  ".codex/agents/critic.toml": 'model = ""\nmodel_reasoning_effort = ""\n',
});

class IntentionalMigrationInterruption extends Error {
  constructor(target) { super(`intentional interruption after ${target}`); this.name = "IntentionalMigrationInterruption"; }
}

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function isObject(value) { return value !== null && typeof value === "object" && !Array.isArray(value); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function same(left, right) { return JSON.stringify(stable(left)) === JSON.stringify(stable(right)); }
function diagnostic(path, code, message, repair) { return { path, code, message, repair }; }
function result(status, diagnostics = [], extra = {}) {
  return { schema: PLAN_SCHEMA, status, source: SOURCE_FILE, diagnostics, requiresExplicitActivation: true, ...extra };
}
function dependencies(overrides = {}) {
  return {
    closeSync, existsSync, fsyncSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync,
    readFileSync, realpathSync, renameSync, rmdirSync, rmSync, unlinkSync,
    writeFileSync, process: globalThis.process, ...overrides,
  };
}

function safeRoot(rootDir, deps) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("root must be a non-empty path");
  const requested = resolve(rootDir);
  const info = deps.lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real project directory");
  return deps.realpathSync(requested);
}
function safePath(root, relative) {
  if (typeof relative !== "string" || !SAFE_RELATIVE.test(relative)) throw new Error("unsafe project-relative path");
  const target = resolve(root, relative);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error("project path escapes selected root");
  return target;
}
function assertNoSymlink(root, relative, deps) {
  const target = safePath(root, relative);
  let cursor = root;
  for (const component of relative.split("/")) {
    cursor = join(cursor, component);
    try {
      const info = deps.lstatSync(cursor);
      if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${relative}`);
      if (cursor !== target && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${relative}`);
    } catch (error) {
      if (error?.code === "ENOENT") return target;
      throw error;
    }
  }
  return target;
}
function sourceInfo(root, deps) {
  const path = assertNoSymlink(root, SOURCE_FILE, deps);
  const info = deps.lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("pipeline.user.yaml must be a regular project-local file");
  return { path, bytes: deps.readFileSync(path, "utf8") };
}
function digestPath(path, deps) {
  if (!deps.existsSync(path)) return { status: "absent", sha256: null, byteLength: 0 };
  const info = deps.lstatSync(path);
  if (!info.isFile() || info.isSymbolicLink()) throw new Error("target is not a regular file");
  const bytes = deps.readFileSync(path, "utf8");
  return { status: "present", sha256: sha256(bytes), byteLength: Buffer.byteLength(bytes, "utf8") };
}

function runtimePaths() {
  const manifest = loadRuntimeProjectionV3OwnedKeys();
  if (!isObject(manifest) || !Array.isArray(manifest.targets) || manifest.targets.length === 0) throw new Error("V3 runtime ownership manifest is unavailable");
  const paths = manifest.targets.map((target) => target?.path);
  if (paths.some((path) => typeof path !== "string" || !SAFE_RELATIVE.test(path)) || new Set(paths).size !== paths.length) throw new Error("V3 runtime ownership manifest has unsafe or duplicate targets");
  return paths;
}
function runtimeBaselines(root, deps, sourceKind, { initializeMissingRuntimeForSlimV3 = false } = {}) {
  const legacy = ["v0", "v1", "v2"].includes(sourceKind);
  const initializeSlimV3 = sourceKind === "v3" && initializeMissingRuntimeForSlimV3 === true;
  const baselines = {};
  const seeded = new Set();
  for (const relative of runtimePaths()) {
    const target = assertNoSymlink(root, relative, deps);
    if (!deps.existsSync(target)) {
      const seed = legacy
        ? LEGACY_V3_RUNTIME_SEEDS[relative]
        : initializeSlimV3 ? SLIM_V3_RUNTIME_SEEDS[relative] : undefined;
      if (typeof seed !== "string") throw new Error(`declared runtime baseline is missing: ${relative}`);
      baselines[relative] = { status: "present", bytes: seed };
      seeded.add(relative);
      continue;
    }
    const info = deps.lstatSync(target);
    if (!info.isFile() || info.isSymbolicLink()) throw new Error(`declared runtime baseline is not a regular file: ${relative}`);
    baselines[relative] = { status: "present", bytes: deps.readFileSync(target, "utf8") };
  }
  return { baselines, seeded };
}

function renderScalar(value) {
  if (typeof value === "string") return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  if (value === null) return "null";
  throw new Error("unsupported YAML scalar");
}
function renderYaml(value, indent = "") {
  if (Array.isArray(value)) return value.map((item) => (isObject(item) || Array.isArray(item))
    ? `${indent}-\n${renderYaml(item, `${indent}  `)}`
    : `${indent}- ${renderScalar(item)}\n`).join("");
  return Object.keys(value).sort().map((key) => {
    const renderedKey = /^[A-Za-z][A-Za-z0-9_-]*$/u.test(key) ? key : renderScalar(key);
    const item = value[key];
    return isObject(item) || Array.isArray(item)
      ? `${indent}${renderedKey}:\n${renderYaml(item, `${indent}  `)}`
      : `${indent}${renderedKey}: ${renderScalar(item)}\n`;
  }).join("");
}

function v3IntentFromV2(v2) {
  const registry = loadRunnerProfilesV3Registry();
  return {
    schema: "pipeline.user.v3",
    language: clone(v2.language),
    agent_runtime: v2.agent_runtime,
    runners: clone(v2.runners),
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: clone(v2.usage),
    autonomy: clone(v2.autonomy),
    gates: clone(v2.gates),
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "PO" } },
    session: { keep_awake: false },
  };
}

const LEGACY_V3_CRITIC_NORMAL_CODEX = Object.freeze({
  state: "default",
  selector: Object.freeze({ kind: "model-id", value: "gpt-5.6-terra" }),
  effort: "xhigh",
  unavailable: "defer",
  evidence: "dispatch-receipt",
});

function refreshKnownV3RegistryDelta(parsed) {
  const registry = loadRunnerProfilesV3Registry();
  const candidate = clone(parsed);
  const compatibilityDeltas = [];
  if (same(parsed?.routing?.duties?.critic_normal?.codex, LEGACY_V3_CRITIC_NORMAL_CODEX)) {
    candidate.routing.duties.critic_normal.codex = clone(registry.duties.critic_normal.codex);
    compatibilityDeltas.push({
      name: "normal-critic-adr-0035-route-repair",
      path: "routing.duties.critic_normal.codex",
      from: "gpt-5.6-terra/xhigh",
      to: "gpt-5.6-sol/xhigh",
    });
  }
  if (!Object.hasOwn(parsed, "critic_export")) {
    candidate.critic_export = clone(registry.criticExportPolicy);
    compatibilityDeltas.push({
      name: "closed-critic-export-policy",
      path: "critic_export",
      from: "absent/default-deny",
      to: "digest-bound-allowlist",
    });
  }
  if (compatibilityDeltas.length === 0) return null;
  const validation = validatePipelineUserV3(candidate, { source: SOURCE_FILE });
  if (!validation.ok) return null;
  return {
    intent: candidate,
    compatibilityDeltas,
  };
}

/**
 * Reuse the already hardened legacy classifier without exposing its private
 * staged bytes: migrate an isolated ephemeral copy to v2, read the validated
 * result, then remove the copy.  The selected project remains read-only.
 */
function legacyToV2(sourceBytes, deps) {
  const scratch = deps.mkdtempSync(join(tmpdir(), "pipeline-v3-classify-"));
  try {
    for (const relative of runtimePaths()) {
      const target = join(scratch, relative);
      deps.mkdirSync(dirname(target), { recursive: true });
      const baseline = LEGACY_CLASSIFIER_BASELINES[relative];
      if (typeof baseline !== "string") throw new Error(`legacy classifier has no safe baseline for ${relative}`);
      deps.writeFileSync(target, baseline, "utf8");
    }
    deps.writeFileSync(join(scratch, SOURCE_FILE), sourceBytes, "utf8");
    const plan = planRunnerProfileMigrationV2({ rootDir: scratch });
    if (!['ready', 'noop'].includes(plan.status)) return { diagnostics: plan.diagnostics ?? [] };
    const applied = applyRunnerProfileMigrationV2(plan, { rootDir: scratch, activate: true });
    if (!['applied', 'noop'].includes(applied.status)) return { diagnostics: applied.diagnostics ?? [] };
    const parsed = parseYaml(deps.readFileSync(join(scratch, SOURCE_FILE), "utf8"));
    const validation = validatePipelineUserV2(parsed, { source: SOURCE_FILE });
    return validation.ok ? { intent: parsed } : { diagnostics: validation.errors };
  } finally {
    deps.rmSync(scratch, { recursive: true, force: true });
  }
}

function classify(root, deps) {
  const source = sourceInfo(root, deps);
  let parsed;
  try { parsed = parseYaml(source.bytes); } catch { return { source, diagnostics: [diagnostic("$", "yaml_parse", "pipeline.user.yaml is not valid yaml-lite input", "repair the source YAML")] }; }
  if (!isObject(parsed)) return { source, diagnostics: [diagnostic("$", "invalid_source", "source root must be an object", "restore one accepted source shape")] };
  if (parsed.schema === "pipeline.user.v3") {
    const validation = validatePipelineUserV3(parsed, { source: SOURCE_FILE });
    if (validation.ok) return { source, kind: "v3", intent: clone(parsed), compatibilityDeltas: [] };
    const refresh = refreshKnownV3RegistryDelta(parsed);
    return refresh
      ? { source, kind: "v3-refresh", ...refresh }
      : { source, diagnostics: validation.errors };
  }
  if (parsed.schema === "pipeline.user.v2") {
    const validation = validatePipelineUserV2(parsed, { source: SOURCE_FILE });
    if (!validation.ok) return { source, diagnostics: validation.errors };
    return {
      source, kind: "v2", intent: v3IntentFromV2(parsed),
      compatibilityDeltas: [{ name: "runner-neutral-advisory-v3", path: "routing", oldProfile: "design", newProfile: "epic", advisory: "duty-authority" }],
    };
  }
  const legacy = legacyToV2(source.bytes, deps);
  if (!legacy.intent) return { source, diagnostics: legacy.diagnostics ?? [diagnostic("$", "legacy_conversion", "legacy source cannot be converted", "repair the accepted v0/v1 source")] };
  return {
    source, kind: parsed.schema === "pipeline.user.v1" ? "v1" : "v0", intent: v3IntentFromV2(legacy.intent),
    compatibilityDeltas: [{ name: "runner-neutral-advisory-v3", path: "routing", oldProfile: "design", newProfile: "epic", advisory: "duty-authority" }],
  };
}

export function inspectRunnerProfileMigrationV3({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const deps = dependencies(overrides);
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "invalid-root", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")] };
  }
  try { requireNoPendingTransaction(root, deps); } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "recovery-required", root, diagnostics: [diagnostic("$.transaction", "recovery_failed", error.message, "repair the V3 journal before retrying")] };
  }
  try {
    const classified = classify(root, deps);
    if (!classified.intent) return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics: classified.diagnostics };
    return { schema: INSPECT_SCHEMA, status: "ready", root, source: SOURCE_FILE, sourceSha256: sha256(classified.source.bytes), sourceKind: classified.kind, compatibilityDeltas: classified.compatibilityDeltas, diagnostics: [] };
  } catch (error) {
    return { schema: INSPECT_SCHEMA, status: "invalid-source", root, source: SOURCE_FILE, diagnostics: [diagnostic("$", "source_unreadable", error.message, "supply a readable project-local source")] };
  }
}

function publicSignature(value) {
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
function remember(publicPlan, targets) {
  AUTHENTICATED_PLANS.set(publicPlan, { signature: publicSignature(publicPlan), root: publicPlan.root, sourceSha256: publicPlan.sourceSha256, status: publicPlan.status, changes: clone(publicPlan.changes), targets: clone(targets) });
  return publicPlan;
}
function authenticated(plan) {
  if (!isObject(plan)) return null;
  const state = AUTHENTICATED_PLANS.get(plan);
  if (!state) return null;
  try { return publicSignature(plan) === state.signature ? state : null; } catch { return null; }
}
function preWriteMetadata(target) {
  if (target.kind === "source") {
    return {
      dataClass: "portable-project-intent",
      logicalTargetRoot: "project-root",
      trackingStatus: "repository-policy-dependent",
      ownerMode: "source-authority",
    };
  }
  const manifestTarget = loadRuntimeProjectionV3OwnedKeys().targets.find((entry) => entry.path === target.path);
  if (!manifestTarget) throw new Error(`V3 pre-write metadata has no declared runtime target: ${target.path}`);
  return {
    dataClass: "project-runtime-projection",
    logicalTargetRoot: target.path.startsWith(".claude/") ? ".claude" : ".codex",
    // Planning is deliberately Git-independent. This enum states policy
    // dependence without probing or pretending to observe index/tracking state.
    trackingStatus: "repository-policy-dependent",
    ownerMode: manifestTarget.ownedKeys.length === 0 ? "preserve-only" : "owned-keys-preserve-unowned",
  };
}
function publicTarget(target) {
  return {
    path: target.path,
    kind: target.kind,
    preWrite: preWriteMetadata(target),
    before: target.before,
    after: target.after,
    changed: target.before.sha256 !== target.after.sha256,
  };
}

export function planRunnerProfileMigrationV3({
  rootDir = process.cwd(),
  deps: overrides = {},
  initializeMissingRuntimeForSlimV3 = false,
} = {}) {
  const deps = dependencies(overrides);
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) { return result("invalid-root", [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")], { targets: [], changes: [] }); }
  try { requireNoPendingTransaction(root, deps); }
  catch (error) { return result("recovery-required", [diagnostic("$.transaction", "recovery_failed", error.message, "deliver an authenticated recovery preview before retrying")], { root, targets: [], changes: [] }); }
  let classified;
  try { classified = classify(root, deps); } catch (error) { return result("invalid-source", [diagnostic("$", "source_parse", error.message, "repair pipeline.user.yaml")], { root, targets: [], changes: [] }); }
  if (!classified.intent) return result("invalid-source", classified.diagnostics, { root, targets: [], changes: [] });
  const validation = validatePipelineUserV3(classified.intent, { source: SOURCE_FILE });
  if (!validation.ok) return result("invalid-intent", validation.errors, { root, sourceKind: classified.kind, targets: [], changes: [] });
  let projection; let seeded;
  try {
    const runtime = runtimeBaselines(root, deps, classified.kind, { initializeMissingRuntimeForSlimV3 });
    seeded = runtime.seeded;
    projection = planRuntimeProjectionV3(classified.intent, { source: SOURCE_FILE, baselines: runtime.baselines });
  } catch (error) {
    return result("invalid-baseline", [diagnostic("$.runtime", "baseline_read", error.message, "repair declared V3 runtime targets")], { root, sourceKind: classified.kind, targets: [], changes: [] });
  }
  if (projection.status !== "ready") return result(projection.status, projection.diagnostics ?? [], { root, sourceKind: classified.kind, targets: [], changes: [], decisionConflicts: projection.decisionConflicts });
  const renderedSource = classified.kind === "v3" ? classified.source.bytes : renderYaml(classified.intent);
  const internal = projection.targets.map((target) => ({
    path: target.path,
    kind: "runtime",
    bytes: target.after.bytes,
    before: seeded.has(target.path)
      ? { status: "absent", sha256: null, byteLength: 0 }
      : target.before,
    after: { status: target.after.status, sha256: target.after.sha256, byteLength: target.after.byteLength },
  })).sort((left, right) => left.path.localeCompare(right.path));
  internal.push({ path: SOURCE_FILE, kind: "source", bytes: renderedSource, before: { status: "present", sha256: sha256(classified.source.bytes), byteLength: Buffer.byteLength(classified.source.bytes, "utf8") }, after: { status: "present", sha256: sha256(renderedSource), byteLength: Buffer.byteLength(renderedSource, "utf8") } });
  const targets = internal.map(publicTarget);
  const changes = targets.filter((target) => target.changed);
  return remember(result(changes.length === 0 ? "noop" : "ready", [], {
    root, sourceKind: classified.kind, sourceSha256: sha256(classified.source.bytes), intentSha256: sha256(JSON.stringify(stable(classified.intent))), compatibilityDeltas: classified.compatibilityDeltas, decisionConflicts: projection.decisionConflicts ?? [], targets, changes,
    activation: { required: true, command: "apply --activate", sourceCommittedLast: true },
  }), internal);
}

function fsyncFile(path, deps) { const fd = deps.openSync(path, "r"); try { deps.fsyncSync(fd); } finally { deps.closeSync(fd); } }
function fsyncDirectory(path, deps) { const fd = deps.openSync(path, "r"); try { deps.fsyncSync(fd); } finally { deps.closeSync(fd); } }
function writeDurable(path, bytes, deps) { deps.writeFileSync(path, bytes, { encoding: "utf8", mode: 0o600 }); fsyncFile(path, deps); }
function transactionPaths(root) { const transaction = safePath(root, TXN_DIR); return { transaction, lock: safePath(root, LOCK_DIR), journal: join(transaction, JOURNAL_FILE) }; }
function remove(path, deps) { if (deps.existsSync(path)) deps.rmSync(path, { recursive: true, force: true }); }
function isDead(pid, deps) { if (!Number.isInteger(pid) || pid <= 1) return false; try { deps.process.kill(pid, 0); return false; } catch (error) { return error?.code === "ESRCH"; } }
function acquireLock(root, deps) {
  assertNoSymlink(root, LOCK_DIR, deps);
  const { lock } = transactionPaths(root);
  try { deps.mkdirSync(lock, { mode: 0o700 }); } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    let owner; try { owner = JSON.parse(deps.readFileSync(join(lock, "owner.json"), "utf8")); } catch { throw new Error("V3 migration lock has no valid owner"); }
    if (!isDead(owner?.pid, deps)) throw new Error("V3 migration lock is held by a live or unverifiable owner");
    remove(lock, deps); deps.mkdirSync(lock, { mode: 0o700 });
  }
  writeDurable(join(lock, "owner.json"), `${JSON.stringify({ schema: JOURNAL_SCHEMA, pid: deps.process.pid })}\n`, deps);
  fsyncDirectory(lock, deps);
  return lock;
}
function releaseLock(lock, deps) { remove(lock, deps); }
function durableJournal(root, record, deps) { const { transaction, journal } = transactionPaths(root); writeDurable(journal, `${JSON.stringify(record)}\n`, deps); fsyncDirectory(transaction, deps); }
function missingTargetDirectories(root, targets, deps) {
  const missing = new Set();
  for (const target of targets) {
    const parent = dirname(target.path);
    if (parent === ".") continue;
    let relative = "";
    for (const component of parent.split("/")) {
      relative = relative ? `${relative}/${component}` : component;
      const path = assertNoSymlink(root, relative, deps);
      if (!deps.existsSync(path)) { missing.add(relative); continue; }
      const info = deps.lstatSync(path);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`target parent is not a real directory: ${relative}`);
    }
  }
  return [...missing].sort((left, right) => left.split("/").length - right.split("/").length || left.localeCompare(right));
}
function validateDirectoryBoundary(directories, targets) {
  if (!Array.isArray(directories)) throw new Error("V3 transaction has no directory boundary");
  const allowed = new Set(targets.flatMap((target) => {
    const parts = dirname(target.path).split("/");
    if (parts.length === 1 && parts[0] === ".") return [];
    return parts.map((_, index) => parts.slice(0, index + 1).join("/"));
  }));
  let previousDepth = 0;
  const seen = new Set();
  for (const entry of directories) {
    const depth = typeof entry?.path === "string" ? entry.path.split("/").length : 0;
    if (!isObject(entry) || !SAFE_RELATIVE.test(entry.path) || !allowed.has(entry.path) || seen.has(entry.path)
      || !["pending", "created"].includes(entry.state) || depth < previousDepth) {
      throw new Error("V3 transaction has an invalid directory boundary");
    }
    seen.add(entry.path); previousDepth = depth;
  }
}
function validateTargetBoundary(entries) {
  const expected = runtimePaths().sort((a, b) => a.localeCompare(b));
  if (!Array.isArray(entries) || entries.length !== expected.length + 1) throw new Error("V3 transaction has an incomplete target boundary");
  if (entries.at(-1)?.path !== SOURCE_FILE || entries.at(-1)?.kind !== "source") throw new Error("V3 transaction does not commit source last");
  const runtime = entries.slice(0, -1);
  if (runtime.some((entry, index) => entry.kind !== "runtime" || entry.path !== expected[index])) throw new Error("V3 transaction differs from the owned runtime boundary");
}
function imageMatches(actual, expected) {
  return isObject(expected) && actual.status === expected.status && actual.sha256 === expected.sha256 && actual.byteLength === expected.byteLength;
}
function validImage(image) {
  return isObject(image)
    && image.status === "present"
    && /^[a-f0-9]{64}$/u.test(image.sha256)
    && Number.isInteger(image.byteLength)
    && image.byteLength >= 0;
}
/** Validate every untrusted journal proof before recovery can write a target. */
function validateJournal(root, record, deps) {
  assertNoSymlink(root, TXN_DIR, deps);
  if (!isObject(record) || record.schema !== JOURNAL_SCHEMA || !["prepared", "applying", "rolling-back", "rolled-back", "complete"].includes(record.state)) throw new Error("V3 transaction journal is corrupt");
  validateTargetBoundary(record.targets);
  validateDirectoryBoundary(record.directories, record.targets);
  const { transaction } = transactionPaths(root);
  for (const entry of record.directories) {
    const path = assertNoSymlink(root, entry.path, deps);
    if (!deps.existsSync(path)) {
      if (entry.state === "created") throw new Error(`V3 journal directory disappeared: ${entry.path}`);
      continue;
    }
    const info = deps.lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`V3 journal directory is not real: ${entry.path}`);
  }
  for (const [index, entry] of record.targets.entries()) {
    if (!isObject(entry) || !["unchanged", "staged", "committing", "renamed"].includes(entry.state) || !validImage(entry.after)) throw new Error(`V3 journal target ${index} has incomplete staged proof`);
    if (!isObject(entry.before) || !["present", "absent"].includes(entry.before.status)) throw new Error(`V3 journal target ${index} has incomplete preimage proof`);
    if (entry.before.status === "present" && !validImage(entry.before)) throw new Error(`V3 journal target ${index} has invalid preimage digest`);
    if (entry.before.status === "absent" && (entry.before.sha256 !== null || entry.before.byteLength !== 0)) throw new Error(`V3 journal target ${index} has invalid absent preimage`);
    if (entry.state === "unchanged") {
      if (entry.stage !== null || entry.backup !== null || entry.displaced !== null || !same(entry.before, entry.after)) throw new Error(`V3 journal target ${index} has invalid unchanged proof`);
      const target = assertNoSymlink(root, entry.path, deps);
      if (!imageMatches(digestPath(target, deps), entry.before)) throw new Error(`V3 journal target ${index} changed despite an unchanged proof`);
      continue;
    }
    if (!/^stage-[0-9]{3}$/u.test(entry.stage)
      || (entry.backup !== null && !/^preimage-[0-9]{3}$/u.test(entry.backup))
      || (entry.displaced !== null && !/^displaced-[0-9]{3}$/u.test(entry.displaced))) throw new Error(`V3 journal target ${index} has unsafe proof filenames`);
    if ((entry.before.status === "present") !== (entry.backup !== null)) throw new Error(`V3 journal target ${index} has inconsistent backup authority`);
    if ((entry.before.status === "present") !== (entry.displaced !== null)) throw new Error(`V3 journal target ${index} has inconsistent displacement authority`);
    const target = assertNoSymlink(root, entry.path, deps);
    const actual = digestPath(target, deps);
    const isBefore = imageMatches(actual, entry.before);
    const isAfter = imageMatches(actual, entry.after);
    const stage = join(transaction, entry.stage);
    if (!deps.existsSync(stage)) throw new Error(`V3 journal target ${index} lost its staged proof`);
    const stageInfo = deps.lstatSync(stage);
    if (!stageInfo.isFile() || stageInfo.isSymbolicLink() || !imageMatches(digestPath(stage, deps), entry.after)) throw new Error(`V3 journal target ${index} has corrupt staged proof`);
    if (entry.before.status === "present") {
      const backup = join(transaction, entry.backup);
      const info = deps.lstatSync(backup);
      if (!info.isFile() || info.isSymbolicLink() || sha256(deps.readFileSync(backup, "utf8")) !== entry.before.sha256) throw new Error(`V3 journal target ${index} has corrupt preimage proof`);
      const displaced = join(transaction, entry.displaced);
      if (deps.existsSync(displaced) && !imageMatches(digestPath(displaced, deps), entry.before)) throw new Error(`V3 journal target ${index} has corrupt displaced preimage`);
    }
    const displacedPresent = entry.displaced !== null && deps.existsSync(join(transaction, entry.displaced));
    const acceptedCommitGap = entry.state === "committing" && entry.before.status === "present" && displacedPresent && actual.status === "absent";
    if (!isBefore && !isAfter && !acceptedCommitGap) throw new Error(`V3 journal target ${index} matches neither recorded image`);
    if (entry.state === "staged" && displacedPresent) throw new Error(`V3 journal target ${index} displaced before commit authority`);
    if (entry.state === "renamed" && entry.before.status === "present" && !displacedPresent) throw new Error(`V3 journal target ${index} lost its displaced preimage`);
  }
}
function prepare(root, targets, deps) {
  validateTargetBoundary(targets);
  const directories = missingTargetDirectories(root, targets, deps);
  const { transaction } = transactionPaths(root);
  if (deps.existsSync(transaction)) throw new Error("V3 transaction directory already exists");
  deps.mkdirSync(transaction, { mode: 0o700 }); fsyncDirectory(root, deps);
  const entries = [];
  try {
    for (const [index, target] of targets.entries()) {
      const path = assertNoSymlink(root, target.path, deps);
      const actual = digestPath(path, deps);
      if (!same(actual, target.before)) throw new Error(`target changed since planning: ${target.path}`);
      if (same(target.before, target.after)) {
        entries.push({ path: target.path, kind: target.kind, before: actual, stage: null, backup: null, displaced: null, after: target.after, state: "unchanged" });
        continue;
      }
      const stage = `stage-${String(index).padStart(3, "0")}`;
      const backup = `preimage-${String(index).padStart(3, "0")}`;
      const displaced = `displaced-${String(index).padStart(3, "0")}`;
      writeDurable(join(transaction, stage), target.bytes, deps);
      if (actual.status === "present") writeDurable(join(transaction, backup), deps.readFileSync(path, "utf8"), deps);
      entries.push({ path: target.path, kind: target.kind, before: actual, stage, backup: actual.status === "present" ? backup : null, displaced: actual.status === "present" ? displaced : null, after: target.after, state: "staged" });
    }
    fsyncDirectory(transaction, deps);
    const record = { schema: JOURNAL_SCHEMA, state: "prepared", directories: directories.map((path) => ({ path, state: "pending" })), targets: entries };
    durableJournal(root, record, deps);
    return record;
  } catch (error) {
    if (!deps.existsSync(join(transaction, JOURNAL_FILE))) { remove(transaction, deps); fsyncDirectory(root, deps); }
    throw error;
  }
}
function linkProofToAbsentTarget(proof, target, expected, deps) {
  deps.linkSync(proof, target);
  fsyncFile(target, deps); fsyncDirectory(dirname(target), deps);
  if (!imageMatches(digestPath(target, deps), expected)) throw new Error("exclusive proof restore produced the wrong image");
  deps.unlinkSync(proof); fsyncDirectory(dirname(proof), deps);
}
function quarantineTarget(target, transaction, entry, expected, deps) {
  const quarantine = join(transaction, `rollback-${sha256(entry.path).slice(0, 16)}`);
  if (deps.existsSync(quarantine)) throw new Error(`rollback quarantine already exists: ${entry.path}`);
  deps.renameSync(target, quarantine); fsyncDirectory(dirname(target), deps); fsyncDirectory(transaction, deps);
  const captured = digestPath(quarantine, deps);
  if (!imageMatches(captured, expected)) {
    // The target changed after the last observation. Put those external bytes
    // back with an exclusive link and retain no second mutable hard link.
    linkProofToAbsentTarget(quarantine, target, captured, deps);
    throw new Error(`target changed during rollback: ${entry.path}`);
  }
  return quarantine;
}
function restore(root, record, deps) {
  record.state = "rolling-back"; durableJournal(root, record, deps);
  const { transaction } = transactionPaths(root);
  for (const entry of record.targets) {
    if (["unchanged", "staged"].includes(entry.state)) continue;
    const target = assertNoSymlink(root, entry.path, deps);
    const actual = digestPath(target, deps);
    if (imageMatches(actual, entry.before)) { entry.state = "staged"; durableJournal(root, record, deps); continue; }
    if (entry.before.status === "absent") {
      if (actual.status === "absent") { entry.state = "staged"; durableJournal(root, record, deps); continue; }
      if (!imageMatches(actual, entry.after)) throw new Error(`external target cannot be removed during rollback: ${entry.path}`);
      const quarantine = quarantineTarget(target, transaction, entry, entry.after, deps);
      deps.unlinkSync(quarantine); fsyncDirectory(transaction, deps);
      entry.state = "staged"; durableJournal(root, record, deps);
      continue;
    }
    const displaced = join(transaction, entry.displaced);
    if (!deps.existsSync(displaced) || !imageMatches(digestPath(displaced, deps), entry.before)) throw new Error(`displaced preimage is unavailable: ${entry.path}`);
    if (actual.status === "present") {
      if (!imageMatches(actual, entry.after)) throw new Error(`external target cannot be overwritten during rollback: ${entry.path}`);
      const quarantine = quarantineTarget(target, transaction, entry, entry.after, deps);
      deps.unlinkSync(quarantine); fsyncDirectory(transaction, deps);
    }
    linkProofToAbsentTarget(displaced, target, entry.before, deps);
    entry.state = "staged"; durableJournal(root, record, deps);
  }
  for (const entry of [...record.directories].reverse()) {
    // A pending directory may have appeared concurrently after prepare. Only
    // the journal's created state is authority to remove a directory.
    if (entry.state !== "created") continue;
    const path = assertNoSymlink(root, entry.path, deps);
    if (!deps.existsSync(path)) continue;
    const info = deps.lstatSync(path);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`created directory cannot be restored: ${entry.path}`);
    deps.rmdirSync(path);
    fsyncDirectory(dirname(path), deps);
  }
  record.state = "rolled-back"; durableJournal(root, record, deps); remove(transaction, deps); fsyncDirectory(root, deps);
}
function recoverRecord(root, record, deps) {
  const { transaction } = transactionPaths(root);
  if (record.state === "complete" || record.state === "rolled-back") {
    remove(transaction, deps); fsyncDirectory(root, deps); return { status: "cleanup" };
  }
  restore(root, record, deps); return { status: "recovered" };
}
function requireNoPendingTransaction(root, deps, { allowLock = false } = {}) {
  const { journal, transaction, lock } = transactionPaths(root);
  assertNoSymlink(root, TXN_DIR, deps);
  assertNoSymlink(root, LOCK_DIR, deps);
  if (deps.existsSync(journal)) throw new Error("V3 pending recovery requires an authenticated pre-write preview");
  if (!allowLock && deps.existsSync(lock)) throw new Error("V3 migration lock exists without a recovery journal");
  if (deps.existsSync(transaction)) throw new Error("V3 transaction directory exists without a recovery journal");
}
function recoveryResult(status, diagnostics = [], extra = {}) {
  return { schema: RECOVERY_PLAN_SCHEMA, status, diagnostics, requiresExplicitActivation: true, ...extra };
}
function rememberRecovery(publicPlan, root, journalSha256, record) {
  AUTHENTICATED_RECOVERY_PLANS.set(publicPlan, {
    signature: publicSignature(publicPlan), root, journalSha256, record: clone(record), status: publicPlan.status,
  });
  return publicPlan;
}
function authenticatedRecovery(plan) {
  if (!isObject(plan)) return null;
  const state = AUTHENTICATED_RECOVERY_PLANS.get(plan);
  if (!state) return null;
  try { return publicSignature(plan) === state.signature ? state : null; } catch { return null; }
}
export function planPendingTransactionRecoveryV3({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const deps = dependencies(overrides);
  let root;
  try { root = safeRoot(rootDir, deps); } catch (error) {
    return recoveryResult("invalid-root", [diagnostic("$.root", "unsafe_root", error.message, "supply one real project directory")], { directories: [], targets: [] });
  }
  const { journal, transaction, lock } = transactionPaths(root);
  try {
    assertNoSymlink(root, TXN_DIR, deps);
    assertNoSymlink(root, LOCK_DIR, deps);
    if (!deps.existsSync(journal)) {
      if (deps.existsSync(lock)) throw new Error("V3 migration lock exists without a recovery journal");
      if (deps.existsSync(transaction)) throw new Error("V3 transaction directory exists without a recovery journal");
      return recoveryResult("none", [], { directories: [], targets: [] });
    }
    const journalBytes = deps.readFileSync(journal, "utf8");
    const record = JSON.parse(journalBytes);
    validateJournal(root, record, deps);
    const cleanupOnly = ["complete", "rolled-back"].includes(record.state);
    const targets = record.targets.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
      preWrite: preWriteMetadata(entry),
      journalState: entry.state,
      current: digestPath(assertNoSymlink(root, entry.path, deps), deps),
      restoreTo: entry.before,
      action: !cleanupOnly && ["committing", "renamed"].includes(entry.state) ? "restore-recorded-preimage" : "retain-current-image",
    }));
    const directories = record.directories.map((entry) => ({
      path: entry.path,
      journalState: entry.state,
      action: !cleanupOnly && entry.state === "created" ? "remove-if-empty-after-target-restore" : "retain",
    }));
    return rememberRecovery(recoveryResult("ready", [], {
      transaction: {
        journalSchema: record.schema,
        journalState: record.state,
        journalSha256: sha256(journalBytes),
        cleanupAfterRecovery: true,
      },
      directories,
      targets,
    }), root, sha256(journalBytes), record);
  } catch (error) {
    return recoveryResult("recovery-required", [diagnostic("$.transaction", "recovery_plan_failed", error.message, "repair the V3 journal before retrying")], { directories: [], targets: [] });
  }
}
function recoveryPreWritePreview(plan) {
  return {
    schema: PREWRITE_PREVIEW_SCHEMA,
    status: "pre-write-preview",
    operation: "recovery",
    recovery: plan.transaction,
    activation: { requested: true, restoresRecordedPreimages: true },
    directories: plan.directories,
    targets: plan.targets,
  };
}
export function authorizePendingTransactionRecoveryV3(plan, { deliverPreview } = {}) {
  const state = authenticatedRecovery(plan);
  if (!state || state.status !== "ready") return recoveryResult("invalid-plan", [diagnostic("$", "invalid_plan", "recovery authorization accepts only an unchanged in-process V3 recovery plan", "plan recovery again")]);
  if (typeof deliverPreview !== "function") return recoveryResult("preview-required", [diagnostic("$.preWritePreview", "preview_required", "recovery requires caller-delivered pre-write preview acknowledgement", "deliver the complete recovery preview and return its exact acknowledgement")]);
  const preview = recoveryPreWritePreview(plan);
  const previewSha256 = sha256(JSON.stringify(stable(preview)));
  const invocation = createRecoveryPreviewInvocation({
    invocationId: `recovery-${state.journalSha256}`,
    previewDigest: previewSha256,
  });
  const delivery = attestRecoveryPreviewDelivery({
    invocation,
    callback: (binding) => deliverPreview(clone(preview), binding),
  });
  if (!delivery.ok) {
    return recoveryResult("preview-failed", [diagnostic(
      "$.preWritePreview",
      delivery.code.toLowerCase(),
      "pre-write preview channel failed before recovery",
      "deliver the complete preview and return a matching acknowledgement before recovery",
    )]);
  }
  if (authenticatedRecovery(plan) !== state) return recoveryResult("invalid-plan", [diagnostic("$", "invalid_plan", "recovery plan changed during preview delivery", "plan recovery again")]);
  const authorization = {
    schema: RECOVERY_AUTHORIZATION_SCHEMA,
    status: "authorized",
    journalSha256: state.journalSha256,
    previewSha256,
  };
  AUTHENTICATED_RECOVERY_AUTHORIZATIONS.set(authorization, {
    signature: publicSignature(authorization), plan, recoveryState: state,
  });
  return authorization;
}
export function applyPendingTransactionRecoveryV3(plan, { rootDir = process.cwd(), authorization, deps: overrides = {} } = {}) {
  const state = authenticatedRecovery(plan);
  const authorizationState = isObject(authorization) ? AUTHENTICATED_RECOVERY_AUTHORIZATIONS.get(authorization) : null;
  if (!state || state.status !== "ready") return recoveryResult("invalid-plan", [diagnostic("$", "invalid_plan", "recovery accepts only an unchanged in-process V3 recovery plan", "plan recovery again")]);
  if (!authorizationState) return recoveryResult("authorization-required", [diagnostic("$.authorization", "authorization_required", "recovery requires a closed preview authorization", "deliver the recovery preview and pass its exact authorization")]);
  AUTHENTICATED_RECOVERY_AUTHORIZATIONS.delete(authorization);
  try {
    if (publicSignature(authorization) !== authorizationState.signature
      || authorizationState.plan !== plan
      || authorizationState.recoveryState !== state) {
      return recoveryResult("invalid-authorization", [diagnostic("$.authorization", "invalid_authorization", "recovery authorization does not match this authenticated plan", "deliver a fresh preview for this exact recovery plan")]);
    }
  } catch {
    return recoveryResult("invalid-authorization", [diagnostic("$.authorization", "invalid_authorization", "recovery authorization is malformed", "deliver a fresh preview for this exact recovery plan")]);
  }
  const deps = dependencies(overrides);
  let root; let held;
  try {
    root = safeRoot(rootDir, deps);
    if (root !== state.root) throw new Error("recovery root differs from the authenticated V3 recovery plan root");
    held = acquireLock(root, deps);
    const { journal } = transactionPaths(root);
    if (!deps.existsSync(journal)) throw new Error("recovery journal disappeared after preview");
    const journalBytes = deps.readFileSync(journal, "utf8");
    if (sha256(journalBytes) !== state.journalSha256) throw new Error("recovery journal changed after preview");
    if (authenticatedRecovery(plan) !== state) throw new Error("public recovery plan changed since authentication");
    const record = JSON.parse(journalBytes);
    validateJournal(root, record, deps);
    if (!same(record, state.record)) throw new Error("recovery record differs from the authenticated preview");
    const recovered = recoverRecord(root, record, deps);
    return recoveryResult(recovered.status, [], { recoveredTargets: plan.targets.map((target) => ({ path: target.path, action: target.action })) });
  } catch (error) {
    return recoveryResult("recovery-failed", [diagnostic("$.transaction", "recovery_failed", error.message, "repair project state and plan recovery again")]);
  } finally { if (held) releaseLock(held, deps); }
}
function commitTarget(root, record, entry, deps) {
  const { transaction } = transactionPaths(root);
  const target = assertNoSymlink(root, entry.path, deps);
  if (!imageMatches(digestPath(target, deps), entry.before)) throw new Error(`target changed after preparation: ${entry.path}`);
  entry.state = "committing"; durableJournal(root, record, deps);
  if (entry.before.status === "present") {
    const displaced = join(transaction, entry.displaced);
    if (deps.existsSync(displaced)) throw new Error(`displaced target already exists: ${entry.path}`);
    deps.renameSync(target, displaced); fsyncDirectory(dirname(target), deps); fsyncDirectory(transaction, deps);
    const captured = digestPath(displaced, deps);
    if (!imageMatches(captured, entry.before)) {
      linkProofToAbsentTarget(displaced, target, captured, deps);
      entry.state = "staged"; durableJournal(root, record, deps);
      throw new Error(`target changed at commit boundary: ${entry.path}`);
    }
  }
  try {
    deps.linkSync(join(transaction, entry.stage), target);
  } catch (error) {
    if (entry.before.status === "absent") {
      // Exclusive link failure means this transaction never touched the path.
      entry.state = "staged"; durableJournal(root, record, deps);
    } else if (!deps.existsSync(target)) {
      linkProofToAbsentTarget(join(transaction, entry.displaced), target, entry.before, deps);
      entry.state = "staged"; durableJournal(root, record, deps);
    }
    throw error;
  }
  fsyncFile(target, deps); fsyncDirectory(dirname(target), deps);
  if (!imageMatches(digestPath(target, deps), entry.after)) throw new Error(`target changed while committing: ${entry.path}`);
  entry.state = "renamed"; durableJournal(root, record, deps);
}
function applyTransaction(root, record, deps) {
  const { transaction } = transactionPaths(root);
  record.state = "applying"; durableJournal(root, record, deps);
  for (const entry of record.directories) {
    const path = assertNoSymlink(root, entry.path, deps);
    if (deps.existsSync(path)) throw new Error(`target parent appeared since planning: ${entry.path}`);
    deps.mkdirSync(path, { mode: 0o700 }); fsyncDirectory(dirname(path), deps);
    entry.state = "created"; durableJournal(root, record, deps);
  }
  for (const [index, entry] of record.targets.entries()) {
    if (entry.state === "unchanged") continue;
    if (typeof deps.beforeCommit === "function") deps.beforeCommit({ index, target: entry.path, journal: clone(record) });
    commitTarget(root, record, entry, deps);
    if (typeof deps.interruptAfterRename === "function" && deps.interruptAfterRename({ index, target: entry.path, journal: clone(record) })) throw new IntentionalMigrationInterruption(entry.path);
  }
  record.state = "complete"; durableJournal(root, record, deps); remove(transaction, deps); fsyncDirectory(root, deps);
}

export function applyRunnerProfileMigrationV3(plan, { rootDir = plan?.root ?? process.cwd(), activate = false, deps: overrides = {}, interruptAfterRename } = {}) {
  const state = authenticated(plan);
  if (!state || !["ready", "noop"].includes(state.status)) return result("invalid-plan", [diagnostic("$", "invalid_plan", "apply accepts only an unchanged in-process V3 plan", "run plan again")]);
  if (!activate) return result("activation-required", [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")]);
  const deps = dependencies({ ...overrides, ...(interruptAfterRename ? { interruptAfterRename } : {}) });
  let root; let lock;
  try {
    root = safeRoot(rootDir, deps);
    if (root !== state.root) throw new Error("apply root differs from the authenticated V3 plan root");
    requireNoPendingTransaction(root, deps);
    lock = acquireLock(root, deps);
    requireNoPendingTransaction(root, deps, { allowLock: true });
    if (sha256(sourceInfo(root, deps).bytes) !== state.sourceSha256) throw new Error("source changed since planning");
    if (authenticated(plan) !== state) throw new Error("public plan changed since authentication");
    validateTargetBoundary(state.targets);
    for (const target of state.targets) {
      const actual = digestPath(assertNoSymlink(root, target.path, deps), deps);
      if (!same(actual, target.before)) throw new Error(`target changed since planning: ${target.path}`);
    }
    if (state.status === "noop") return result("noop", [], { changes: [] });
    const record = prepare(root, state.targets, deps);
    try { applyTransaction(root, record, deps); return result("applied", [], { changes: state.changes, sourceCommittedLast: true }); }
    catch (error) {
      if (error instanceof IntentionalMigrationInterruption) return result("interrupted", [diagnostic("$.transaction", "intentional_interruption", error.message, "run inspect, plan, or apply again to recover recorded preimages")]);
      try { restore(root, record, deps); }
      catch (rollbackError) { return result("rollback-failed", [diagnostic("$.transaction", "rollback_failed", rollbackError.message, "recover the validated V3 transaction manually")]); }
      return result("rolled-back", [diagnostic("$.transaction", "apply_failed", error.message, "repair and plan again")]);
    }
  } catch (error) { return result("apply-failed", [diagnostic("$.transaction", "apply_failed", error.message, "repair project state and plan again")]); }
  finally { if (lock) releaseLock(lock, deps); }
}
