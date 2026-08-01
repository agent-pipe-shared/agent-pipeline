// SPDX-License-Identifier: SUL-1.0

/**
 * Fresh consumer-root onboarding for the public V3 authority.  Unlike the
 * migration, this is deliberately narrow: it writes only absent, Pipeline-owned
 * targets after an explicit activation. A pre-existing ungoverned project is a
 * distinct additive adoption path; existing authority stays owned by the
 * migration/repair workflow.
 */
import { createHash, randomBytes } from "node:crypto";
import {
  accessSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
  linkSync, readdirSync, realpathSync, readFileSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CODEX_HOST_CONTROL_PATHS,
  hasCodexGitControlMount,
  hasCodexHostControlLayout,
  hasCodexRuntimeControlMount,
  observeCodexHostRepositoryInitAdmission,
} from "./codex-host-layout.mjs";
import {
  appServerNextAction,
  observeOnboardingAppServer,
  RUNNERS_WITHOUT_APP_SERVER,
} from "./codex-onboarding-app-server.mjs";
import { observeCodexOnboardingCapabilities } from "./codex-onboarding-capabilities.mjs";
import {
  applyOnboardingContinuityRepair,
  applyOnboardingKickoff,
  applyOnboardingKickoffPromotion,
  classifyOnboardingContinuity,
  KICKOFF_GOAL_MAX_BYTES,
  planOnboardingContinuityRepair,
  planOnboardingKickoff,
  planOnboardingKickoffPromotion,
  planOnboardingSessionCleanupPrivatization,
  reconstructOnboardingKickoffPlan,
  reconstructOnboardingKickoffPromotionPlan,
} from "./onboarding-continuity.mjs";
import { applyRunnerProfileMigrationV3, inspectRunnerProfileMigrationV3, planRunnerProfileMigrationV3, renderCanonicalV3Manifest } from "./runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { loadManifest, validateManifest } from "./manifest.mjs";
import {
  validatePoGateAuthorityForRepository,
  validatePoGateProfileForRepository,
} from "./po-gate-authority.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { codexCustomAgentSeed, loadRuntimeProjectionV3OwnedKeys, planRuntimeProjectionV3 } from "./runtime-projection-v3.mjs";
import {
  CodexOnboardingRuntimeError,
  prepareRuntimeRestartBinding, persistRestartBarrier, readCurrentRuntimeReadback,
  readRestartBarrier, removeRestartBarrierCas, runtimeRestartBindingCurrent,
} from "./codex-onboarding-runtime.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";
import { planSessionCleanupRecovery } from "./session-cleanup-recovery.mjs";
import {
  LEGACY_CALIBRATION,
  LEGACY_STATE,
  NEUTRAL_CALIBRATION,
  NEUTRAL_MANIFEST,
  NEUTRAL_STATE,
  planProjectAuthorityMigration,
  planProjectAuthoritySessionCleanupRecovery,
  inspectProjectAuthorityProvenance,
  readProjectAuthority,
  resolveProjectAuthorityPaths,
} from "./project-authority.mjs";
import { derivePlanLifecycle } from "./plan-spec-state-v2.mjs";
import { discoverRepository } from "./worktree-lifecycle.mjs";

const SOURCE = "pipeline.user.yaml";
const SCHEMA = "pipeline.project-onboarding.v4";
const LEGACY_SCHEMA = "pipeline.project-onboarding.v3";
const PLAN_SCHEMA = "pipeline.project-onboarding-plan.v3";
const REMOTE_ADOPTION_PLAN_SCHEMA = "pipeline.project-onboarding-remote-adoption-plan.v1";
const SOURCE_RECOVERY_SCHEMA = "pipeline.project-onboarding-source-recovery.v1";
const MANIFEST_REPAIR_PLAN_SCHEMA = "pipeline.project-onboarding-manifest-repair-plan.v1";
const PARTIAL_AUTHORITY_PLAN_SCHEMA = "pipeline.project-onboarding-partial-authority-plan.v1";
const PARTIAL_AUTHORITY_SOURCE = "canonical-fresh-v3";
const REINSTALL_PLAN_SCHEMA = "pipeline.project-onboarding-reinstall-plan.v1";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const AUTHENTICATED = new WeakMap();
const AUTHENTICATED_MANIFEST_REPAIRS = new WeakMap();
const USER_RESERVED_PATHS = new Set([".agents", ".claude", ".codex", "project"]);
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));
const SESSION_CLEANUP_SCRIPT = fileURLToPath(new URL("../scripts/session-cleanup.mjs", import.meta.url));
const PO_AUTHORITY_REBIND_WRITER = fileURLToPath(new URL("../scripts/pipeline-state.mjs", import.meta.url));
const PO_PROFILE_REPAIR_WRITER = fileURLToPath(new URL("../scripts/po-gate-profile-repair.mjs", import.meta.url));
const PROJECT_AUTHORITY_MIGRATION_WRITER = fileURLToPath(new URL("../scripts/project-authority-migration.mjs", import.meta.url));
const SHA256_RE = /^[a-f0-9]{64}$/u;
const REMOTE_REF_RE = /^refs\/heads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/u;
const MANIFEST_REPAIR_SCHEMA = "pipeline.project-onboarding-manifest-repair-plan.v1";

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function diagnostic(path, code, message, repair) { return { path, code, message, repair }; }
function bytesOf(value) { return Buffer.isBuffer(value) ? value : Buffer.from(value, "utf8"); }
function describe(bytes) {
  if (bytes === null) return { status: "absent", sha256: null, byteLength: 0 };
  const raw = bytesOf(bytes);
  return { status: "present", sha256: sha256(raw), byteLength: raw.byteLength };
}
function decodeUtf8Strict(bytes, label) {
  const raw = bytesOf(bytes);
  let decoded;
  try {
    decoded = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(raw);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (Buffer.from(decoded, "utf8").compare(raw) !== 0) throw new Error(`${label} is not canonical UTF-8`);
  return decoded;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}
function renderScalar(value) {
  if (typeof value === "string") return JSON.stringify(value).replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e");
  if (typeof value === "boolean" || Number.isInteger(value)) return String(value);
  throw new Error("unsupported V3 YAML scalar");
}
function renderYaml(value, indent = "") {
  if (Array.isArray(value)) return value.map((item) => (item && typeof item === "object")
    ? `${indent}-\n${renderYaml(item, `${indent}  `)}` : `${indent}- ${renderScalar(item)}\n`).join("");
  return Object.keys(value).sort().map((key) => {
    const child = value[key];
    return child && typeof child === "object" ? `${indent}${key}:\n${renderYaml(child, `${indent}  `)}` : `${indent}${key}: ${renderScalar(child)}\n`;
  }).join("");
}
function deps(overrides = {}) {
  return {
    accessSync, closeSync, constants, existsSync, fstatSync, fsyncSync, lstatSync, mkdirSync, openSync,
    linkSync, readdirSync, realpathSync, readFileSync, renameSync, rmSync, rmdirSync, unlinkSync, writeFileSync,
    spawnSync, observeCodexOnboardingCapabilities, observeOnboardingAppServer, ...overrides,
  };
}
function safeRoot(rootDir, fs) {
  if (typeof rootDir !== "string" || rootDir.length === 0) throw new Error("root must be a non-empty path");
  const requested = resolve(rootDir);
  const info = fs.lstatSync(requested);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("root must be a real directory, not a symbolic link");
  return fs.realpathSync(requested);
}
function safePath(root, relative, fs) {
  if (!SAFE_RELATIVE.test(relative)) throw new Error(`unsafe project-relative path: ${relative}`);
  const target = resolve(root, relative);
  if (!target.startsWith(`${root}${sep}`)) throw new Error(`path escapes project root: ${relative}`);
  let cursor = root;
  for (const part of relative.split("/")) {
    cursor = join(cursor, part);
    if (!fs.existsSync(cursor)) break;
    const info = fs.lstatSync(cursor);
    if (info.isSymbolicLink()) throw new Error(`project path contains a symbolic link: ${relative}`);
    if (cursor !== target && !info.isDirectory()) throw new Error(`project path has a non-directory parent: ${relative}`);
  }
  return target;
}

function projectAuthorityPaths(root, fs) {
  if (typeof fs.resolveProjectAuthorityPaths === "function") {
    return fs.resolveProjectAuthorityPaths(root);
  }
  const resolved = resolveProjectAuthorityPaths({ rootDir: root });
  if (resolved.status === "ready") return resolved;
  const neutralState = safePath(root, NEUTRAL_STATE, fs);
  const legacyState = safePath(root, LEGACY_STATE, fs);
  const neutral = fs.existsSync(neutralState) || !fs.existsSync(legacyState);
  return {
    status: "compatibility",
    source: neutral ? "neutral" : "legacy",
    state: neutral ? NEUTRAL_STATE : LEGACY_STATE,
    calibration: neutral ? NEUTRAL_CALIBRATION : LEGACY_CALIBRATION,
  };
}
function rootEntries(root, fs) {
  return fs.readdirSync(root).sort().map((name) => {
    const path = join(root, name);
    const info = fs.lstatSync(path);
    let writable = false;
    try { fs.accessSync(path, fs.constants.W_OK); writable = true; } catch {}
    let empty = false;
    if (info.isDirectory() && !info.isSymbolicLink()) {
      try { empty = fs.readdirSync(path).length === 0; } catch {}
    }
    return { name, symlink: info.isSymbolicLink(), directory: info.isDirectory(), file: info.isFile(), writable, empty };
  });
}

/**
 * Read-only recovery planning for an old, incomplete Pipeline authority.
 * This deliberately inventories user surfaces but does not infer a V3 source
 * from legacy calibration and does not create any target.
 */
export function planProjectPartialAuthorityAdoption({ rootDir = process.cwd(), profile = null, source = null, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "unsafe-root", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a physical project root")] };
  }
  const legacy = safePath(root, LEGACY_CALIBRATION, fs);
  const v3 = safePath(root, SOURCE, fs);
  if (!fs.existsSync(legacy) || fs.existsSync(v3)) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.authority", "partial_authority_not_applicable", "the legacy-without-V3 recovery shape is absent", "use the lifecycle action returned for the current authority shape")] };
  }
  const supportedProfiles = ["epic", "feature", "mini"];
  if (!supportedProfiles.includes(profile) || source !== PARTIAL_AUTHORITY_SOURCE) {
    return {
      schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "selection-required", root,
      selection: { profiles: supportedProfiles, sources: [PARTIAL_AUTHORITY_SOURCE] },
      diagnostics: [diagnostic("$.selection", "partial_authority_selection_required", "no explicit reconstructable V3 authority selection is bound", "re-run plan-partial-authority with --profile and --source canonical-fresh-v3 after PO selection")],
    };
  }
  const paths = [".claude", ".agents", ".codex", "docs"].filter((relative) => fs.existsSync(safePath(root, relative, fs))).sort();
  try {
    const artifacts = paths.map((relative) => ({ path: relative, snapshot: physicalTreeSnapshot(safePath(root, relative, fs), fs) }));
    const intent = freshIntent();
    if (!validatePipelineUserV3(intent).ok) throw new Error("canonical V3 source is invalid");
    const baselines = freshBaselines(intent);
    const targets = [
      { path: SOURCE, bytes: renderYaml(intent) },
      { path: ".claude/pipeline.yaml", bytes: baselines[".claude/pipeline.yaml"].bytes },
      { path: NEUTRAL_MANIFEST, bytes: baselines[NEUTRAL_MANIFEST].bytes },
    ].sort((left, right) => left.path.localeCompare(right.path));
    for (const target of targets) if (fs.existsSync(safePath(root, target.path, fs))) throw new Error(`Pipeline-owned target already exists: ${target.path}`);
    const plan = { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "ready", root, selection: { profile, source }, artifacts, targets: targets.map((target) => ({ path: target.path, before: describe(null), after: describe(target.bytes) })), mutation: false };
    const planSha256 = sha256(JSON.stringify(stable(plan)));
    return { ...plan, planSha256, applyAction: commandAction([ONBOARDING_SCRIPT, "apply-partial-authority", "--root", root, "--profile", profile, "--source", source, "--plan-sha256", planSha256, "--activate"], true, true, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["applied", "runtime-initialization-required", "kickoff-required"]) };
  } catch (error) {
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "inventory-unavailable", root, diagnostics: [diagnostic("$.artifacts", "partial_authority_inventory_unavailable", error.message, "repair unsafe or unreadable user paths before planning")] };
  }
}

export function applyProjectPartialAuthorityAdoption({ rootDir = process.cwd(), profile = null, source = null, planSha256, activate = false, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  if (!activate || !SHA256_RE.test(planSha256 ?? "")) return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the digest-bound plan and pass --activate")] };
  const plan = planProjectPartialAuthorityAdoption({ rootDir, profile, source, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "invalid-plan", root: plan.root, diagnostics: [diagnostic("$.planSha256", "plan_digest_mismatch", "the supplied plan digest is not current", "run the read-only partial-authority plan again")] };
  const root = plan.root; const created = []; const createdDirectories = [];
  try {
    const intent = freshIntent(); const baselines = freshBaselines(intent);
    const bytes = new Map([[SOURCE, renderYaml(intent)], [".claude/pipeline.yaml", baselines[".claude/pipeline.yaml"].bytes], [NEUTRAL_MANIFEST, baselines[NEUTRAL_MANIFEST].bytes]]);
    for (const target of plan.targets) {
      const path = safePath(root, target.path, fs);
      if (fs.existsSync(path)) throw new Error(`target appeared during activation: ${target.path}`);
      ensureTargetParents(root, path, createdDirectories, fs);
      fs.writeFileSync(path, bytes.get(target.path), { encoding: "utf8", flag: "wx", mode: 0o600 });
      const identity = fileIdentity(fs.lstatSync(path)); if (!identity) throw new Error(`created target identity is unavailable: ${target.path}`);
      created.push({ path, identity });
    }
    const after = inspectProjectOnboardingV3({ rootDir: root, deps: fs });
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: "applied", root, changes: plan.targets.map((target) => target.path), postInspection: after };
  } catch (error) {
    const failures = rollback(root, created, createdDirectories, null, null, false, fs);
    return { schema: PARTIAL_AUTHORITY_PLAN_SCHEMA, status: failures.length ? "rollback-failed" : "rolled-back", root, diagnostics: [diagnostic("$.transaction", failures.length ? "rollback_failed" : "apply_failed", error.message, "repair the root and run the typed plan again")] };
  }
}

/**
 * Reinstall is deliberately an authority-only transaction.  It never treats
 * legacy calibration, skills, hooks, docs, or runner directories as owned.
 */
export function planProjectOnboardingReinstall({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); let root;
  try { root = safeRoot(rootDir, fs); } catch (error) { return { schema: REINSTALL_PLAN_SCHEMA, status: "unrepairable", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a physical project root")] }; }
  const sourcePath = safePath(root, SOURCE, fs); const manifestPath = safePath(root, ".claude/pipeline.yaml", fs);
  let source;
  try { source = readBoundPhysicalFile(sourcePath, fs); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.source", "reinstall_source_unavailable", "a current V3 source is required for a reversible reinstall", "use partial-authority adoption for legacy or absent V3 authority")] }; }
  let intent; let projection;
  try {
    intent = parseYaml(decodeUtf8Strict(source, SOURCE));
    if (!validatePipelineUserV3(intent).ok) throw new Error("invalid V3 source");
    projection = planRuntimeProjectionV3(intent, { source: SOURCE, baselines: currentRuntimeBaselines(root, intent, fs) });
  } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.source", "reinstall_source_unowned", "the V3 source cannot prove a current owned projection", "use the source-owning recovery route")] }; }
  const expected = projection.targets.find((target) => target.path === ".claude/pipeline.yaml")?.after?.bytes;
  let manifest;
  try { manifest = readBoundPhysicalFile(manifestPath, fs); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.manifest", "reinstall_manifest_unavailable", "the generated manifest is unavailable", "use the manifest repair route")] }; }
  if (typeof expected !== "string" || Buffer.compare(manifest, Buffer.from(expected, "utf8")) !== 0) return { schema: REINSTALL_PLAN_SCHEMA, status: "not-applicable", root, diagnostics: [diagnostic("$.manifest", "reinstall_manifest_unowned", "the existing manifest is not the current generated V3 projection", "repair or preserve it through its owning workflow")] };
  let repository;
  try { repository = discoverRepository(root, { spawn: fs.spawnSync }); } catch { return { schema: REINSTALL_PLAN_SCHEMA, status: "private-store-unavailable", root, diagnostics: [diagnostic("$.repository", "reinstall_private_store_unavailable", "the physical Git common directory is unavailable", "restore local Git capability before retrying")] }; }
  const targets = [{ path: SOURCE, before: describe(source) }, { path: ".claude/pipeline.yaml", before: describe(manifest) }];
  const binding = { schema: REINSTALL_PLAN_SCHEMA, root, commonDir: repository.commonDir, targets };
  const planSha256 = sha256(JSON.stringify(stable(binding)));
  return { ...binding, status: "ready", planSha256, mutation: false, applyAction: commandAction([ONBOARDING_SCRIPT, "apply-reinstall", "--root", root, "--plan-sha256", planSha256, "--activate"], true, true, REINSTALL_PLAN_SCHEMA, ["applied"]) };
}

export function applyProjectOnboardingReinstall({ rootDir = process.cwd(), planSha256, activate = false, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  if (!activate || !SHA256_RE.test(planSha256 ?? "")) return { schema: REINSTALL_PLAN_SCHEMA, status: "activation-required" };
  const plan = planProjectOnboardingReinstall({ rootDir, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: REINSTALL_PLAN_SCHEMA, status: "invalid-plan", root: plan.root };
  const archive = join(plan.commonDir, "agent-pipeline", "reinstall-quarantine", planSha256);
  const moved = [];
  try {
    fs.mkdirSync(archive, { recursive: true, mode: 0o700 });
    for (const target of plan.targets) {
      const source = safePath(plan.root, target.path, fs); const bytes = readBoundPhysicalFile(source, fs);
      if (sha256(bytes) !== target.before.sha256) throw new Error(`preimage changed: ${target.path}`);
      const destination = join(archive, target.path.replaceAll("/", "__"));
      if (fs.existsSync(destination)) throw new Error(`quarantine collision: ${target.path}`);
      fs.renameSync(source, destination); moved.push({ source, destination });
    }
    fs.writeFileSync(join(archive, "receipt.json"), `${JSON.stringify({ schema: REINSTALL_PLAN_SCHEMA, planSha256, targets: plan.targets })}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { schema: REINSTALL_PLAN_SCHEMA, status: "applied", root: plan.root, quarantine: { status: "private", planSha256 }, changes: plan.targets.map((target) => target.path) };
  } catch (error) {
    const failures = [];
    for (const entry of moved.reverse()) try { if (!fs.existsSync(entry.source) && fs.existsSync(entry.destination)) fs.renameSync(entry.destination, entry.source); } catch (rollbackError) { failures.push(rollbackError); }
    return { schema: REINSTALL_PLAN_SCHEMA, status: failures.length ? "rollback-failed" : "rolled-back", root: plan.root, diagnostics: [diagnostic("$.transaction", failures.length ? "reinstall_rollback_failed" : "reinstall_apply_failed", error.message, "inspect the private quarantine before retrying")] };
  }
}
function runtimePaths() { return loadRuntimeProjectionV3OwnedKeys().targets.map((target) => target.path).sort(); }
function hasOwnRuntime(root, fs) { return runtimePaths().some((relative) => fs.existsSync(safePath(root, relative, fs))); }

function fsyncDirectory(path, fs) {
  let fd;
  try {
    fd = fs.openSync(path, "r");
    fs.fsyncSync(fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function sameIdentity(expected, path, fs) {
  try {
    const actual = fs.lstatSync(path);
    return !actual.isSymbolicLink()
      && actual.isFile()
      && actual.nlink === 1
      && String(actual.dev) === expected.dev
      && String(actual.ino) === expected.ino;
  } catch {
    return false;
  }
}

function sameFileObject(expected, path, fs) {
  try {
    const actual = fs.lstatSync(path);
    return !actual.isSymbolicLink()
      && actual.isFile()
      && actual.nlink >= 1
      && String(actual.dev) === expected.dev
      && String(actual.ino) === expected.ino;
  } catch {
    return false;
  }
}

function fileIdentity(info) {
  return info && !info.isSymbolicLink() && info.isFile() && info.nlink === 1
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

function directoryIdentity(info) {
  return info && !info.isSymbolicLink() && info.isDirectory()
    ? { dev: String(info.dev), ino: String(info.ino) }
    : null;
}

function sameDirectoryIdentity(expected, path, fs) {
  try {
    const actual = directoryIdentity(fs.lstatSync(path));
    return actual !== null && actual.dev === expected.dev && actual.ino === expected.ino;
  } catch {
    return false;
  }
}

function readBoundPhysicalFile(path, fs, { optional = false } = {}) {
  let fd;
  try {
    let before;
    try { before = fileIdentity(fs.lstatSync(path)); } catch (error) {
      if (optional && error?.code === "ENOENT") return null;
      throw error;
    }
    if (!before) throw new Error("project file is not a single-link physical file");
    fd = fs.openSync(path, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0));
    const opened = fileIdentity(fs.fstatSync(fd));
    if (!opened || opened.dev !== before.dev || opened.ino !== before.ino) {
      throw new Error("project file identity changed before read");
    }
    const bytes = fs.readFileSync(fd);
    const after = fileIdentity(fs.fstatSync(fd));
    if (!after || after.dev !== opened.dev || after.ino !== opened.ino || !sameIdentity(opened, path, fs)) {
      throw new Error("project file identity changed during read");
    }
    return bytesOf(bytes);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function openBoundDirectory(path, fs) {
  const before = directoryIdentity(fs.lstatSync(path));
  if (!before || fs.realpathSync(path) !== path) throw new Error("manifest parent is not a physical directory");
  const fd = fs.openSync(
    path,
    fs.constants.O_RDONLY | (fs.constants.O_DIRECTORY ?? 0) | (fs.constants.O_NOFOLLOW ?? 0),
  );
  const opened = directoryIdentity(fs.fstatSync(fd));
  if (!opened || opened.dev !== before.dev || opened.ino !== before.ino || !sameDirectoryIdentity(opened, path, fs)) {
    fs.closeSync(fd);
    throw new Error("manifest parent identity changed before publication");
  }
  return { fd, identity: opened, path };
}

function boundDirectoryEntry(directory, name, fs) {
  if (name !== basename(name) || name === "." || name === "..") throw new Error("manifest entry name is unsafe");
  const candidates = process.platform === "linux"
    ? [`/proc/self/fd/${directory.fd}`]
    : process.platform === "win32" ? [] : [`/dev/fd/${directory.fd}`, `/proc/self/fd/${directory.fd}`];
  const descriptorRoot = candidates.find((candidate) => {
    try { return fs.existsSync(candidate); } catch { return false; }
  });
  if (descriptorRoot) return join(descriptorRoot, name);
  if (process.platform === "win32" && sameDirectoryIdentity(directory.identity, directory.path, fs)) {
    return join(directory.path, name);
  }
  throw new Error("fd-relative manifest publication is unavailable");
}

function syncBoundDirectory(directory, fs) {
  try {
    fs.fsyncSync(directory.fd);
  } catch (error) {
    if (!(process.platform === "win32"
      && ["EPERM", "EINVAL", "EISDIR", "EACCES", "ENOTSUP"].includes(error?.code))) throw error;
  }
  const after = directoryIdentity(fs.fstatSync(directory.fd));
  if (!after || after.dev !== directory.identity.dev || after.ino !== directory.identity.ino
    || !sameDirectoryIdentity(directory.identity, directory.path, fs)) {
    throw new Error("manifest parent identity changed during publication");
  }
}

function quarantineManifestPublication(directory, target, expected, planSha256, fs) {
  if (!expected || !sameFileObject(expected, target, fs)) return false;
  const quarantine = boundDirectoryEntry(
    directory,
    `.pipeline-manifest-repair-quarantine-${planSha256.slice(0, 24)}-${randomBytes(8).toString("hex")}`,
    fs,
  );
  try {
    fs.renameSync(target, quarantine);
  } catch {
    return false;
  }
  if (sameFileObject(expected, quarantine, fs)) return true;
  try {
    fs.linkSync(quarantine, target);
  } catch {}
  return false;
}

function recoverProbeIdentity(fd, path, candidate, fs) {
  let descriptor = null;
  try { if (fd !== undefined) descriptor = fileIdentity(fs.fstatSync(fd)); } catch {}
  let current = null;
  try { current = fileIdentity(fs.lstatSync(path)); } catch {}
  if (descriptor && current && descriptor.dev === current.dev && descriptor.ino === current.ino) return current;
  if (candidate && current && candidate.dev === current.dev && candidate.ino === current.ino) return current;
  return null;
}

function cleanupRuntimeProbe(path, identity, fs) {
  if (!fs.existsSync(path)) return;
  if (!identity || !sameIdentity(identity, path, fs)) {
    throw new Error("runtime capability probe changed identity before rollback");
  }
  fs.unlinkSync(path);
}

function nearestExistingPhysicalParent(root, relative, fs) {
  const target = safePath(root, relative, fs);
  let parent = dirname(target);
  while (!fs.existsSync(parent)) {
    const next = dirname(parent);
    if (next === parent || (next !== root && !next.startsWith(`${root}${sep}`))) {
      throw new Error("runtime target has no safe project-local parent");
    }
    parent = next;
  }
  const info = fs.lstatSync(parent);
  if (!info.isDirectory() || info.isSymbolicLink() || fs.realpathSync(parent) !== parent) {
    throw new Error("runtime target parent is not a physical directory");
  }
  return parent;
}

function selectedRuntimeTargetParents(root, fs) {
  return [...new Set(runtimePaths()
    .filter((relative) => relative.startsWith(".codex/"))
    .map((relative) => nearestExistingPhysicalParent(root, relative, fs)))].sort();
}

/**
 * Prove each distinct selected Codex target parent can support the migration
 * transaction. Every byte is disposable and identity-bound; cleanup controls
 * over the primary failure so a leaked/foreign path can never be ignored.
 */
function probeSelectedRuntimeTargets(root, fs) {
  const parents = selectedRuntimeTargetParents(root, fs);
  for (const parent of parents) {
    const suffix = randomBytes(18).toString("hex");
    const source = join(parent, `.pipeline-runtime-capability-${suffix}.tmp`);
    const target = join(parent, `.pipeline-runtime-capability-${suffix}.renamed`);
    let fd;
    let identity = null;
    let createdIdentity = null;
    let primaryError = null;
    try {
      fd = fs.openSync(
        source,
        fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
        0o600,
      );
      createdIdentity = fileIdentity(fs.lstatSync(source));
      const opened = fileIdentity(fs.fstatSync(fd));
      if (!createdIdentity || !opened
        || createdIdentity.dev !== opened.dev
        || createdIdentity.ino !== opened.ino) throw new Error("runtime capability probe identity is unavailable");
      identity = opened;
      fs.writeFileSync(fd, Buffer.from("runtime-capability-probe", "utf8"));
      fs.fsyncSync(fd);
      fs.closeSync(fd);
      fd = undefined;
      fs.renameSync(source, target);
      fsyncDirectory(parent, fs);
    } catch (error) {
      primaryError = error;
    }
    identity ??= recoverProbeIdentity(fd, source, createdIdentity, fs)
      ?? recoverProbeIdentity(fd, target, createdIdentity, fs);
    const cleanupErrors = [];
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch (error) { cleanupErrors.push(error); }
    }
    try { cleanupRuntimeProbe(source, identity, fs); } catch (error) { cleanupErrors.push(error); }
    try { cleanupRuntimeProbe(target, identity, fs); } catch (error) { cleanupErrors.push(error); }
    try { fsyncDirectory(parent, fs); } catch (error) { cleanupErrors.push(error); }
    if (cleanupErrors.length > 0) throw cleanupErrors[0];
    if (primaryError) throw primaryError;
  }
}

function isHostControlLayout(root, entries, fs) {
  return (entries.length === 1 && entries[0].name === ".git" && hasCodexGitControlMount(root, {
    access: fs.accessSync,
    fsConstants: fs.constants,
    lstat: fs.lstatSync,
    readdir: fs.readdirSync,
  })) || (entries.length >= 2 && entries.length <= CODEX_HOST_CONTROL_PATHS.length
    && entries.every((entry) => CODEX_HOST_CONTROL_PATHS.includes(entry.name))
    && [".codex", ".git"].every((name) => entries.some((entry) => entry.name === name))
    && hasCodexHostControlLayout(root, {
      access: fs.accessSync,
      fsConstants: fs.constants,
      lstat: fs.lstatSync,
      readdir: fs.readdirSync,
    }));
}

function isExistingGitMetadata(entry, root, fs) {
  if (entry.name !== ".git" || entry.symlink) return false;
  const path = join(root, ".git");
  if (entry.directory) return fs.existsSync(join(path, "HEAD")) && fs.existsSync(join(path, "objects"));
  if (!entry.file) return false;
  let pointer;
  try { pointer = fs.readFileSync(path, "utf8"); } catch { return false; }
  // A linked worktree keeps a regular `.git` pointer file rather than a
  // directory. Require Git to validate that pointer before treating it as
  // preserved project metadata; malformed user bytes remain fail-closed.
  if (!/^gitdir: [^\r\n\0]+\r?\n?$/u.test(pointer)) return false;
  const probe = fs.spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, encoding: "utf8" });
  return probe.status === 0 && String(probe.stdout ?? "").trim() === "true";
}

function isAdoptableUnmanagedRoot(entries, root, fs) {
  return entries.length > 0 && entries.every((entry) => {
    if (entry.name === ".git") return isExistingGitMetadata(entry, root, fs);
    return !USER_RESERVED_PATHS.has(entry.name) && !entry.symlink;
  });
}

function freshIntent() {
  const registry = loadRunnerProfilesV3Registry();
  return {
    schema: "pipeline.user.v3",
    language: { human_facing: "en", agent_facing: "en" },
    agent_runtime: "other",
    runners: { enabled: ["claude", "codex"], default: "codex" },
    routing: { profiles: clone(registry.profiles), duties: clone(registry.duties) },
    usage: { common_projection: "pipeline.runner-usage.v1", raw_persistence: "none" },
    autonomy: { push_policy: "gated", branch_model: "feature-branch", wip_limit: 1 },
    gates: { dev_plan: "blocking", push: "blocking", security: "warn", claude_md_max_lines: 200 },
    critic_export: clone(registry.criticExportPolicy),
    roles: { po: { display_label: "PO" } },
    session: { keep_awake: false },
    advisor_export: { consent: "declined" },
  };
}
function freshBaselines(intent, { hostManaged = false } = {}) {
  const baselines = {
    ".claude/settings.json": { status: "present", bytes: "{}\n" },
    // `git diff --check` is deliberately HEAD-independent: onboarding creates
    // no commit, so `git diff --check HEAD` would make the one verify command
    // fail before the user's initial commit exists.
    ".claude/pipeline.json": { status: "present", bytes: `${JSON.stringify({ project: "new-project", verify: "git diff --check", handover: "docs/state.md", autonomy: "gated", branchModel: "feature-branch", repositoryMode: hostManaged ? "host-managed" : "local-only", worktree: "optional", stakes: "standard", constraints: [hostManaged ? "Codex owns .git and .codex; configure project verification before delivery." : "Configure project-specific policy before delivery."] }, null, 2)}\n` },
    ".claude/pipeline.yaml": { status: "present", bytes: "schema: pipeline.manifest.v0\nlanguage:\n  human_facing: en\nmodelRouting:\n  legacy:\n    model: legacy\n    effort: low\n" },
    ".codex/config.toml": { status: "present", bytes: "" },
    ".codex/agents/implementor.toml": { status: "present", bytes: codexCustomAgentSeed("implementor") },
    ".codex/agents/critic.toml": { status: "present", bytes: codexCustomAgentSeed("critic") },
    ".codex/agents/consult-advisor.toml": { status: "present", bytes: "" },
  };
  const projection = planRuntimeProjectionV3(intent, { baselines });
  if (projection.status !== "ready") throw new Error("fresh V3 runtime projection is invalid");
  for (const target of projection.targets.filter((entry) => entry.path.startsWith(".claude/"))) {
    if (target.after?.status !== "present" || typeof target.after.bytes !== "string") {
      throw new Error(`fresh V3 runtime target is invalid: ${target.path}`);
    }
    baselines[target.path] = { status: "present", bytes: target.after.bytes };
  }
  baselines[NEUTRAL_CALIBRATION] = {
    status: "present",
    bytes: baselines[".claude/pipeline.json"].bytes,
  };
  baselines[NEUTRAL_MANIFEST] = {
    status: "present",
    bytes: baselines[".claude/pipeline.yaml"].bytes,
  };
  return baselines;
}
function gitCapability(fs, root) {
  const observation = fs.spawnSync("git", ["--version"], { cwd: root, encoding: "utf8" });
  if (observation.error || observation.status !== 0) return { ok: false, reason: "git --version failed" };
  const match = String(observation.stdout ?? "").match(/git version (\d+)\.(\d+)(?:\.(\d+))?/u);
  if (!match) return { ok: false, reason: "Git version is not recognizable" };
  const major = Number(match[1]); const minor = Number(match[2]);
  if (major < 2 || (major === 2 && minor < 28)) return { ok: false, reason: "Git 2.28 or newer is required for --initial-branch" };
  return { ok: true, version: match[0] };
}
function legacyInspection(rootDir, fs) {
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) { return { schema: LEGACY_SCHEMA, status: "unsafe", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a real non-symlink directory")] }; }
  let entries;
  try { entries = rootEntries(root, fs); } catch (error) { return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.root", "root_unreadable", error.message, "repair root access before onboarding")] }; }
  const link = entries.find((entry) => entry.symlink);
  if (link) return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic(`$.entries.${link.name}`, "symlink_entry", "fresh onboarding rejects symbolic links", "use a real empty directory")], entries: entries.map((entry) => entry.name) };
  if (entries.length === 0) return { schema: LEGACY_SCHEMA, status: "fresh", root, diagnostics: [], entries: [] };
  if (isHostControlLayout(root, entries, fs)) {
    return {
      schema: LEGACY_SCHEMA,
      status: "fresh-host-managed",
      root,
      diagnostics: [diagnostic(
        "$.entries",
        "host_managed_fresh_root",
        "Codex owns the empty, non-writable .git and .codex control paths (plus .agents when present); onboarding will create only portable project authority outside them",
        "review the host-managed plan and activate it; do not remove, overwrite, chmod, or relocate the reserved paths",
      )],
      entries: entries.map((entry) => entry.name),
    };
  }
  const sourcePath = safePath(root, SOURCE, fs);
  if (fs.existsSync(sourcePath)) {
    const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
    if (migrated.status === "ready" && ["v0", "v1", "v2"].includes(migrated.sourceKind)) {
      return { schema: LEGACY_SCHEMA, status: "migration-required", root, sourceKind: migrated.sourceKind, diagnostics: [diagnostic("$.source", "legacy_source", "the root has a legacy pipeline authority", "use runner-profile-migration-v3 inspect, plan, then apply --activate")], entries: entries.map((entry) => entry.name) };
    }
    if (migrated.status === "ready" && migrated.sourceKind === "v3-refresh") {
      return { schema: LEGACY_SCHEMA, status: "migration-required", root, sourceKind: migrated.sourceKind, diagnostics: [diagnostic("$.source", "stale_generated_projection", "the V3 source uses a recognized older generated registry projection", "review and apply the closed V3 registry refresh")], entries: entries.map((entry) => entry.name) };
    }
    if (migrated.status === "ready" && migrated.sourceKind === "v3") {
      const authority = validateV3BootstrapAuthority({ rootDir: root, deps: fs });
      if (["projection-current", "restart-required", "ready"].includes(authority.status)
        || authority.runtimeProjection === "noop") {
        return { schema: LEGACY_SCHEMA, status: "ready", root, diagnostics: [], entries: entries.map((entry) => entry.name) };
      }
    }
  }
  let runtimePresent;
  try { runtimePresent = hasOwnRuntime(root, fs); }
  catch (error) {
    return { schema: LEGACY_SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.runtime", "unsafe_runtime_path", error.message, "remove symbolic links before onboarding")], entries: entries.map((entry) => entry.name) };
  }
  if (!runtimePresent && !fs.existsSync(sourcePath) && isAdoptableUnmanagedRoot(entries, root, fs)) {
    return {
      schema: LEGACY_SCHEMA,
      status: "existing-unmanaged",
      root,
      diagnostics: [diagnostic(
        "$.root",
        "adoption_required",
        "the root contains an existing project without Pipeline authority; only absent, conflict-free Pipeline targets may be added after explicit activation",
        "review the adoption plan and pass apply --activate; existing project files and Git history stay untouched",
      )],
      entries: entries.map((entry) => entry.name),
    };
  }
  const code = runtimePresent || fs.existsSync(sourcePath) ? "partial_v3_state" : "unrelated_entries";
  return { schema: LEGACY_SCHEMA, status: "partial", root, diagnostics: [diagnostic("$.root", code, "the root is not a brand-new empty project directory", "do not overwrite it; inspect or repair its existing authority explicitly")], entries: entries.map((entry) => entry.name) };
}

function lifecycleDiagnostic(path, code, message, guidance = "") {
  return { path, code, message: String(message).replace(/[\r\n]+/gu, " "), guidance: String(guidance).replace(/[\r\n]+/gu, " ") };
}

function emptyRuntime(status = "not-observed") {
  return { status, sourceSha256: null, targetsSha256: null, barrierSha256: null, readbackSha256: null };
}

const RUNTIME_FAILURES = Object.freeze({
  "runtime-executable-unavailable": {
    code: "runtime_executable_unavailable",
    message: "the trusted Codex runtime executable is unavailable",
    guidance: "install or expose the physical platform executable before retrying",
  },
  "runtime-executable-unsafe": {
    code: "runtime_executable_unsafe",
    message: "the discovered Codex runtime executable is unsafe",
    guidance: "remove linked or wrapper candidates and expose the physical platform executable",
  },
  "private-state-assurance-unavailable": {
    code: "private_state_assurance_unavailable",
    message: "private restart-state assurance is unavailable",
    guidance: "restore the platform owner/access inspector before retrying",
  },
  "private-state-object-unsafe": {
    code: "private_state_object_unsafe",
    message: "a private restart-state object is unsafe",
    guidance: "repair the owner-only physical private-state boundary before retrying",
  },
  "writer-lock-unavailable": {
    code: "writer_lock_unavailable",
    message: "the private restart-state writer lock is unavailable",
    guidance: "inspect the typed writer-lock state before retrying",
  },
});

function runtimeFailureResult(base, error, {
  phase,
  code,
  message,
  guidance,
} = {}) {
  const typed = error instanceof CodexOnboardingRuntimeError ? RUNTIME_FAILURES[error.code] : null;
  const failurePhase = error instanceof CodexOnboardingRuntimeError ? error.phase : phase;
  const failure = typed ?? { code, message, guidance };
  return lifecycleResult({
    status: "runtime-readback-unavailable",
    root: base.root,
    intent: base.intent,
    repository: base.repository,
    runtime: emptyRuntime("readback-unavailable"),
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      `$.runtime.${failurePhase}`,
      failure.code,
      failure.message,
      failure.guidance,
    )],
  });
}

function emptyContinuity() { return { status: "unavailable", stateSha256: null, handoverSha256: null, historySha256: null }; }

function emptyAppServer() { return { required: false, status: "not-requested", code: null }; }

function partialCleanupRecoveryResult({
  root,
  intent,
  repository,
  runtime = emptyRuntime(),
  deps = {},
  strict = false,
}) {
  try {
    const planCleanupRecovery = deps.planSessionCleanupRecovery
      ?? planSessionCleanupRecovery;
    const recovery = planCleanupRecovery({
      rootDir: root,
      scriptPath: SESSION_CLEANUP_SCRIPT,
    });
    const nextAction = recovery.status === "ready"
      ? recovery.applyAction
      : new Set(["cleanup-required", "release-ready"]).has(recovery.status)
        ? recovery.nextAction ?? null
        : null;
    if (nextAction !== null) {
      return lifecycleResult({
        status: "partial",
        root,
        intent,
        repository,
        runtime,
        nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_required",
          "exact retained cleanup residue blocks authority completion",
          "apply only the descriptor- and digest-bound cleanup recovery action",
        )],
      });
    }
    if (new Set([
      "closed-recovery-unavailable",
      "orphan-cleanup-required",
      "orphan-recovery-unavailable",
    ]).has(recovery.status)) {
      return lifecycleResult({
        status: "partial",
        root,
        intent,
        repository,
        runtime,
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_unavailable",
          "cleanup residue lacks sufficient exact recovery proof",
          "retain the state and request an explicit authority decision; do not guess, replace, or delete a descriptor",
        )],
      });
    }
  } catch {
    if (strict) {
      return lifecycleResult({
        status: "partial",
        root,
        intent,
        repository,
        runtime,
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.sessionCleanup",
          "cleanup_recovery_observation_unavailable",
          "cleanup recovery authority could not be observed safely",
          "repair private cleanup-state read access before retrying",
        )],
      });
    }
    // Other partial-authority states remain owned by their existing typed
    // source/manifest diagnostics. Never infer cleanup authority from failure.
  }
  return null;
}

function persistedPoAuthority(root, fs) {
  try {
    const path = safePath(root, projectAuthorityPaths(root, fs).state, fs);
    const before = fs.lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || fs.realpathSync(path) !== path) {
      return { status: "unavailable" };
    }
    const bytes = fs.readFileSync(path);
    const after = fs.lstatSync(path);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
      || before.dev !== after.dev || before.ino !== after.ino
      || before.mode !== after.mode || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || fs.realpathSync(path) !== path) {
      return { status: "unavailable" };
    }
    const state = JSON.parse(bytes.toString("utf8"));
    const continuity = state?.continuity?.authority;
    const lifecycle = derivePlanLifecycle(state, {
      ...(SHA256_RE.test(continuity?.prd?.sha256 ?? "")
        ? { planSha256: continuity.prd.sha256 }
        : {}),
      ...(SHA256_RE.test(continuity?.spec?.sha256 ?? "")
        ? { specSha256: continuity.spec.sha256 }
        : {}),
    });
    if (!lifecycle.ok) return { status: "drifted", nextAction: lifecycle.nextAction };
    if (lifecycle.status === null
      || lifecycle.status === "draft"
      || lifecycle.status === "awaiting-approval") return { status: "absent" };
    const approval = state.planApproval?.poGateAuthority;
    if (!SHA256_RE.test(approval?.planSha256 ?? "")
      || !SHA256_RE.test(approval?.specSha256 ?? "")
      || continuity?.prd?.path !== approval.planPath
      || continuity?.spec?.path !== approval.specPath) return { status: "drifted" };
    return {
      status: "observed",
      planSha256: approval.planSha256,
      specSha256: approval.specSha256,
      lifecycleStatus: lifecycle.status,
    };
  } catch {
    return { status: "unavailable" };
  }
}

function observePoAuthorityRebind(root, fs) {
  const injectedValidator = typeof fs.validatePoGateAuthorityForRepository === "function";
  const validateAuthority = fs.validatePoGateAuthorityForRepository ?? validatePoGateAuthorityForRepository;
  const injectedPersisted = typeof fs.observePersistedPoAuthority === "function";
  const persisted = injectedPersisted
    ? fs.observePersistedPoAuthority(root)
    : persistedPoAuthority(root, fs);
  if (persisted.status === "drifted") return { status: "unavailable" };
  if (persisted.status === "unavailable" && !injectedValidator) return { status: "unavailable" };
  // A pristine kickoff or exact revoke-plan v2 postimage deliberately carries
  // no current approval. Re-validating historical State provenance as though
  // it were live PO authority recreates the design re-entry deadlock.
  if (persisted.status === "absent" && !injectedPersisted) return { status: "not-needed" };
  const authority = validateAuthority(persisted.status === "observed"
    ? {
      repoRoot: root,
      expectedPlanSha256: persisted.planSha256,
      expectedSpecSha256: persisted.specSha256,
    }
    : { repoRoot: root });
  if (authority?.ok === true) return { status: "not-needed" };
  if (authority?.code === "PO-GATE-PLAN-DIGEST-STALE") {
    return { status: "unavailable" };
  }
  if (authority?.code !== "PO-GATE-PRD-SPEC-MISMATCH") {
    return { status: "not-applicable" };
  }
  let writer;
  try {
    writer = PO_AUTHORITY_REBIND_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      throw new Error("unsafe PO authority writer");
    }
  } catch {
    return { status: "unavailable" };
  }
  const planned = fs.spawnSync(process.execPath, [writer, "po-authority-rebind-plan"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error || planned?.status !== 0 || String(planned.stderr ?? "").trim() !== "") {
    return { status: "unavailable" };
  }
  let plan;
  try {
    plan = JSON.parse(String(planned.stdout ?? ""));
  } catch {
    return { status: "unavailable" };
  }
  const action = plan?.applyAction;
  const expectedArgv = [
    writer,
    "po-authority-rebind-apply",
    "--plan-sha256",
    plan?.planSha256,
    "--updated-at",
    plan?.plannedAt,
    "--activate",
  ];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || plan.schema !== "pipeline.po-authority-rebind-plan.v1"
    || plan.root !== root
    || !SHA256_RE.test(plan.planSha256 ?? "")
    || typeof plan.plannedAt !== "string"
    || !Number.isFinite(Date.parse(plan.plannedAt))
    || new Date(plan.plannedAt).toISOString() !== plan.plannedAt
    || !action || typeof action !== "object" || Array.isArray(action)
    || action.executable !== process.execPath
    || JSON.stringify(action.argv) !== JSON.stringify(expectedArgv)
    || action.mutation !== true
    || action.requiresConfirmation !== true
    || action.requiresHostBoundary !== true) {
    return { status: "unavailable" };
  }
  return {
    status: "required",
    nextAction: {
      kind: "command",
      executable: action.executable,
      argv: action.argv,
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.po-authority-rebind-apply.v1",
        statuses: ["applied"],
      },
    },
  };
}

function observePoAuthorityDecision(root, fs) {
  let writer;
  try {
    writer = PO_AUTHORITY_REBIND_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      throw new Error("unsafe PO authority writer");
    }
  } catch {
    return { status: "unavailable" };
  }
  const planned = fs.spawnSync(process.execPath, [writer, "po-authority-decision-plan"], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error || planned?.status !== 0 || String(planned.stderr ?? "").trim() !== "") {
    return observePoProfileRepair(root, fs);
  }
  let plan;
  try { plan = JSON.parse(String(planned.stdout ?? "")); }
  catch { return { status: "unavailable" }; }
  const candidates = Array.isArray(plan?.candidates) ? plan.candidates : [];
  const actions = Array.isArray(plan?.selectionActions) ? plan.selectionActions : [];
  const specAction = actions.find((action) => action?.selectedCandidate === "spec");
  const prdAction = actions.find((action) => action?.selectedCandidate === "prd");
  const expectedSelectionArgv = [
    writer,
    "po-authority-decision-select",
    "--plan-sha256",
    plan?.planSha256,
    "--planned-at",
    plan?.plannedAt,
    "--selection",
    "spec",
  ];
  if (!plan || typeof plan !== "object" || Array.isArray(plan)
    || plan.schema !== "pipeline.po-authority-decision-plan.v1"
    || plan.root !== root || !SHA256_RE.test(plan.planSha256 ?? "")
    || typeof plan.plannedAt !== "string" || !Number.isFinite(Date.parse(plan.plannedAt))
    || new Date(plan.plannedAt).toISOString() !== plan.plannedAt
    || candidates.length !== 2
    || JSON.stringify(candidates.map((candidate) => candidate?.id).sort()) !== JSON.stringify(["prd", "spec"])
    || !specAction || specAction.status !== "available"
    || specAction.executable !== process.execPath
    || JSON.stringify(specAction.argv) !== JSON.stringify(expectedSelectionArgv)
    || specAction.mutation !== false || specAction.requiresConfirmation !== true
    || !prdAction || prdAction.status !== "unavailable" || prdAction.mutation !== false) {
    return { status: "unavailable" };
  }
  return {
    status: "required",
    nextAction: {
      kind: "command",
      executable: process.execPath,
      argv: [writer, "po-authority-decision-plan"],
      mutation: false,
      requiresConfirmation: false,
      expected: {
        schema: "pipeline.po-authority-decision-plan.v1",
        statuses: ["planned"],
      },
    },
  };
}

function observePoProfileRepair(root, fs) {
  const validateProfile = fs.validatePoGateProfileForRepository ?? validatePoGateProfileForRepository;
  const profile = validateProfile({ repoRoot: root });
  if (profile?.ok === true) return { status: "unavailable" };
  let writer;
  try {
    writer = PO_PROFILE_REPAIR_WRITER;
    const info = fs.lstatSync(writer);
    if (!info.isFile() || info.isSymbolicLink() || fs.realpathSync(writer) !== writer) {
      return { status: "unavailable" };
    }
  } catch {
    return { status: "unavailable" };
  }
  const planned = fs.spawnSync(process.execPath, [writer, "plan", "--root", root], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    maxBuffer: 2 * 1024 * 1024,
  });
  if (planned?.error || planned?.status !== 0 || String(planned.stderr ?? "").trim() !== "") {
    return { status: "unavailable" };
  }
  let plan;
  try { plan = JSON.parse(String(planned.stdout ?? "")); }
  catch { return { status: "unavailable" }; }
  const action = plan?.applyAction;
  const expectedArgv = [
    writer,
    "apply",
    "--root",
    root,
    "--plan-sha256",
    plan?.planSha256,
    "--activate",
  ];
  if (plan?.schema !== "pipeline.po-gate-profile-repair-plan.v1"
    || plan?.status !== "ready" || plan?.root !== root
    || !SHA256_RE.test(plan?.planSha256 ?? "")
    || action?.executable !== process.execPath
    || JSON.stringify(action?.argv) !== JSON.stringify(expectedArgv)
    || action?.mutation !== true || action?.requiresConfirmation !== true
    || action?.requiresHostBoundary !== true) {
    return { status: "unavailable" };
  }
  return {
    status: "profile-repair-required",
    nextAction: {
      kind: "command",
      executable: action.executable,
      argv: action.argv,
      mutation: true,
      requiresConfirmation: true,
      expected: {
        schema: "pipeline.po-gate-profile-repair-apply.v1",
        statuses: ["applied"],
      },
    },
  };
}

function runtimeTargetReadOnlyResult({ root, intent, repository }) {
  return lifecycleResult({
    status: "runtime-target-read-only",
    root,
    intent,
    repository,
    runtime: emptyRuntime("target-read-only"),
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      "$.runtime",
      "runtime_target_read_only",
      "a selected Codex runtime target cannot support the required reversible transaction",
      "repair target or parent permissions before planning runtime changes",
    )],
  });
}

function unavailableRepository(intent) {
  return {
    status: "unavailable",
    mode: "unknown",
    gitVersion: null,
    initializesGit: false,
    rootWritable: "not-observed",
    sessionCapability: ["onboarding", "bootstrap"].includes(intent) ? "not-required" : "not-observed",
    worktreeCapability: intent === "dispatch" ? "not-observed" : "not-required",
  };
}

const REPOSITORY_KEYS = [
  "status", "mode", "gitVersion", "initializesGit", "rootWritable", "sessionCapability", "worktreeCapability",
];
const REPOSITORY_STATUSES = new Set([
  "local-valid-writable", "local-uninitialized", "host-managed", "control-path-read-only", "control-path-invalid",
  "git-unavailable", "root-read-only", "session-capability-unavailable", "worktree-capability-unavailable", "unavailable",
]);
function validRepositoryComponent(value) {
  return value && typeof value === "object" && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...REPOSITORY_KEYS].sort())
    && REPOSITORY_STATUSES.has(value.status)
    && new Set(["local", "host-managed", "unknown"]).has(value.mode)
    && (value.gitVersion === null || (typeof value.gitVersion === "string" && value.gitVersion.length > 0))
    && typeof value.initializesGit === "boolean"
    && new Set(["passed", "failed", "not-observed"]).has(value.rootWritable)
    && new Set(["passed", "failed", "not-required", "not-observed"]).has(value.sessionCapability)
    && new Set(["passed", "failed", "not-required", "not-observed"]).has(value.worktreeCapability);
}

function observeRepositoryCapability(rootDir, fs, intent, willInitializeGit = false) {
  try {
    const observed = fs.observeCodexOnboardingCapabilities({
      rootDir,
      intent,
      willInitializeGit,
      deps: { spawnSync: fs.spawnSync },
    });
    return validRepositoryComponent(observed) ? observed : unavailableRepository(intent);
  } catch {
    return unavailableRepository(intent);
  }
}

function persistedHostManagedLayout(root, fs) {
  try {
    const calibrationPath = projectAuthorityPaths(root, fs).calibration;
    const calibration = JSON.parse(fs.readFileSync(safePath(root, calibrationPath, fs), "utf8"));
    return calibration?.repositoryMode === "host-managed" && hasCodexHostControlLayout(root, {
      access: fs.accessSync, fsConstants: fs.constants, lstat: fs.lstatSync, readdir: fs.readdirSync,
    });
  } catch { return false; }
}

function pluginManagedCodexRuntime(root, fs) {
  const reserved = hasCodexRuntimeControlMount(root, {
    access: fs.accessSync,
    fsConstants: fs.constants,
    lstat: fs.lstatSync,
    readdir: fs.readdirSync,
  });
  if (!reserved) return null;
  const admission = observeCodexHostRepositoryInitAdmission(root, {
    lstat: fs.lstatSync,
    readFile: fs.readFileSync,
    platform: fs.process?.platform,
  });
  if (admission.status === "valid") return "receipt-attested";
  return admission.status === "invalid" ? "receipt-invalid" : "reserved-unattested";
}

function pluginManagedAdmissionDriftResult({ root, intent, repository, sourceSha256 }) {
  return lifecycleResult({
    status: "projection-drift",
    root,
    intent,
    repository,
    runtime: {
      ...emptyRuntime("projection-drift"),
      sourceSha256: sourceSha256 ?? null,
    },
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(
      "$.runtime",
      "projection_drift",
      "an existing Codex host-initialization receipt is invalid or no longer bound to the current authority",
      "repair the host-initialization receipt and control layout before retrying; do not repeat initialization",
    )],
  });
}

function commandAction(argv, mutation, requiresConfirmation, schema, statuses) {
  return { kind: "command", executable: "node", argv, mutation, requiresConfirmation, expected: { schema, statuses } };
}

function shellWord(value) {
  if (typeof value !== "string" || value.includes("\0")) {
    throw new TypeError("command arguments must be NUL-free strings");
  }
  if (/^[A-Za-z0-9_@%+=:,./-]+$/u.test(value)) return value;
  if (/[\r\n]/u.test(value)) {
    const escaped = value
      .replaceAll("\\", "\\\\")
      .replaceAll("'", "\\'")
      .replaceAll("\r", "\\r")
      .replaceAll("\n", "\\n");
    return `$'${escaped}'`;
  }
  return `'${value.replaceAll("'", "'\"'\"'")}'`;
}

/** Render an exact command/restart action as one copy-safe shell line. */
export function renderProjectOnboardingAction(action) {
  let executable;
  let argv;
  if (action?.kind === "command") {
    executable = action.executable;
    argv = action.argv;
  } else if (action?.kind === "restart-process") {
    executable = action.launch?.executable;
    argv = action.launch?.argv;
  } else {
    throw new TypeError("only command and restart-process actions are renderable");
  }
  if (typeof executable !== "string" || !Array.isArray(argv) || !argv.every((part) => typeof part === "string")) {
    throw new TypeError("action executable/argv is invalid");
  }
  return [executable, ...argv].map(shellWord).join(" ");
}

const COPY_COMMAND_MAX_COLUMNS = 72;
function singleQuoted(value, powershell = false) {
  return powershell
    ? `'${value.replaceAll("'", "''")}'`
    : `'${value.replaceAll("'", "'\"'\"'")}'`;
}
function boundedAssignmentLines(name, value, powershell = false) {
  if (/[\r\n]/u.test(value)) throw new TypeError("copy command values cannot contain line breaks");
  const lines = [];
  let remaining = value;
  do {
    const prefix = powershell
      ? `${name}${lines.length === 0 ? " = " : " += "}`
      : `${name}=${lines.length === 0 ? "" : `\${${name}}`}`;
    let length = remaining.length;
    while (length > 0
      && `${prefix}${singleQuoted(remaining.slice(0, length), powershell)}`.length > COPY_COMMAND_MAX_COLUMNS) {
      length -= 1;
    }
    if (length === 0 && remaining.length > 0) throw new TypeError("copy command value cannot be bounded");
    const chunk = remaining.slice(0, length);
    lines.push(`${prefix}${singleQuoted(chunk, powershell)}`);
    remaining = remaining.slice(length);
  } while (remaining.length > 0);
  return lines;
}
function restartCopyCommands(executable, argv) {
  const [launcher, rootFlag, root, barrierFlag, barrierSha256, activate] = argv;
  if (executable !== "node"
    || rootFlag !== "--root"
    || barrierFlag !== "--barrier-sha256"
    || activate !== "--activate"
    || !/^[a-f0-9]{64}$/u.test(barrierSha256)) {
    throw new TypeError("restart action cannot be rendered as a bounded command");
  }
  const posix = [
    ...boundedAssignmentLines("P", launcher),
    ...boundedAssignmentLines("R", root),
    ...boundedAssignmentLines("B", barrierSha256),
    'node "$P" --root "$R" --barrier-sha256 "$B" --activate',
  ];
  const powershell = [
    ...boundedAssignmentLines("$P", launcher, true),
    ...boundedAssignmentLines("$R", root, true),
    ...boundedAssignmentLines("$B", barrierSha256, true),
    "& node $P --root $R --barrier-sha256 $B --activate",
  ];
  for (const line of [...posix, ...powershell]) {
    if (line.length > COPY_COMMAND_MAX_COLUMNS) throw new TypeError("copy command line exceeds its bound");
  }
  return {
    maxColumns: COPY_COMMAND_MAX_COLUMNS,
    posix: posix.join("\n"),
    powershell: powershell.join("\n"),
  };
}

function continuityRepairPlanAction(root) {
  return commandAction(
    [ONBOARDING_SCRIPT, "plan-repair", "--root", root],
    false,
    false,
    SCHEMA,
    ["continuity-damaged"],
  );
}

function collectGoalAction() {
  return {
    kind: "collect-input",
    input: {
      name: "goal",
      encoding: "utf8",
      trim: true,
      minBytes: 1,
      maxBytes: KICKOFF_GOAL_MAX_BYTES,
      singleLine: true,
      rejectNul: true,
    },
    mutation: false,
    requiresConfirmation: false,
    expected: {
      schema: SCHEMA,
      statuses: ["kickoff-required"],
    },
  };
}

const RESTART_EXPECTED_STATUSES = [
  "portable-seed-required", "runtime-initialization-required", "kickoff-required", "host-repository-init-required", "ready", "partial", "invalid", "unsafe",
  "migration-required", "adoption-required", "repository-mount-read-only", "repository-control-path-invalid", "git-capability-unavailable",
  "project-root-read-only", "repository-mode-unsupported", "repository-observation-unavailable", "session-capability-unavailable",
  "worktree-capability-unavailable", "runtime-target-read-only", "runtime-readback-unavailable", "projection-drift", "continuity-damaged",
  "continuity-observation-unavailable", "app-server-execution-denied", "app-server-not-running", "app-server-unavailable",
];
function restartAction(root, barrierSha256) {
  const executable = "node";
  const argv = [fileURLToPath(new URL("../scripts/codex-onboarding-launch.mjs", import.meta.url)), "--root", root, "--barrier-sha256", barrierSha256, "--activate"];
  return {
    kind: "restart-process", requiresCurrentProcessExit: true,
    launch: {
      executable,
      argv,
      executionBoundary: "external-terminal",
      invocation: "user-copy-only",
      codexToolCallPermitted: false,
      copyCommand: restartCopyCommands(executable, argv),
    },
    mutation: true, requiresConfirmation: true, expectedStatuses: RESTART_EXPECTED_STATUSES,
  };
}

function lifecycleResult({
  status,
  root,
  runner = "codex",
  intent,
  repository,
  runtime,
  continuity = emptyContinuity(),
  appServer = emptyAppServer(),
  nextAction = null,
  diagnostics = [],
}) {
  return {
    schema: SCHEMA,
    status,
    root: root ?? null,
    runner,
    intent,
    repository,
    runtime,
    continuity,
    appServer,
    nextAction,
    diagnostics,
  };
}

function validAppServerComponent(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(["code", "required", "status"])) {
    return false;
  }
  // `not-requested` (this intent does not need it) and `not-applicable` (this
  // runner has no App-Server concept at all) are both code-free non-required
  // states; every required state keeps its exact existing status/code pairing.
  if (value.required === false) {
    return (value.status === "not-requested" || value.status === "not-applicable") && value.code === null;
  }
  if (value.required !== true || typeof value.code !== "string" || !/^CAS-[A-Z0-9-]+$/u.test(value.code)) return false;
  if (value.status === "running") return value.code === "CAS-READY";
  if (value.status === "execution-denied") return value.code === "CAS-EXECUTION-UNAVAILABLE";
  if (value.status === "not-running") return value.code === "CAS-DAEMON-UNREACHABLE";
  return value.status === "unavailable"
    && value.code !== "CAS-READY"
    && value.code !== "CAS-DAEMON-UNREACHABLE";
}

function notApplicableAppServer() { return { required: false, status: "not-applicable", code: null }; }

function observeReadyAppServer(intent, runner, fs) {
  // A runner with no App-Server concept is not-applicable for every intent: no
  // observation is attempted, nothing is claimed running, nothing blocks.
  if (RUNNERS_WITHOUT_APP_SERVER.has(runner)) return notApplicableAppServer();
  if (intent === "onboarding") return emptyAppServer();
  try {
    const observed = fs.observeOnboardingAppServer({ intent });
    return validAppServerComponent(observed)
      ? observed
      : { required: true, status: "unavailable", code: "CAS-UNKNOWN" };
  } catch {
    return { required: true, status: "unavailable", code: "CAS-UNKNOWN" };
  }
}

function readyLifecycleResult({ root, runner = "codex", intent, repository, runtime, continuity = emptyContinuity() }, fs) {
  // The fresh protected-mount transition is not a ready-state claim.  Its
  // confirmed host repository initializer must be plannable even when the
  // current workspace sandbox cannot reach the host App-Server control
  // socket.  App-Server health remains mandatory after host initialization,
  // before any bootstrap/session/dispatch result may become ready.
  if (runtime.status === "plugin-managed-unattested" && continuity.status === "valid") {
    return lifecycleResult({
      status: "host-repository-init-required",
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer: emptyAppServer(),
      nextAction: commandAction(
        [HOST_REPOSITORY_INIT_SCRIPT, "plan", "--root", root],
        false,
        false,
        "pipeline.codex-host-repository-init-plan.v1",
        ["ready", "not-applicable"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.runtime",
        "plugin_managed_runtime_unattested",
        "the reserved Codex runtime mount is not yet bound to a durable host initialization receipt",
        "review the exact host repository initialization plan",
      )],
    });
  }
  // Cleanup descriptors are meaningful only after local Git and valid
  // continuity authority both exist. A fresh/host-managed bootstrap must first
  // complete its typed repository initialization; probing the protected host
  // control mount here would turn that legitimate transition into a false
  // cleanup-observation failure.
  if (repository.mode === "local" && continuity.status === "valid") {
    const cleanupRecovery = partialCleanupRecoveryResult({
      root,
      intent,
      repository,
      runtime,
      deps: fs,
      strict: true,
    });
    if (cleanupRecovery !== null) return cleanupRecovery;
  }
  // Runtime projection and App-Server health are distinct authorities. A
  // plugin-managed projection still requires the same single, read-only
  // App-Server observation as a project-local projection before bootstrap,
  // session, or dispatch may report ready.
  const appServer = observeReadyAppServer(intent, runner, fs);
  if (appServer.required === true && appServer.status !== "running") {
    const status = appServer.status === "execution-denied"
      ? "app-server-execution-denied"
      : appServer.status === "not-running"
        ? "app-server-not-running"
        : "app-server-unavailable";
    const diagnostic = status === "app-server-execution-denied"
      ? lifecycleDiagnostic(
        "$.appServer",
        "app_server_execution_denied",
        "the required read-only App-Server health observation was denied by the execution boundary",
        "observe App-Server health through the host-authorized local read-only boundary",
      )
      : status === "app-server-not-running"
        ? lifecycleDiagnostic(
          "$.appServer",
          "app_server_not_running",
          "the required local App-Server daemon is not running",
          "review and explicitly confirm the bounded recovery action",
        )
        : lifecycleDiagnostic(
          "$.appServer",
          "app_server_unavailable",
          "the required local App-Server health could not be established",
          "use only the returned bounded doctor or recovery action when one is available",
        );
    return lifecycleResult({
      status,
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: appServerNextAction(appServer),
      diagnostics: [diagnostic],
    });
  }
  if (continuity.status === "absent-pristine") {
    return lifecycleResult({
      status: "kickoff-required",
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: collectGoalAction(),
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_absent_pristine",
        "no sanctioned initial continuity exists",
        "collect and validate the project goal, then review the read-only kickoff plan",
      )],
    });
  }
  if (continuity.status === "damaged") {
    return lifecycleResult({
      status: "continuity-damaged",
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: continuityRepairPlanAction(root),
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_damaged",
        "existing continuity artifacts are inconsistent or invalid",
        "review the bounded continuity repair plan; pristine kickoff is not permitted",
      )],
    });
  }
  if (continuity.status !== "valid") {
    return lifecycleResult({
      status: "continuity-observation-unavailable",
      root,
      intent,
      repository,
      runtime,
      continuity: { ...continuity, status: "unavailable" },
      appServer,
      diagnostics: [lifecycleDiagnostic(
        "$.continuity",
        "continuity_observation_unavailable",
        "continuity authority could not be observed safely",
        "repair continuity read access before retrying",
      )],
    });
  }
  const poAuthorityRebind = observePoAuthorityRebind(root, fs);
  if (poAuthorityRebind.status === "required") {
    return lifecycleResult({
      status: "partial",
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: poAuthorityRebind.nextAction,
      diagnostics: [lifecycleDiagnostic(
        "$.authority.poGate",
        "po_authority_rebind_required",
        "the approved PRD marker and persisted PO authority bind an older neighboring specification",
        "present and apply only the returned digest-bound PO authority rebind action after explicit PO confirmation",
      )],
    });
  }
  if (poAuthorityRebind.status === "unavailable") {
    const poAuthorityDecision = observePoAuthorityDecision(root, fs);
    if (poAuthorityDecision.status === "required") {
      return lifecycleResult({
        status: "partial",
        root,
        intent,
        repository,
        runtime,
        continuity,
        appServer,
        nextAction: poAuthorityDecision.nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.poGate",
          "po_authority_decision_required",
          "the current PRD and specification require an explicit neutral Human authority selection",
          "run only the returned read-only decision plan, present both candidates, then use the exact selected action after Human confirmation",
        )],
      });
    }
    if (poAuthorityDecision.status === "profile-repair-required") {
      return lifecycleResult({
        status: "partial",
        root,
        intent,
        repository,
        runtime,
        continuity,
        appServer,
        nextAction: poAuthorityDecision.nextAction,
        diagnostics: [lifecycleDiagnostic(
          "$.authority.poGate.profile",
          "po_profile_repair_required",
          "the machine-local PO profile receipt is missing or stale",
          "apply only the returned digest-bound PO profile repair after explicit PO confirmation, then re-run inspection for the authority decision",
        )],
      });
    }
    return lifecycleResult({
      status: "partial",
      root,
      intent,
      repository,
      runtime,
      continuity,
      appServer,
      nextAction: null,
      diagnostics: [lifecycleDiagnostic(
        "$.authority.poGate",
        "po_authority_rebind_unavailable",
        "the PRD and specification authority differ but no closed rebind action could be validated",
        "retain both authority documents and repair the typed PO rebind planner; do not edit Pipeline State manually",
      )],
    });
  }
  return lifecycleResult({
    status: "ready",
    root,
    intent,
    repository,
    runtime,
    continuity,
    appServer,
    diagnostics: [],
  });
}

function afterRuntimeLifecycleResult({ root, intent, repository, runtime }, fs) {
  let continuity;
  try {
    continuity = (fs.classifyOnboardingContinuity ?? classifyOnboardingContinuity)({
      rootDir: root,
      repositoryCapability: repository.mode,
      spawn: fs.spawnSync,
    });
  } catch {
    continuity = emptyContinuity();
  }
  return readyLifecycleResult({ root, intent, repository, runtime, continuity }, fs);
}

function lifecyclePlanDigest(plan) {
  return sha256(JSON.stringify(stable({ root: plan.root, state: plan.state ?? plan.sourceKind, intentSha256: plan.intentSha256, sourceSha256: plan.sourceSha256, git: plan.git, targets: plan.targets })));
}

function sourceRecoveryCategory(inspected, sourceKind, migrationPlan) {
  if (["continuity-damaged", "recovery-required"].includes(inspected.status)
    || migrationPlan?.status === "recovery-required"
    || (inspected.diagnostics ?? []).some((entry) => ["pending_transaction", "evidence_unavailable"].includes(entry.code))) return "unavailable-evidence";
  if (sourceKind === "v3" && migrationPlan?.status === "ready"
    && migrationPlan.changes?.some((entry) => entry.kind === "runtime")) {
    return "stale-generated-projection";
  }
  if (inspected.status === "ready" && migrationPlan?.status === "noop") return "current-authority";
  if (inspected.status === "migration-required") return ["v0", "v1", "v2"].includes(sourceKind)
    ? "unsupported-source-transition" : "stale-generated-projection";
  if (inspected.status === "adoption-required") return "unsupported-source-transition";
  return "invalid-authority";
}

/** Read-only diagnosis of a V4 source transition. */
export function planProjectOnboardingSourceRecovery({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  let root = null; let sourceSha256 = null; let sourceKind = null; let migrationPlan = null;
  try {
    root = safeRoot(rootDir, fs);
    const sourcePath = safePath(root, SOURCE, fs);
    if (fs.existsSync(sourcePath)) {
      const bytes = fs.readFileSync(sourcePath);
      sourceSha256 = sha256(bytes);
      const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
      if (migrated.status === "ready") {
        sourceKind = migrated.sourceKind;
        migrationPlan = planRunnerProfileMigrationV3({
          rootDir: root,
          deps: fs,
          initializeMissingRuntimeForSlimV3: true,
        });
      } else if (migrated.status === "recovery-required") {
        migrationPlan = migrated;
      }
    }
  } catch { /* diagnosis remains terminal and side-effect free */ }
  let inspected;
  try { inspected = inspectProjectOnboardingV3({ rootDir, deps: fs, intent: "onboarding" }); }
  catch (error) { inspected = { status: "unsafe", diagnostics: [diagnostic("$.root", "source_unavailable", error.message, "repair the physical root")] }; }
  const category = sourceRecoveryCategory(inspected, sourceKind, migrationPlan);
  const terminal = ["invalid-authority", "unsupported-source-transition", "unavailable-evidence"].includes(category);
  const action = terminal ? null : commandAction([ONBOARDING_SCRIPT, "inspect", "--root", root ?? resolve(rootDir), "--intent", "onboarding"], false, false, SCHEMA, [SCHEMA]);
  const plan = { schema: SOURCE_RECOVERY_SCHEMA, status: terminal ? "unrepairable" : "ready", root, category, sourceSha256, nextAction: action, diagnostics: inspected.diagnostics ?? [] };
  return plan;
}

function manifestParentIdentity(root, fs) {
  const parent = safePath(root, ".claude", fs);
  if (!fs.existsSync(parent)) throw new Error("manifest parent is absent");
  const info = fs.lstatSync(parent);
  return directoryIdentity(info);
}

function manifestPlanDigest(plan) {
  return sha256(JSON.stringify(stable({
    root: plan.root, source: plan.source, target: plan.target, generated: plan.generated,
    preservation: plan.preservation, parent: plan.parent,
  })));
}

/** Plan an absent-target-only manifest repair. This function never writes. */
export function planProjectOnboardingManifestRepair({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root: null, diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "use the exact physical project root")] };
  }
  let sourcePath; let targetPath;
  try {
    sourcePath = safePath(root, SOURCE, fs); targetPath = safePath(root, ".claude/pipeline.yaml", fs);
  } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.root", "unsafe_path", error.message, "repair symbolic links in the project path")] };
  }
  let sourceBytes;
  try { sourceBytes = fs.readFileSync(sourcePath, "utf8"); } catch (error) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.source", "source_missing", error.message, "repair through the source owner")] };
  }
  const migrated = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  if (migrated.status !== "ready" || migrated.sourceKind !== "v3" || !sourceEnablesCodex(root, fs)) {
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.source", "source_invalid", "pipeline.user.yaml is not a current Codex V3 source", "repair the source through its owning workflow")] };
  }
  let targetInfo = null; try { targetInfo = fs.lstatSync(targetPath); } catch {}
  if (targetInfo) return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.target", "target_present", "the manifest target already exists and will not be replaced", "remove it through its owning workflow")] };
  let parent;
  try { parent = manifestParentIdentity(root, fs); } catch (error) { return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: [diagnostic("$.target.parent", "parent_invalid", error.message, "repair the physical .claude directory")] }; }
  const canonical = renderCanonicalV3Manifest({ rootDir: root, deps: fs });
  if (canonical.status !== "ready") return { schema: MANIFEST_REPAIR_SCHEMA, status: "unrepairable", root, diagnostics: canonical.diagnostics ?? [] };
  const plan = {
    schema: MANIFEST_REPAIR_SCHEMA, status: "ready", root,
    source: { path: SOURCE, sha256: sha256(sourceBytes), byteLength: Buffer.byteLength(sourceBytes, "utf8") },
    target: { path: ".claude/pipeline.yaml", status: "absent", sha256: null, byteLength: 0 },
    generated: { sha256: canonical.sha256, byteLength: canonical.byteLength },
    preservation: "absent-target-only", parent, planSha256: null, nextAction: null,
    diagnostics: [],
  };
  plan.planSha256 = manifestPlanDigest(plan);
  plan.nextAction = commandAction([ONBOARDING_SCRIPT, "apply-manifest-repair", "--root", root, "--plan-sha256", plan.planSha256, "--activate"], true, true, MANIFEST_REPAIR_SCHEMA, ["ready"]);
  return plan;
}

export function applyProjectOnboardingManifestRepair({ rootDir = process.cwd(), planSha256, activate = false, deps: overrides = {} } = {}) {
  if (!activate) return { schema: MANIFEST_REPAIR_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")] };
  const fs = deps(overrides); const plan = planProjectOnboardingManifestRepair({ rootDir, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return { schema: MANIFEST_REPAIR_SCHEMA, status: "invalid-plan", root: plan.root, diagnostics: [diagnostic("$.planSha256", "plan_digest_mismatch", "the supplied plan digest is not current", "run plan-manifest-repair again")] };
  const root = safeRoot(rootDir, fs); const target = safePath(root, ".claude/pipeline.yaml", fs); const parentPath = dirname(target);
  let temp = null; let published = null; let publishedIdentity = null;
  try {
    const sourceNow = fs.readFileSync(safePath(root, SOURCE, fs), "utf8");
    if (sha256(sourceNow) !== plan.source.sha256) throw new Error("source bytes changed since planning");
    if (fs.existsSync(target)) throw new Error("manifest target appeared before publication");
    const parentNow = manifestParentIdentity(root, fs);
    if (JSON.stringify(parentNow) !== JSON.stringify(plan.parent)) throw new Error("manifest target parent changed since planning");
    temp = join(parentPath, `.pipeline-manifest-repair-${randomBytes(12).toString("hex")}.tmp`);
    const canonical = renderCanonicalV3Manifest({ rootDir: root, deps: fs });
    if (canonical.status !== "ready" || canonical.sha256 !== plan.generated.sha256) throw new Error("generated manifest changed since planning");
    const generated = canonical.bytes;
    fs.writeFileSync(temp, generated, { encoding: "utf8", flag: "wx", mode: 0o600 });
    const tempFd = fs.openSync(temp, "r");
    try { fs.fsyncSync(tempFd); } finally { fs.closeSync(tempFd); }
    fs.fsyncDirectory?.(parentPath);
    fs.linkSync(temp, target); fs.unlinkSync(temp); temp = null; published = target;
    publishedIdentity = fileIdentity(fs.lstatSync(target));
    if (!publishedIdentity) throw new Error("published manifest identity unavailable");
    if (sha256(fs.readFileSync(safePath(root, SOURCE, fs), "utf8")) !== plan.source.sha256) throw new Error("source bytes changed after publication");
    if (JSON.stringify(manifestParentIdentity(root, fs)) !== JSON.stringify(plan.parent)) throw new Error("manifest target parent changed after publication");
    if (!sameIdentity(publishedIdentity, target, fs)) throw new Error("manifest target identity changed after publication");
    const readback = loadManifest(root);
    if (readback.status !== "ok") throw new Error("post-apply manifest readback was not valid");
    const inspection = (fs.inspectProjectOnboardingV3 ?? inspectProjectOnboardingV3)({ rootDir: root, deps: fs, intent: "bootstrap" });
    if (inspection.status !== "ready") throw new Error("post-apply V4 readback was not ready");
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "ready", root, planSha256, readback: { schema: SCHEMA, status: inspection.status, manifestSha256: sha256(generated) }, diagnostics: inspection.diagnostics ?? [] };
  } catch (error) {
    if (temp) { try { if (fs.existsSync(temp)) fs.unlinkSync(temp); } catch {} }
    if (published && publishedIdentity) { try { if (sameIdentity(publishedIdentity, published, fs)) fs.unlinkSync(published); } catch {} }
    return { schema: MANIFEST_REPAIR_SCHEMA, status: "rolled-back", root, diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "repair the target and replan")] };
  }
}

function sourceEnablesCodex(root, fs) {
  try {
    const parsed = parseYaml(fs.readFileSync(safePath(root, SOURCE, fs), "utf8"));
    return Array.isArray(parsed?.runners?.enabled)
      && parsed.runners.enabled.includes("codex");
  } catch { return false; }
}

function selectedRunnerIsCodex(root, fs) {
  try {
    const parsed = parseYaml(fs.readFileSync(safePath(root, SOURCE, fs), "utf8"));
    return parsed?.runners?.default === "codex"
      && Array.isArray(parsed.runners.enabled)
      && parsed.runners.enabled.includes("codex");
  } catch { return false; }
}

function sourceRecoveryResult({
  status,
  root,
  category,
  sourceSha256 = null,
  nextAction = null,
  diagnostics = [],
}) {
  return {
    schema: SOURCE_RECOVERY_SCHEMA,
    status,
    root: root ?? null,
    category,
    sourceSha256,
    nextAction,
    diagnostics,
  };
}

/**
 * Diagnose only the source-owning boundary. This read-only planner must end
 * either in one exact sanctioned workflow or an explicit terminal
 * disposition; it never edits or guesses source authority.
 */
export function planProjectOnboardingSourceRecoveryV4({
  rootDir = process.cwd(),
  deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  let root;
  try {
    root = safeRoot(rootDir, fs);
  } catch {
    return sourceRecoveryResult({
      status: "unrepairable",
      root: null,
      category: "unavailable-evidence",
      diagnostics: [lifecycleDiagnostic(
        "$.root",
        "source_evidence_unavailable",
        "the source root cannot be observed safely",
        "restore read access to the canonical physical project root",
      )],
    });
  }
  const inspected = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  if (inspected.status === "recovery-required") {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "unavailable-evidence",
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "apply", "--root", root, "--activate"],
        true,
        true,
        "pipeline.runner-profile-migration-plan.v3",
        ["ready", "noop", "applied"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "source_transaction_recovery_required",
        "a pending V3 transaction prevents current source evidence",
        "deliver the migration recovery preview and explicitly activate the existing bounded recovery workflow",
      )],
    });
  }
  if (inspected.status !== "ready") {
    return sourceRecoveryResult({
      status: "unrepairable",
      root,
      category: "invalid-authority",
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "source_authority_unrepairable",
        "the source is not one recognized authority that Public Core can reconstruct safely",
        "restore or correct pipeline.user.yaml through its external source-owning workflow",
      )],
    });
  }
  if (inspected.sourceKind === "v3-refresh") {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "stale-generated-projection",
      sourceSha256: inspected.sourceSha256,
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "plan", "--root", root],
        false,
        false,
        "pipeline.runner-profile-migration-plan.v3",
        ["ready", "noop"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "source_projection_refresh_available",
        "the source is a recognized older V3 generated registry projection",
        "review the closed migration plan before explicit activation",
      )],
    });
  }
  if (["v0", "v1", "v2"].includes(inspected.sourceKind)) {
    return sourceRecoveryResult({
      status: "recoverable",
      root,
      category: "unsupported-source-transition",
      sourceSha256: inspected.sourceSha256,
      nextAction: commandAction(
        [MIGRATION_SCRIPT, "inspect", "--root", root],
        false,
        false,
        "pipeline.runner-profile-migration-inspect.v3",
        ["ready"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "legacy_source_transition_required",
        "the source is a recognized legacy authority",
        "continue only through the explicit V3 migration workflow",
      )],
    });
  }
  if (!selectedRunnerIsCodex(root, fs)) {
    return sourceRecoveryResult({
      status: "unrepairable",
      root,
      category: "unsupported-source-transition",
      sourceSha256: inspected.sourceSha256,
      diagnostics: [lifecycleDiagnostic(
        "$.source.runners.default",
        "source_runner_transition_unsupported",
        "the current V4 lifecycle supports only a Codex-selected authority",
        "change the selected runner through the source-owning workflow; this recovery planner will not rewrite it",
      )],
    });
  }
  return sourceRecoveryResult({
    status: "unrepairable",
    root,
    category: "current-authority",
    sourceSha256: inspected.sourceSha256,
    diagnostics: [lifecycleDiagnostic(
      "$.source",
      "source_is_current",
      "the V3 source is current and is not the controlling recovery failure",
      "rerun the V4 lifecycle inspection and follow its controlling action",
    )],
  });
}

function manifestRepairBinding(plan) {
  return {
    schema: plan.schema,
    root: plan.root,
    source: plan.source,
    target: plan.target,
  };
}

function manifestRepairResult({
  status,
  root,
  source = null,
  target = null,
  planSha256 = null,
  applyAction = null,
  diagnostics = [],
}) {
  return {
    schema: MANIFEST_REPAIR_PLAN_SCHEMA,
    status,
    root: root ?? null,
    source,
    target,
    planSha256,
    applyAction,
    diagnostics,
  };
}

function currentRuntimeBaselines(root, intent, fs) {
  const baselines = freshBaselines(intent);
  for (const relative of runtimePaths()) {
    const target = safePath(root, relative, fs);
    if (!fs.existsSync(target)) continue;
    const bytes = readBoundPhysicalFile(target, fs);
    baselines[relative] = {
      status: "present",
      bytes: decodeUtf8Strict(bytes, `runtime target ${relative}`),
    };
  }
  return baselines;
}

/**
 * Plan one generated-manifest repair. Only an absent target is reconstructable
 * by this writer. Every existing target returns a terminal disposition and
 * remains under its owning workflow.
 */
export function planProjectOnboardingManifestRepairV4({
  rootDir = process.cwd(),
  deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  let root;
  try {
    root = safeRoot(rootDir, fs);
  } catch {
    return manifestRepairResult({
      status: "unrepairable",
      root: null,
      diagnostics: [lifecycleDiagnostic(
        "$.root",
        "manifest_repair_root_unavailable",
        "the project root cannot be observed safely",
        "restore the canonical physical root before retrying",
      )],
    });
  }
  const inspection = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
  if (inspection.status !== "ready" || inspection.sourceKind !== "v3" || !selectedRunnerIsCodex(root, fs)) {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        "manifest_repair_source_not_current",
        "manifest repair requires one current Codex-selected V3 source",
        "complete the source-owning recovery workflow first",
      )],
    });
  }
  let intent;
  let projection;
  let sourceBytes;
  try {
    const sourcePath = safePath(root, SOURCE, fs);
    sourceBytes = readBoundPhysicalFile(sourcePath, fs);
    if (sha256(sourceBytes) !== inspection.sourceSha256) throw new Error("source changed after migration inspection");
    intent = parseYaml(decodeUtf8Strict(sourceBytes, SOURCE));
    const validation = validatePipelineUserV3(intent, { source: SOURCE });
    if (!validation.ok) throw new Error("source validation changed during manifest planning");
    projection = planRuntimeProjectionV3(intent, {
      source: SOURCE,
      baselines: currentRuntimeBaselines(root, intent, fs),
    });
    const sourceAfter = readBoundPhysicalFile(sourcePath, fs);
    if (sourceAfter.compare(sourceBytes) !== 0 || sha256(sourceAfter) !== inspection.sourceSha256) {
      throw new Error("source changed during manifest planning");
    }
  } catch {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_unowned_bytes_unpreservable",
        "the existing manifest bytes cannot be projected while preserving unowned content",
        "repair the YAML syntax or restore the generated file from a trusted source, then plan again",
      )],
    });
  }
  if (projection.status !== "ready") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_unowned_bytes_unpreservable",
        "the manifest projection is not safely reconstructable",
        "repair the invalid unowned content through its owning workflow",
      )],
    });
  }
  const projected = projection.targets.find((entry) => entry.path === ".claude/pipeline.yaml");
  if (!projected || projected.after?.status !== "present" || typeof projected.after.bytes !== "string") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_projection_unavailable",
        "the V3 renderer produced no complete manifest target",
        "repair the runtime ownership manifest before retrying",
      )],
    });
  }
  let projectedManifest;
  try {
    projectedManifest = validateManifest(parseYaml(projected.after.bytes), { rootDir: root });
  } catch {
    projectedManifest = { status: "invalid" };
  }
  if (projectedManifest.status !== "ok") {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_postimage_invalid",
        "the byte-preserving projection does not produce a valid manifest",
        "restore the unowned manifest structure through its owning workflow",
      )],
    });
  }
  const targetPath = safePath(root, ".claude/pipeline.yaml", fs);
  const beforeBytes = readBoundPhysicalFile(targetPath, fs, { optional: true });
  if (beforeBytes !== null) {
    return manifestRepairResult({
      status: "unrepairable",
      root,
      source: { path: SOURCE, sha256: inspection.sourceSha256 },
      diagnostics: [lifecycleDiagnostic(
        "$.manifest",
        "manifest_existing_target_requires_owner_repair",
        "an existing manifest cannot be replaced with an atomic no-replace publication",
        "repair or remove the generated manifest through its owning workflow, then create a new digest-bound plan",
      )],
    });
  }
  const afterBytes = Buffer.from(projected.after.bytes, "utf8");
  const binding = {
    schema: MANIFEST_REPAIR_PLAN_SCHEMA,
    root,
    source: { path: SOURCE, sha256: inspection.sourceSha256 },
    target: {
      path: ".claude/pipeline.yaml",
      before: describe(beforeBytes),
      after: describe(afterBytes),
      preservation: "absent-target-only",
    },
  };
  const planSha256 = sha256(JSON.stringify(stable(binding)));
  const plan = manifestRepairResult({
    ...binding,
    status: "ready",
    planSha256,
    applyAction: commandAction(
      [ONBOARDING_SCRIPT, "apply-manifest-repair", "--root", root, "--plan-sha256", planSha256, "--activate"],
      true,
      true,
      SCHEMA,
      RESTART_EXPECTED_STATUSES,
    ),
  });
  AUTHENTICATED_MANIFEST_REPAIRS.set(plan, {
    signature: JSON.stringify(plan),
    afterBytes,
  });
  return plan;
}

export function applyProjectOnboardingManifestRepairV4({
  rootDir = process.cwd(),
  planSha256,
  activate = false,
  deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  if (activate !== true || !/^[a-f0-9]{64}$/u.test(planSha256 ?? "")) {
    return v4Inspection(rootDir, fs);
  }
  const plan = planProjectOnboardingManifestRepairV4({ rootDir, deps: fs });
  const authenticated = AUTHENTICATED_MANIFEST_REPAIRS.get(plan);
  if (plan.status !== "ready"
    || plan.planSha256 !== planSha256
    || sha256(JSON.stringify(stable(manifestRepairBinding(plan)))) !== planSha256
    || !authenticated
    || authenticated.signature !== JSON.stringify(plan)) {
    return v4Inspection(rootDir, fs);
  }
  let source;
  let parent;
  let temporary;
  let boundTarget;
  let fd;
  let temporaryIdentity = null;
  let publicationIdentity = null;
  let committed = false;
  let postCommitFailure = null;
  try {
    const target = safePath(plan.root, plan.target.path, fs);
    source = safePath(plan.root, plan.source.path, fs);
    parent = openBoundDirectory(dirname(target), fs);
    const temporaryName = `.pipeline-manifest-repair-${plan.planSha256.slice(0, 24)}-${randomBytes(8).toString("hex")}.tmp`;
    temporary = boundDirectoryEntry(parent, temporaryName, fs);
    boundTarget = boundDirectoryEntry(parent, basename(target), fs);
    fd = fs.openSync(
      temporary,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | (fs.constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryIdentity = fileIdentity(fs.fstatSync(fd));
    if (!temporaryIdentity) throw new Error("manifest temporary identity is unavailable");
    fs.writeFileSync(fd, authenticated.afterBytes);
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = undefined;
    if (!sameIdentity(temporaryIdentity, temporary, fs)
      || !sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      throw new Error("manifest publication topology changed");
    }
    const currentSource = readBoundPhysicalFile(source, fs);
    if (sha256(currentSource) !== plan.source.sha256) throw new Error("source preimage changed after planning");
    fs.linkSync(temporary, boundTarget);
    committed = true;
    publicationIdentity = temporaryIdentity;
    if (!sameFileObject(temporaryIdentity, temporary, fs)
      || !sameFileObject(temporaryIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the atomically published manifest changed identity before readback",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed during publication");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed after atomic publication",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed during publication");
    }
    const sourceAfter = readBoundPhysicalFile(source, fs);
    if (sha256(sourceAfter) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed during atomic manifest publication",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed during manifest publication");
    }
    if (fs.fsyncDirectory) fs.fsyncDirectory(parent.path);
    else syncBoundDirectory(parent, fs);
    const durableSource = readBoundPhysicalFile(source, fs);
    if (sha256(durableSource) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed during manifest durability confirmation",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed during manifest durability confirmation");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed during durability confirmation",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed during durability confirmation");
    }
    if (!sameFileObject(publicationIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the published manifest changed identity during durability confirmation",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed during durability confirmation");
    }
    fs.unlinkSync(temporary);
    temporaryIdentity = null;
    if (fs.fsyncDirectory) fs.fsyncDirectory(parent.path);
    else syncBoundDirectory(parent, fs);
    const finalSource = readBoundPhysicalFile(source, fs);
    if (sha256(finalSource) !== plan.source.sha256) {
      postCommitFailure = {
        code: "manifest_repair_source_changed_after_commit",
        message: "the V3 source changed before final manifest readback",
        repair: "stop and create a new source-bound repair plan before any readiness claim",
      };
      throw new Error("source changed before final manifest readback");
    }
    if (!sameDirectoryIdentity(parent.identity, parent.path, fs)) {
      postCommitFailure = {
        code: "manifest_repair_parent_changed_after_commit",
        message: "the pinned manifest parent changed before final readback",
        repair: "stop and restore the canonical physical .claude directory before any readiness claim",
      };
      throw new Error("manifest parent changed before final readback");
    }
    if (!sameFileObject(publicationIdentity, boundTarget, fs)) {
      postCommitFailure = {
        code: "manifest_repair_target_changed_after_commit",
        message: "the published manifest changed identity before final readback",
        repair: "stop and restore the generated manifest through its owning workflow before any readiness claim",
      };
      throw new Error("manifest target changed before final readback");
    }
  } catch {
    if (fd !== undefined) {
      try { fs.closeSync(fd); } catch {}
    }
    try {
      if (temporaryIdentity && temporary && sameIdentity(temporaryIdentity, temporary, fs)) fs.unlinkSync(temporary);
    } catch {}
    if (committed) {
      let quarantined = true;
      if (postCommitFailure) {
        quarantined = quarantineManifestPublication(parent, boundTarget, publicationIdentity, plan.planSha256, fs);
      }
      const observed = v4Inspection(rootDir, fs);
      const failure = postCommitFailure && quarantined ? postCommitFailure : postCommitFailure ? {
        code: "manifest_repair_rollback_incomplete",
        message: "publication drift occurred and the exact manifest postimage could not be quarantined",
        repair: "stop and inspect the physical manifest target before any readiness claim",
      } : {
        code: "manifest_repair_durability_unavailable",
        message: "the manifest postimage was published but directory durability could not be confirmed",
        repair: "stop and re-observe the physical project before any readiness claim",
      };
      return lifecycleResult({
        status: "partial",
        root: observed.root,
        runner: observed.runner,
        intent: observed.intent,
        repository: observed.repository,
        runtime: observed.runtime,
        continuity: observed.continuity,
        appServer: observed.appServer,
        diagnostics: [lifecycleDiagnostic(
          "$.manifest",
          failure.code,
          failure.message,
          failure.repair,
        )],
      });
    }
    return v4Inspection(rootDir, fs);
  } finally {
    try { if (parent) fs.closeSync(parent.fd); } catch {}
  }
  return v4Inspection(rootDir, fs);
}

const REPOSITORY_FAILURES = {
  "control-path-read-only": {
    status: "repository-mount-read-only",
    code: "repository_control_path_read_only",
    path: "$.repository",
    message: "the physical Git control path did not pass its reversible write probe",
    guidance: "remount or repair the repository control path before retrying",
  },
  "control-path-invalid": {
    status: "repository-control-path-invalid",
    code: "repository_control_path_invalid",
    path: "$.repository",
    message: "the repository control path is invalid or escaped its physical authority",
    guidance: "repair the Git control layout before retrying",
  },
  "git-unavailable": {
    status: "git-capability-unavailable",
    code: "git_unavailable",
    path: "$.repository.gitVersion",
    message: "Git 2.28 or newer could not be observed",
    guidance: "install or expose Git 2.28 or newer before retrying",
  },
  "root-read-only": {
    status: "project-root-read-only",
    code: "project_root_read_only",
    path: "$.root",
    message: "the project root did not pass its reversible write probe",
    guidance: "repair project-root write access before retrying",
  },
  "session-capability-unavailable": {
    status: "session-capability-unavailable",
    code: "session_capability_unavailable",
    path: "$.repository.sessionCapability",
    message: "the session cleanup descriptor probe did not complete and roll back",
    guidance: "repair the repository-private session capability before retrying",
  },
  "worktree-capability-unavailable": {
    status: "worktree-capability-unavailable",
    code: "worktree_capability_unavailable",
    path: "$.repository.worktreeCapability",
    message: "the dispatch worktree probe did not complete and roll back",
    guidance: "repair the local Git worktree capability before retrying",
  },
  unavailable: {
    status: "repository-observation-unavailable",
    code: "repository_observation_unavailable",
    path: "$.repository",
    message: "the repository capability could not be observed safely",
    guidance: "supply one physical project root and retry the observation",
  },
};

function repositoryFailureResult(rootDir, fs, intent, repository) {
  let failure = REPOSITORY_FAILURES[repository.status] ?? null;
  if (repository.status === "local-uninitialized" && !["onboarding", "bootstrap"].includes(intent)) {
    failure = REPOSITORY_FAILURES["control-path-invalid"];
  } else if (repository.status === "host-managed"
    && (intent === "dispatch" || (intent === "session"
      && (repository.gitVersion === null || repository.sessionCapability !== "passed")))) {
    failure = {
      status: "repository-mode-unsupported",
      code: "repository_mode_unsupported",
      path: "$.repository.mode",
      message: "host-managed repository mode has not established the capability required by this intent",
      guidance: "complete the exact host repository transition before session work; dispatch still requires a local worktree capability",
    };
  } else if (!failure && !["local-valid-writable", "local-uninitialized", "host-managed"].includes(repository.status)) {
    failure = REPOSITORY_FAILURES.unavailable;
  }
  if (!failure) return null;
  let root = null;
  if (repository.status !== "unavailable") {
    try { root = safeRoot(rootDir, fs); } catch {}
  }
  return lifecycleResult({
    status: failure.status,
    root,
    runner: root === null ? null : "codex",
    intent,
    repository,
    runtime: emptyRuntime(),
    nextAction: null,
    diagnostics: [lifecycleDiagnostic(failure.path, failure.code, failure.message, failure.guidance)],
  });
}

function v4Inspection(rootDir, fs, intent = "onboarding") {
  try {
    const requestedRoot = resolve(rootDir);
    const requestedInfo = fs.lstatSync(requestedRoot);
    if (requestedInfo.isSymbolicLink()) {
      return lifecycleResult({
        status: "unsafe",
        root: null,
        runner: null,
        intent,
        repository: unavailableRepository(intent),
        runtime: emptyRuntime(),
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.root",
          "root_symlink_rejected",
          "the requested project root is a symbolic link",
          "use the canonical physical project directory",
        )],
      });
    }
  } catch {
    // The repository observer below owns all other resolution/read failures.
  }
  const repository = observeRepositoryCapability(rootDir, fs, intent, intent === "onboarding");
  const repositoryFailure = repositoryFailureResult(rootDir, fs, intent, repository);
  if (repositoryFailure) return repositoryFailure;
  const legacy = legacyInspection(rootDir, fs);
  const unavailable = lifecycleResult({
    status: "unsafe", root: legacy.root, runner: legacy.root ? "codex" : null, intent, repository,
    runtime: emptyRuntime(), diagnostics: [lifecycleDiagnostic("$.root", "root_resolution_failed", "the project root could not be resolved safely", "supply one real project directory")],
  });
  if (legacy.status === "unsafe") return unavailable;
  if (legacy.status === "fresh" || legacy.status === "fresh-host-managed") {
    return lifecycleResult({
      status: "portable-seed-required", root: legacy.root, intent, repository,
      runtime: emptyRuntime(),
      nextAction: commandAction([ONBOARDING_SCRIPT, "plan", "--root", legacy.root], false, false, SCHEMA, ["portable-seed-required"]),
      diagnostics: [lifecycleDiagnostic("$.source", "portable_seed_missing", "no portable V3 source and calibration seed exists", "review the portable seed plan")],
    });
  }
  if (legacy.status === "existing-unmanaged") {
    return lifecycleResult({
      status: "adoption-required", root: legacy.root, intent, repository,
      runtime: emptyRuntime(),
      nextAction: commandAction([ONBOARDING_SCRIPT, "plan", "--root", legacy.root], false, false, SCHEMA, ["adoption-required"]),
      diagnostics: [lifecycleDiagnostic("$.source", "adoption_required", "the local project has no Pipeline authority", "review the additive adoption plan")],
    });
  }
  if (legacy.status === "migration-required") {
    const refresh = legacy.sourceKind === "v3-refresh";
    return lifecycleResult({
      status: "migration-required", root: legacy.root, intent, repository,
      runtime: emptyRuntime(),
      nextAction: commandAction(
        [MIGRATION_SCRIPT, refresh ? "plan" : "inspect", "--root", legacy.root],
        false,
        false,
        refresh ? "pipeline.runner-profile-migration-plan.v3" : "pipeline.runner-profile-migration-inspect.v3",
        refresh ? ["ready", "noop"] : ["ready", "invalid-root", "recovery-required", "invalid-source"],
      ),
      diagnostics: [lifecycleDiagnostic(
        "$.source",
        refresh ? "stale_generated_projection" : "migration_required",
        refresh ? "the project has a recognized stale V3 generated registry projection" : "the project has a legacy Pipeline source",
        refresh ? "review the closed V3 refresh plan" : "inspect the V3 migration",
      )],
    });
  }
  if (legacy.status === "partial") {
    const sourcePath = legacy.root && safePath(legacy.root, SOURCE, fs);
    if (sourcePath && fs.existsSync(sourcePath)) {
      const migrated = inspectRunnerProfileMigrationV3({ rootDir: legacy.root, deps: fs });
      if (migrated.status !== "ready") {
        return lifecycleResult({ status: "invalid", root: legacy.root, runner: null, intent, repository, runtime: emptyRuntime(),
          nextAction: commandAction([ONBOARDING_SCRIPT, "plan-source-recovery", "--root", legacy.root], false, false, SOURCE_RECOVERY_SCHEMA, ["recoverable", "unrepairable"]),
          diagnostics: [lifecycleDiagnostic("$.source", "source_invalid", "pipeline.user.yaml is not a valid V3 source", "review the closed source recovery disposition")] });
      }
      if (migrated.sourceKind === "v3") {
        if (!sourceEnablesCodex(legacy.root, fs)) {
          return lifecycleResult({ status: "invalid", root: legacy.root, runner: null, intent, repository, runtime: emptyRuntime(), nextAction: null,
            diagnostics: [lifecycleDiagnostic("$.source.runners.enabled", "source_invalid", "Codex is not enabled by the source authority", "enable Codex through the source authority") ] });
        }
        const manifest = loadManifest(legacy.root);
        if (manifest.status !== "ok") {
          return lifecycleResult({ status: "partial", root: legacy.root, intent, repository, runtime: emptyRuntime(),
            nextAction: commandAction([ONBOARDING_SCRIPT, "plan-manifest-repair", "--root", legacy.root], false, false, MANIFEST_REPAIR_PLAN_SCHEMA, ["ready", "unrepairable"]),
            diagnostics: [lifecycleDiagnostic("$.manifest", "manifest_invalid", "the generated pipeline manifest is absent or invalid", "review the digest-bound manifest-only repair plan")] });
        }
        // Codex reserves this directory inside its sandbox. The installed
        // plugin supplies the runtime there; a consumer project must not be
        // declared broken merely because it cannot materialize hidden bytes.
        const pluginRuntime = pluginManagedCodexRuntime(legacy.root, fs);
        if (pluginRuntime) {
          if (pluginRuntime === "receipt-invalid") {
            return pluginManagedAdmissionDriftResult({
              root: legacy.root,
              intent,
              repository,
              sourceSha256: migrated.sourceSha256,
            });
          }
          return afterRuntimeLifecycleResult({
            root: legacy.root,
            intent,
            repository,
            runtime: {
              ...emptyRuntime(pluginRuntime === "receipt-attested"
                ? "plugin-managed"
                : "plugin-managed-unattested"),
              sourceSha256: migrated.sourceSha256 ?? null,
            },
          }, fs);
        }
        if (persistedHostManagedLayout(legacy.root, fs)) {
          return runtimeTargetReadOnlyResult({ root: legacy.root, intent, repository });
        }
        try {
          selectedRuntimeTargetParents(legacy.root, fs);
        } catch {
          return runtimeTargetReadOnlyResult({ root: legacy.root, intent, repository });
        }
        const runtimePlan = planRunnerProfileMigrationV3({ rootDir: legacy.root, deps: fs, initializeMissingRuntimeForSlimV3: true });
        if (runtimePlan.status === "ready") {
          const runtimeTargets = runtimePlan.targets.filter((target) => target.kind === "runtime");
          const missing = runtimeTargets.some((target) => target.before?.status === "absent");
          // A newly appeared owned Codex preimage controls before other absent
          // targets: initialization must never overwrite it under a "missing" claim.
          const driftedPresent = runtimeTargets.some((target) => target.path.startsWith(".codex/")
            && target.before?.status === "present"
            && target.before.sha256 !== target.after?.sha256);
          const initialize = missing && !driftedPresent;
          if (initialize) {
            try {
              probeSelectedRuntimeTargets(legacy.root, fs);
            } catch {
              return runtimeTargetReadOnlyResult({ root: legacy.root, intent, repository });
            }
          }
          const runtime = { ...emptyRuntime(initialize ? "missing" : "projection-drift"), sourceSha256: runtimePlan.sourceSha256 ?? null };
          return lifecycleResult({
            status: initialize ? "runtime-initialization-required" : "projection-drift", root: legacy.root, intent, repository, runtime,
            nextAction: commandAction([ONBOARDING_SCRIPT, initialize ? "plan-runtime" : "plan-repair", "--root", legacy.root], false, false, SCHEMA, [initialize ? "runtime-initialization-required" : "projection-drift"]),
            diagnostics: [lifecycleDiagnostic("$.runtime", initialize ? "runtime_missing" : "projection_drift", initialize ? "required Codex runtime targets are absent" : "generated runtime bytes differ from the V3 projection", "review the lifecycle runtime plan")],
          });
        }
      }
    }
    const cleanupRecovery = partialCleanupRecoveryResult({ root: legacy.root, intent, repository });
    if (cleanupRecovery !== null) return cleanupRecovery;
    const partialPlan = planProjectPartialAuthorityAdoption({ rootDir: legacy.root, deps: fs });
    const reparable = partialPlan.status === "selection-required";
    return lifecycleResult({ status: "partial", root: legacy.root, intent, repository, runtime: emptyRuntime(),
      nextAction: reparable ? commandAction([ONBOARDING_SCRIPT, "plan-partial-authority", "--root", legacy.root], false, false, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["selection-required", "ready"]) : null,
      diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the project has an incomplete Pipeline authority", reparable ? "run the typed partial-authority planner and bind an explicit PO selection" : "inspect the existing source and generated targets")] });
  }
  if (legacy.status === "ready") {
    const projectAuthority = readProjectAuthority({ rootDir: legacy.root });
    if (projectAuthority.status === "ready" && projectAuthority.source === "legacy") {
      return lifecycleResult({
        status: "migration-required",
        root: legacy.root,
        intent,
        repository,
        runtime: emptyRuntime(),
        nextAction: commandAction(
          [PROJECT_AUTHORITY_MIGRATION_WRITER, "plan", "--root", legacy.root],
          false,
          false,
          "pipeline.project-authority.v1",
          ["ready", "noop", "recovery-required", "invalid-source"],
        ),
        diagnostics: [lifecycleDiagnostic(
          "$.authority",
          "project_authority_migration_required",
          "generic Pipeline authority still uses a runner-specific legacy directory",
          "review and apply the typed runner-neutral project-authority migration",
        )],
      });
    }
    if (projectAuthority.status !== "ready") {
      const provenance = inspectProjectAuthorityProvenance({ rootDir: legacy.root });
      const migration = planProjectAuthorityMigration({
        rootDir: legacy.root,
        provenance: provenance.status === "ready" ? provenance : undefined,
      });
      if (projectAuthority.status === "mixed" && migration.status === "ready") {
        return lifecycleResult({
          status: "migration-required",
          root: legacy.root,
          intent,
          repository,
          runtime: emptyRuntime(),
          nextAction: commandAction(
            [PROJECT_AUTHORITY_MIGRATION_WRITER, "plan", "--root", legacy.root],
            false,
            false,
            "pipeline.project-authority.v1",
            ["ready"],
          ),
          diagnostics: [lifecycleDiagnostic(
            "$.authority",
            "project_authority_remote_adoption_required",
            "a remote checkout left a partial neutral authority beside a complete legacy authority",
            "review the typed adoption plan; it archives neutral preimages in private Git metadata before replacing them",
          )],
        });
      }
      const cleanupRecovery = projectAuthority.code === "PA-STATE-SESSION-CLEANUP-PRIVATE"
        ? (fs.planProjectAuthoritySessionCleanupRecovery ?? planProjectAuthoritySessionCleanupRecovery)({ rootDir: legacy.root })
        : null;
      let cleanupPrivatization = null;
      if (projectAuthority.code === "PA-STATE-SESSION-CLEANUP-PRIVATE"
        && cleanupRecovery?.status !== "ready") {
        try {
          cleanupPrivatization = (
            fs.planOnboardingSessionCleanupPrivatization
            ?? planOnboardingSessionCleanupPrivatization
          )({
            rootDir: legacy.root,
            sessionCleanupScript: SESSION_CLEANUP_SCRIPT,
          });
        } catch {
          cleanupPrivatization = null;
        }
      }
      return lifecycleResult({
        status: "invalid",
        root: legacy.root,
        intent,
        repository,
        runtime: emptyRuntime(),
        nextAction: cleanupRecovery?.status === "ready"
          ? commandAction(
            [PROJECT_AUTHORITY_MIGRATION_WRITER, "recover", "--root", legacy.root],
            false,
            false,
            "pipeline.project-authority-recovery.v1",
            ["ready", "none", "recovery-unavailable", "recovery-required"],
          )
          : cleanupPrivatization?.status === "ready"
            ? commandAction(
              [SESSION_CLEANUP_SCRIPT, "plan-privatization", "--repo", legacy.root],
              false,
              false,
              "pipeline.session-cleanup-privatization-plan.v1",
              ["ready", "noop"],
            )
            : null,
        diagnostics: [lifecycleDiagnostic(
          "$.authority",
          "project_authority_invalid",
          projectAuthority.reason ?? "runner-neutral project authority is incomplete or mixed",
          "use only the typed project-authority recovery or migration action",
        )],
      });
    }
    const authority = validateV3BootstrapAuthority({ rootDir: legacy.root, deps: fs });
    if (authority.status === "ready" && authority.runtimeProjection === "plugin-managed") {
      return afterRuntimeLifecycleResult({
        root: legacy.root,
        intent,
        repository,
        runtime: { ...emptyRuntime("plugin-managed"), sourceSha256: authority.sourceSha256 ?? null },
      }, fs);
    }
    if (authority.status === "host-init-required"
      && authority.runtimeProjection === "plugin-managed-unattested") {
      return afterRuntimeLifecycleResult({
        root: legacy.root,
        intent,
        repository,
        runtime: {
          ...emptyRuntime("plugin-managed-unattested"),
          sourceSha256: authority.sourceSha256 ?? null,
        },
      }, fs);
    }
    if (authority.status === "projection-drift"
      && authority.runtimeProjection === "plugin-managed-invalid") {
      return pluginManagedAdmissionDriftResult({
        root: legacy.root,
        intent,
        repository,
        sourceSha256: authority.sourceSha256,
      });
    }
    if (["projection-current", "restart-required", "ready"].includes(authority.status)
      || authority.runtimeProjection === "noop") {
      try {
        const barrier = readRestartBarrier({ rootDir: legacy.root, repositoryCapability: repository.mode, deps: fs });
        if (barrier.status === "present" && barrier.barrier.state === "restart-required") {
          if (!runtimeRestartBindingCurrent(barrier.barrier, { codexExecutable: fs.codexExecutable })) {
            return lifecycleResult({
              status: "runtime-attestation-required",
              root: legacy.root,
              intent,
              repository,
              runtime: {
                status: "projection-current",
                sourceSha256: barrier.barrier.sourceSha256,
                targetsSha256: barrier.barrier.runtimeTargetsSha256,
                barrierSha256: barrier.rawSha256,
                readbackSha256: null,
              },
              nextAction: commandAction(
                [ONBOARDING_SCRIPT, "plan-readback", "--root", legacy.root],
                false,
                false,
                SCHEMA,
                ["runtime-attestation-required"],
              ),
              diagnostics: [lifecycleDiagnostic(
                "$.runtime",
                "restart_binding_drift",
                "the pending restart barrier is bound to a different Pipeline launcher, helper, or Codex executable",
                "review and apply the digest-bound readback bootstrap plan to replace the stale barrier",
              )],
            });
          }
          return lifecycleResult({ status: "restart-required", root: legacy.root, intent, repository,
            runtime: { status: "restart-required", sourceSha256: barrier.barrier.sourceSha256, targetsSha256: barrier.barrier.runtimeTargetsSha256, barrierSha256: barrier.rawSha256, readbackSha256: null },
            nextAction: restartAction(legacy.root, barrier.rawSha256),
            diagnostics: [lifecycleDiagnostic("$.runtime", "restart_required", "Codex runtime targets changed and require a fresh effective-runtime readback", "confirm the one-use restart action")],
          });
        }
        if (barrier.status === "present" && barrier.barrier.state === "cleared") {
          const current = readCurrentRuntimeReadback({
            rootDir: legacy.root,
            repositoryCapability: repository.mode,
            deps: fs,
          });
          if (current.status !== "current") throw new Error("cleared runtime readback marker is absent");
          return afterRuntimeLifecycleResult({ root: legacy.root, intent, repository,
            runtime: {
              status: "readback-current",
              sourceSha256: current.barrier.sourceSha256,
              targetsSha256: current.barrier.runtimeTargetsSha256,
              barrierSha256: current.barrierSha256,
              readbackSha256: current.readbackSha256,
            },
          }, fs);
        }
        if (barrier.status === "absent" && authority.status === "projection-current") {
          return lifecycleResult({
            status: "runtime-attestation-required",
            root: legacy.root,
            intent,
            repository,
            runtime: {
              status: "projection-current",
              sourceSha256: authority.sourceSha256 ?? null,
              targetsSha256: sha256(JSON.stringify(runtimePaths())),
              barrierSha256: null,
              readbackSha256: null,
            },
            nextAction: commandAction(
              [ONBOARDING_SCRIPT, "plan-readback", "--root", legacy.root],
              false,
              false,
              SCHEMA,
              ["runtime-attestation-required"],
            ),
            diagnostics: [lifecycleDiagnostic(
              "$.runtime",
              "restart_required",
              "the current Codex projection has no native effective-runtime readback",
              "review and apply the digest-bound readback bootstrap plan, then restart",
            )],
          });
        }
      } catch (error) {
        return runtimeFailureResult({ root: legacy.root, intent, repository }, error, {
          phase: "native-runtime-readback",
          code: "native_runtime_readback_unavailable",
          message: "private runtime readback state could not be observed safely",
          guidance: "repair the platform private-state/readback capability before retrying",
        });
      }
    }
  }
  const cleanupRecovery = partialCleanupRecoveryResult({ root: legacy.root, intent, repository });
  if (cleanupRecovery !== null) return cleanupRecovery;
  const partialPlan = planProjectPartialAuthorityAdoption({ rootDir: legacy.root, deps: fs });
  const reparable = partialPlan.status === "selection-required";
  return lifecycleResult({ status: "partial", root: legacy.root, intent, repository, runtime: emptyRuntime(),
    nextAction: reparable ? commandAction([ONBOARDING_SCRIPT, "plan-partial-authority", "--root", legacy.root], false, false, PARTIAL_AUTHORITY_PLAN_SCHEMA, ["selection-required", "ready"]) : null,
    diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the Pipeline authority is incomplete", reparable ? "run the typed partial-authority planner and bind an explicit PO selection" : "inspect the source and generated targets")] });
}

export function inspectProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {}, intent = "onboarding" } = {}) {
  return v4Inspection(rootDir, deps(overrides), intent);
}

export function planProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); const inspected = legacyInspection(rootDir, fs);
  if (!["fresh", "fresh-host-managed", "existing-unmanaged"].includes(inspected.status)) return { schema: PLAN_SCHEMA, status: inspected.status, root: inspected.root, diagnostics: inspected.diagnostics, targets: [], requiresExplicitActivation: true };
  const hostManaged = inspected.status === "fresh-host-managed";
  const git = hostManaged ? { ok: true, version: null } : gitCapability(fs, inspected.root);
  if (!git.ok) return { schema: PLAN_SCHEMA, status: "unsupported", root: inspected.root, diagnostics: [diagnostic("$.git", "git_initial_branch_unsupported", git.reason, "install Git 2.28 or newer before activation")], targets: [], requiresExplicitActivation: true };
  const intent = freshIntent(); const validation = validatePipelineUserV3(intent);
  if (!validation.ok) return { schema: PLAN_SCHEMA, status: "invalid-authority", root: inspected.root, diagnostics: validation.errors, targets: [], requiresExplicitActivation: true };
  const baselines = freshBaselines(intent, { hostManaged });
  const manifest = validateManifest(parseYaml(baselines[NEUTRAL_MANIFEST].bytes), { rootDir: inspected.root });
  if (manifest.status !== "ok") return { schema: PLAN_SCHEMA, status: "invalid-projection", root: inspected.root, diagnostics: manifest.errors, targets: [], requiresExplicitActivation: true };
  const internal = [
    ...[
      NEUTRAL_CALIBRATION,
      NEUTRAL_MANIFEST,
      ".claude/pipeline.json",
      ".claude/pipeline.yaml",
      ".claude/settings.json",
    ].map((path) => ({ path, bytes: baselines[path].bytes })),
    { path: SOURCE, bytes: renderYaml(intent) },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const targets = internal.map((target) => ({
    path: target.path,
    kind: target.path === SOURCE
      ? "source"
      : (target.path.startsWith("project/") ? "project-authority" : "runtime"),
    before: describe(null),
    after: describe(target.bytes),
    changed: true,
  }));
  const initializesGit = !hostManaged && (inspected.status === "fresh" || !inspected.entries.includes(".git"));
  const plan = { schema: PLAN_SCHEMA, status: "ready", root: inspected.root, state: inspected.status, intentSha256: sha256(JSON.stringify(stable(intent))), git: hostManaged ? { mode: "host-managed", initialBranch: null, version: null, initializesGit: false } : { mode: "local", initialBranch: "main", version: git.version, initializesGit }, targets, changes: targets.map((target) => target.path), requiresExplicitActivation: true, activation: { command: "apply --activate", createsGitRepository: initializesGit, createsCommit: false } };
  AUTHENTICATED.set(plan, { signature: JSON.stringify(plan), root: inspected.root, targets: internal, state: inspected.status, initializesGit, hostManaged });
  return plan;
}

function ensurePreimage(root, expectedState, fs) {
  const now = legacyInspection(root, fs);
  if (now.status !== expectedState) throw new Error(`root changed since planning (${now.status})`);
}

function physicalTreeSnapshot(path, fs) {
  const rows = [];
  function visit(current, relative) {
    const info = fs.lstatSync(current);
    if (info.isSymbolicLink()) throw new Error("Git control tree contains a symbolic link");
    if (info.isDirectory()) {
      rows.push({ path: relative, kind: "directory", dev: String(info.dev), ino: String(info.ino) });
      for (const name of fs.readdirSync(current).sort()) {
        visit(join(current, name), relative ? `${relative}/${name}` : name);
      }
      return;
    }
    if (!info.isFile() || info.nlink !== 1) throw new Error("Git control tree contains an unsafe file");
    rows.push({
      path: relative,
      kind: "file",
      dev: String(info.dev),
      ino: String(info.ino),
      sha256: sha256(fs.readFileSync(current)),
    });
  }
  visit(path, "");
  return rows;
}

function samePhysicalTree(path, expected, fs) {
  try {
    return JSON.stringify(physicalTreeSnapshot(path, fs)) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function ensureTargetParents(root, target, createdDirectories, fs) {
  const missing = [];
  let parent = dirname(target);
  while (parent !== root && !fs.existsSync(parent)) {
    missing.push(parent);
    parent = dirname(parent);
  }
  if (parent !== root) {
    const info = fs.lstatSync(parent);
    if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("target parent is not a physical directory");
  }
  for (const directory of missing.reverse()) {
    if (fs.existsSync(directory)) {
      const info = fs.lstatSync(directory);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("target parent appeared with an unsafe identity");
      continue;
    }
    fs.mkdirSync(directory, { mode: 0o700 });
    const identity = directoryIdentity(fs.lstatSync(directory));
    if (!identity) throw new Error("created target directory identity is unavailable");
    createdDirectories.push({ path: directory, identity });
  }
}

function rollback(root, created, createdDirectories, gitIdentity, gitTree, gitWasExpectedAbsent, fs) {
  const failures = [];
  for (const entry of [...created].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      if (!entry.identity || !sameIdentity(entry.identity, entry.path, fs)) {
        throw new Error("created target changed identity before rollback");
      }
      fs.unlinkSync(entry.path);
    } catch (error) { failures.push(error); }
  }
  for (const entry of [...createdDirectories].reverse()) {
    try {
      if (!fs.existsSync(entry.path)) continue;
      if (!entry.identity || !sameDirectoryIdentity(entry.identity, entry.path, fs)) {
        throw new Error("created target directory changed identity before rollback");
      }
      fs.rmdirSync(entry.path);
    } catch (error) { failures.push(error); }
  }
  const gitPath = join(root, ".git");
  if (gitWasExpectedAbsent && fs.existsSync(gitPath)) {
    try {
      if (!gitIdentity || !sameDirectoryIdentity(gitIdentity, gitPath, fs)) {
        throw new Error("created Git control directory changed identity before rollback");
      }
      if (!gitTree || !samePhysicalTree(gitPath, gitTree, fs)) {
        throw new Error("created Git control tree changed before rollback");
      }
      fs.rmSync(gitPath, { recursive: true, force: true });
    } catch (error) { failures.push(error); }
  }
  return failures;
}

export function applyProjectOnboardingV3(plan, { rootDir = plan?.root ?? process.cwd(), activate = false, deps: overrides = {} } = {}) {
  if (!activate) return { schema: PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")] };
  const state = plan && AUTHENTICATED.get(plan);
  if (!state || state.signature !== JSON.stringify(plan)) return { schema: PLAN_SCHEMA, status: "invalid-plan", diagnostics: [diagnostic("$", "invalid_plan", "apply accepts only an unchanged in-process onboarding plan", "run plan again") ] };
  const fs = deps(overrides); let root; const created = []; const createdDirectories = [];
  let gitIdentity = null; let gitTree = null; let gitWasExpectedAbsent = false;
  try {
    root = safeRoot(rootDir, fs);
    if (root !== state.root) throw new Error("apply root differs from authenticated onboarding plan root");
    ensurePreimage(root, state.state, fs);
    for (const target of state.targets) safePath(root, target.path, fs);
    const git = state.hostManaged ? { ok: true } : gitCapability(fs, root); if (!git.ok) throw new Error(git.reason);
    if (state.initializesGit) {
      gitWasExpectedAbsent = true;
      const initialized = fs.spawnSync("git", ["init", "--initial-branch=main"], { cwd: root, encoding: "utf8" });
      if (initialized.error || initialized.status !== 0) throw new Error(`git init --initial-branch=main failed: ${String(initialized.stderr ?? initialized.error ?? "unknown error").trim()}`);
      gitIdentity = directoryIdentity(fs.lstatSync(join(root, ".git")));
      if (!gitIdentity) throw new Error("created Git control directory identity is unavailable");
      gitTree = physicalTreeSnapshot(join(root, ".git"), fs);
    }
    for (const target of state.targets) {
      const path = safePath(root, target.path, fs);
      if (fs.existsSync(path)) throw new Error(`target appeared during activation: ${target.path}`);
      ensureTargetParents(root, path, createdDirectories, fs);
      fs.writeFileSync(path, target.bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      const identity = fileIdentity(fs.lstatSync(path));
      if (!identity) throw new Error(`created target identity is unavailable: ${target.path}`);
      created.push({ path, identity });
    }
    const source = inspectRunnerProfileMigrationV3({ rootDir: root, deps: fs });
    if (source.status !== "ready" || source.sourceKind !== "v3") throw new Error("post-apply portable source validation was not ready");
    const manifest = loadManifest(root);
    if (manifest.status !== "ok") throw new Error("post-apply canonical manifest validation was not ready");
    return { schema: PLAN_SCHEMA, status: "applied", root, changes: plan.changes, git: state.hostManaged ? { mode: "host-managed", initialized: false, initialBranch: null, committed: false } : { mode: "local", initialized: gitIdentity !== null, initialBranch: "main", committed: false }, authority: { status: "portable-seed", runtimeProjection: "missing" }, diagnostics: [] };
  } catch (error) {
    const rollbackFailures = root ? rollback(root, created, createdDirectories, gitIdentity, gitTree, gitWasExpectedAbsent, fs) : [];
    if (rollbackFailures.length) return { schema: PLAN_SCHEMA, status: "rollback-failed", root, diagnostics: [diagnostic("$.transaction", "rollback_failed", `${error.message}; rollback also failed: ${rollbackFailures[0].message}`, "repair generated paths manually before retrying")] };
    return { schema: PLAN_SCHEMA, status: "rolled-back", root, diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "repair the root and run inspect then plan again")] };
  }
}

function remoteAdoptionDiagnostic(code, message, guidance) {
  return diagnostic("$.remote", code, message, guidance);
}

function validRemoteAdoptionRequest(remote, ref) {
  if (typeof remote !== "string" || remote.length === 0 || remote.length > 2048 || remote.startsWith("-") || /[\0\r\n]/u.test(remote)) {
    return "remote must be one non-empty, NUL-free argv value";
  }
  if (!REMOTE_REF_RE.test(ref) || ref.includes("..") || ref.includes("//") || ref.endsWith("/") || ref.endsWith(".lock")) {
    return "ref must be one safe refs/heads/<branch> value";
  }
  return null;
}

function remoteAdoptionBranch(ref) { return ref.slice("refs/heads/".length); }

function remoteAdoptionTarget(rootDir, fs) {
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) {
    return { status: "unsafe", root: null, diagnostics: [remoteAdoptionDiagnostic("unsafe_root", error.message, "supply one real target directory")] };
  }
  let entries;
  try { entries = rootEntries(root, fs); } catch (error) {
    return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("target_unreadable", error.message, "repair target access before planning adoption")] };
  }
  const disallowed = entries.find((entry) => entry.symlink || ![".git", ".codex", ".agents"].includes(entry.name));
  if (disallowed) {
    return { status: "target-not-fresh", root, diagnostics: [remoteAdoptionDiagnostic(
      "target_not_fresh",
      `remote adoption accepts only an empty target or reserved control mounts; found ${disallowed.name}`,
      "use a new target directory; remote adoption never merges with user content",
    )] };
  }
  for (const reserved of [".codex", ".agents"]) {
    const entry = entries.find((candidate) => candidate.name === reserved);
    if (entry && (!entry.directory || entry.symlink)) {
      return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("reserved_control_unsafe", `${reserved} must be a physical directory`, "repair the reserved control mount before planning adoption")] };
    }
  }
  const git = entries.find((entry) => entry.name === ".git");
  if (git && !isHostControlLayout(root, entries, fs)) {
    return { status: "target-not-fresh", root, diagnostics: [remoteAdoptionDiagnostic("git_control_not_host_reserved", "remote adoption never mutates a normal initialized Git repository", "use an empty target or the exact empty host-reserved control layout")] };
  }
  const controlIdentities = [];
  for (const entry of entries) {
    const info = fs.lstatSync(join(root, entry.name));
    const identity = directoryIdentity(info) ?? fileIdentity(info);
    if (!identity) return { status: "unsafe", root, diagnostics: [remoteAdoptionDiagnostic("control_identity_unavailable", `the reserved ${entry.name} control path has no stable physical identity`, "repair the control mount before planning adoption")] };
    controlIdentities.push({ path: entry.name, kind: entry.directory ? "directory" : "file", identity });
  }
  return {
    status: "ready",
    root,
    entries: entries.map((entry) => entry.name),
    initializesGit: !git,
    protectedPaths: entries.filter((entry) => [".codex", ".agents"].includes(entry.name)).map((entry) => entry.name),
    controlIdentities,
    diagnostics: [],
  };
}

function runRemoteGit(fs, root, args) {
  const result = fs.spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result?.error || result?.status !== 0) {
    const reason = String(result?.stderr ?? result?.error?.message ?? "Git command failed").replace(/[\r\n]+/gu, " ").trim();
    throw new Error(reason || "Git command failed");
  }
  return String(result.stdout ?? "");
}

function observeRemoteBranch(fs, root, remote, ref) {
  let stdout;
  try { stdout = runRemoteGit(fs, root, ["ls-remote", "--refs", remote, ref]); }
  catch (error) {
    return { status: "remote-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_unavailable", error.message, "make the stated remote/ref available through the selected read-only Git transport")] };
  }
  const rows = stdout.trim().split(/\r?\n/u).filter(Boolean);
  if (rows.length !== 1) {
    return { status: "remote-ref-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_ref_unavailable", "the stated remote did not return exactly one branch ref", "confirm the exact existing refs/heads branch before adopting it")] };
  }
  const match = rows[0].match(/^([0-9a-f]{40}|[0-9a-f]{64})\t([^\t\r\n]+)$/u);
  if (!match || match[2] !== ref) {
    return { status: "remote-ref-unavailable", diagnostics: [remoteAdoptionDiagnostic("remote_ref_mismatch", "the remote response was not the exact requested branch ref", "retry only with the intended remote and refs/heads branch")] };
  }
  return { status: "ready", oid: match[1], diagnostics: [] };
}

function remoteAdoptionPlanDigest(plan) {
  return sha256(JSON.stringify(stable({
    root: plan.root,
    remote: plan.remote,
    ref: plan.ref,
    branch: plan.branch,
    revision: plan.revision,
    target: plan.target,
  })));
}

/**
 * Plan an explicit existing-remote branch adoption.  This is intentionally a
 * read-only remote observation: it does not seed authority, initialize Git,
 * create kickoff/cleanup state, or materialize any runtime target.
 */
export function planProjectRemoteAdoptionV4({ rootDir = process.cwd(), remote, ref, deps: overrides = {} } = {}) {
  const fs = deps(overrides);
  const invalid = validRemoteAdoptionRequest(remote, ref);
  if (invalid) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "invalid-request", root: null, diagnostics: [remoteAdoptionDiagnostic("invalid_request", invalid, "provide --remote and one existing --ref refs/heads/<branch>")], requiresExplicitActivation: true };
  const target = remoteAdoptionTarget(rootDir, fs);
  if (target.status !== "ready") return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: target.status, root: target.root, diagnostics: target.diagnostics, requiresExplicitActivation: true };
  const observed = observeRemoteBranch(fs, target.root, remote, ref);
  if (observed.status !== "ready") return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: observed.status, root: target.root, diagnostics: observed.diagnostics, requiresExplicitActivation: true };
  const plan = {
    schema: REMOTE_ADOPTION_PLAN_SCHEMA,
    status: "ready",
    root: target.root,
    remote,
    ref,
    branch: remoteAdoptionBranch(ref),
    revision: { oid: observed.oid, sha256: sha256(observed.oid) },
    target: {
      entries: target.entries,
      initializesGit: target.initializesGit,
      protectedPaths: target.protectedPaths,
      controlIdentities: target.controlIdentities,
      neverMoves: [".agents", ".codex"],
    },
    authority: { status: "deferred-until-exact-branch-checkout" },
    requiresExplicitActivation: true,
  };
  plan.planSha256 = remoteAdoptionPlanDigest(plan);
  plan.applyAction = {
    ...commandAction([ONBOARDING_SCRIPT, "adopt-remote", "apply", "--root", plan.root, "--remote", remote, "--ref", ref, "--plan-sha256", plan.planSha256, "--activate"], true, true, SCHEMA, ["ready", "migration-required", "runtime-initialization-required", "runtime-attestation-required", "restart-required", "kickoff-required", "remote-adoption-rolled-back", "remote-adoption-recovery-required"]),
    requiresHostBoundary: true,
  };
  return plan;
}

function ownedWorktreeSnapshot(root, fs) {
  const rows = [];
  for (const name of fs.readdirSync(root).sort()) {
    if ([".git", ".codex", ".agents"].includes(name)) continue;
    const path = join(root, name);
    const info = fs.lstatSync(path);
    if (info.isSymbolicLink()) throw new Error("remote checkout produced a symbolic link");
    if (info.isDirectory()) rows.push(...physicalTreeSnapshot(path, fs).map((row) => ({ ...row, path: row.path ? `${name}/${row.path}` : name })));
    else if (info.isFile() && info.nlink === 1) rows.push({ path: name, kind: "file", dev: String(info.dev), ino: String(info.ino), sha256: sha256(fs.readFileSync(path)) });
    else throw new Error("remote checkout produced an unsafe worktree entry");
  }
  return rows;
}

function rollbackRemoteAdoption(root, worktree, gitIdentity, gitTree, fs) {
  try {
    const current = ownedWorktreeSnapshot(root, fs);
    if (JSON.stringify(current) !== JSON.stringify(worktree)) throw new Error("remote worktree changed identity before rollback");
    for (const row of [...worktree].sort((a, b) => b.path.localeCompare(a.path))) {
      const path = join(root, row.path);
      if (row.kind === "file") fs.unlinkSync(path);
      else fs.rmdirSync(path);
    }
    const gitPath = join(root, ".git");
    if (gitIdentity) {
      if (!sameDirectoryIdentity(gitIdentity, gitPath, fs) || !samePhysicalTree(gitPath, gitTree, fs)) throw new Error("created Git control path changed before rollback");
      fs.rmSync(gitPath, { recursive: true, force: true });
    }
    return null;
  } catch (error) { return error; }
}

/** Apply an exact remote plan and then classify the branch's own authority. */
export function applyProjectRemoteAdoptionV4({ rootDir = process.cwd(), remote, ref, planSha256, activate = false, deps: overrides = {} } = {}) {
  if (!activate) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "activation-required", diagnostics: [remoteAdoptionDiagnostic("activation_required", "remote adoption requires explicit activation", "review the digest-bound adoption plan and pass --activate")] };
  const fs = deps(overrides);
  const plan = planProjectRemoteAdoptionV4({ rootDir, remote, ref, deps: fs });
  if (plan.status !== "ready" || plan.planSha256 !== planSha256) return plan;
  let gitIdentity = null;
  let gitTree = null;
  let worktree = [];
  let checkedOut = false;
  try {
    if (plan.target.initializesGit) {
      runRemoteGit(fs, plan.root, ["init", "--initial-branch=main"]);
      const gitPath = join(plan.root, ".git");
      gitIdentity = directoryIdentity(fs.lstatSync(gitPath));
      if (!gitIdentity) throw new Error("created Git control directory identity is unavailable");
      gitTree = physicalTreeSnapshot(gitPath, fs);
    }
    runRemoteGit(fs, plan.root, ["remote", "add", "origin", plan.remote]);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    runRemoteGit(fs, plan.root, ["fetch", "--no-tags", "origin", `${plan.ref}:refs/remotes/origin/${plan.branch}`]);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    const observed = runRemoteGit(fs, plan.root, ["rev-parse", `refs/remotes/origin/${plan.branch}`]).trim();
    if (observed !== plan.revision.oid) throw new Error("fetched remote branch no longer matches the digest-bound plan");
    const names = runRemoteGit(fs, plan.root, ["ls-tree", "-r", "--name-only", plan.revision.oid]).split(/\r?\n/u);
    if (names.some((name) => [".agents", ".codex"].some((reserved) => name === reserved || name.startsWith(`${reserved}/`)))) {
      throw new Error("remote branch contains a reserved control path; adoption never moves .agents or .codex");
    }
    runRemoteGit(fs, plan.root, ["checkout", "--no-track", "-b", plan.branch, plan.revision.oid]);
    checkedOut = true;
    worktree = ownedWorktreeSnapshot(plan.root, fs);
    if (gitIdentity) gitTree = physicalTreeSnapshot(join(plan.root, ".git"), fs);
    runRemoteGit(fs, plan.root, ["branch", "--set-upstream-to", `origin/${plan.branch}`, plan.branch]);
    return v4Inspection(plan.root, fs, "onboarding");
  } catch (error) {
    // An owned, newly-created Git control tree can be removed only when both
    // the checkout tree and Git identity remain exactly the transaction's.
    // Host-owned control mounts are deliberately left for their owner instead
    // of pretending a generic local rollback is safe.
    if (gitIdentity) {
      const rollbackError = rollbackRemoteAdoption(plan.root, worktree, gitIdentity, gitTree, fs);
      if (!rollbackError) return { schema: REMOTE_ADOPTION_PLAN_SCHEMA, status: "remote-adoption-rolled-back", root: plan.root, diagnostics: [remoteAdoptionDiagnostic("remote_adoption_rolled_back", error.message, "the exact transaction was rolled back; run the read-only plan again before retrying")] };
    }
    return {
      schema: REMOTE_ADOPTION_PLAN_SCHEMA,
      status: "remote-adoption-recovery-required",
      root: plan.root,
      diagnostics: [remoteAdoptionDiagnostic("remote_adoption_recovery_required", error.message, "the target or host-owned Git control path changed during adoption; preserve it and use the Git owner recovery path")],
      nextAction: commandAction([ONBOARDING_SCRIPT, "adopt-remote", "plan", "--root", plan.root, "--remote", plan.remote, "--ref", plan.ref], false, false, REMOTE_ADOPTION_PLAN_SCHEMA, ["ready", "target-not-fresh", "remote-unavailable", "remote-ref-unavailable"]),
    };
  }
}

function planLifecycle(rootDir, fs, operation) {
  const observed = v4Inspection(rootDir, fs);
  if (operation === "portable") {
    if (!["portable-seed-required", "adoption-required"].includes(observed.status)) return observed;
    const plan = planProjectOnboardingV3({ rootDir, deps: fs });
    if (plan.status !== "ready") return observed;
    return { ...observed, nextAction: commandAction([ONBOARDING_SCRIPT, "apply-portable-seed", "--root", plan.root, "--plan-sha256", lifecyclePlanDigest(plan), "--activate"], true, true, SCHEMA, ["runtime-initialization-required", "restart-required", "kickoff-required"]) };
  }
  if (operation === "repair" && observed.status === "continuity-damaged") {
    const plan = planOnboardingContinuityRepair({
      rootDir,
      repositoryCapability: observed.repository.mode,
      spawn: fs.spawnSync,
    });
    if (plan.status !== "ready") {
      return {
        ...observed,
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.continuity",
          "continuity_repair_unavailable",
          "the damaged continuity has no bounded automatic repair",
          "preserve the artifacts and use the continuity-owning workflow; do not retry plan-repair",
        )],
      };
    }
    return {
      ...observed,
      nextAction: commandAction(
        [ONBOARDING_SCRIPT, "apply-repair", "--root", plan.root, "--plan-sha256", plan.planSha256, "--activate"],
        true,
        true,
        SCHEMA,
        ["ready"],
      ),
    };
  }
  if (operation === "runtime" || operation === "repair" || operation === "readback") {
    const expected = operation === "runtime"
      ? "runtime-initialization-required"
      : operation === "repair"
        ? "projection-drift"
        : "runtime-attestation-required";
    if (observed.status !== expected) return observed;
    const plan = planRunnerProfileMigrationV3({ rootDir, deps: fs, initializeMissingRuntimeForSlimV3: operation === "runtime" });
    if (operation === "readback" ? plan.status !== "noop" : plan.status !== "ready") return observed;
    const statuses = operation === "runtime"
      ? ["restart-required"]
      : operation === "repair"
        ? ["restart-required", "kickoff-required", "ready"]
        : ["restart-required"];
    const applyCommand = operation === "runtime"
      ? "initialize-runtime"
      : operation === "repair"
        ? "apply-repair"
        : "apply-readback";
    return { ...observed, nextAction: commandAction([ONBOARDING_SCRIPT, applyCommand, "--root", plan.root, "--plan-sha256", lifecyclePlanDigest(plan), "--activate"], true, true, SCHEMA, statuses) };
  }
  return observed;
}

function applyLifecycle(rootDir, fs, operation, planSha256, activate) {
  if (!activate || typeof planSha256 !== "string" || !/^[a-f0-9]{64}$/u.test(planSha256)) return v4Inspection(rootDir, fs);
  if (operation === "portable") {
    const plan = planProjectOnboardingV3({ rootDir, deps: fs });
    if (plan.status !== "ready" || lifecyclePlanDigest(plan) !== planSha256) return v4Inspection(rootDir, fs);
    applyProjectOnboardingV3(plan, { rootDir, activate: true, deps: fs });
    return v4Inspection(rootDir, fs);
  }
  const beforeApply = v4Inspection(rootDir, fs);
  if (operation === "repair" && beforeApply.status === "continuity-damaged") {
    const plan = planOnboardingContinuityRepair({
      rootDir,
      repositoryCapability: beforeApply.repository.mode,
      spawn: fs.spawnSync,
    });
    if (plan.status !== "ready" || plan.planSha256 !== planSha256) return beforeApply;
    try {
      applyOnboardingContinuityRepair({
        rootDir,
        repositoryCapability: beforeApply.repository.mode,
        expectedPlanSha256: planSha256,
        activate: true,
        deps: { spawn: fs.spawnSync },
      });
    } catch {
      return v4Inspection(rootDir, fs);
    }
    return v4Inspection(rootDir, fs);
  }
  const expectedBeforeApply = operation === "runtime"
    ? "runtime-initialization-required"
    : operation === "repair"
      ? "projection-drift"
      : "runtime-attestation-required";
  if (beforeApply.status !== expectedBeforeApply) return beforeApply;
  if (operation !== "readback") {
    try {
      probeSelectedRuntimeTargets(beforeApply.root, fs);
    } catch {
      return runtimeTargetReadOnlyResult(beforeApply);
    }
  }
  const plan = planRunnerProfileMigrationV3({ rootDir, deps: fs, initializeMissingRuntimeForSlimV3: operation === "runtime" });
  const expectedPlanStatus = operation === "readback" ? "noop" : "ready";
  if (plan.status !== expectedPlanStatus || lifecyclePlanDigest(plan) !== planSha256) return v4Inspection(rootDir, fs);
  const runtimeTargets = plan.targets.filter((target) => target.kind === "runtime" && target.path.startsWith(".codex/")).map((target) => ({
    path: target.path, beforeSha256: target.before.sha256, afterSha256: target.after.sha256,
  })).sort((left, right) => left.path.localeCompare(right.path));
  let binding;
  try {
    binding = (fs.prepareRuntimeRestartBinding ?? prepareRuntimeRestartBinding)({
      rootDir: plan.root,
      sourceSha256: plan.sourceSha256,
      runtimeTargets,
      codexExecutable: fs.codexExecutable,
    });
  } catch (error) {
    return runtimeFailureResult(beforeApply, error, {
      phase: "runtime-executable-binding",
      code: "runtime_executable_binding_failed",
      message: "the trusted Codex runtime executable could not be bound",
      guidance: "repair executable discovery and retry the unchanged digest-bound plan",
    });
  }
  let persisted;
  try {
    // The barrier is durable before the target transaction begins. A crash in
    // either direction therefore blocks rather than claiming a loaded runtime.
    persisted = (fs.persistRestartBarrier ?? persistRestartBarrier)({
      rootDir: plan.root,
      repositoryCapability: beforeApply.repository.mode,
      binding,
      deps: fs,
    });
  } catch (error) {
    return runtimeFailureResult(beforeApply, error, {
      phase: "restart-barrier-persist",
      code: "restart_barrier_publication_failed",
      message: "the restart barrier could not be published before runtime mutation",
      guidance: "repair private restart-state persistence before retrying",
    });
  }
  if (operation === "readback") return v4Inspection(rootDir, fs);
  const applied = applyRunnerProfileMigrationV3(plan, { rootDir, activate: true, deps: fs });
  if (applied.status !== "applied" && persisted.written) {
    try {
      (fs.removeRestartBarrierCas ?? removeRestartBarrierCas)({
        rootDir: plan.root,
        repositoryCapability: beforeApply.repository.mode,
        expectedRawSha256: persisted.rawSha256,
        deps: fs,
      });
      for (const directory of [...(persisted.createdDirectories ?? [])].reverse()) {
        if (!fs.existsSync(directory)) continue;
        const info = fs.lstatSync(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("private runtime directory changed before rollback");
        fs.rmdirSync(directory);
        fsyncDirectory(dirname(directory), fs);
      }
    } catch {
      return runtimeFailureResult(beforeApply, null, {
        phase: "runtime-target-transaction",
        code: "exact_rollback_failed",
        message: "failed runtime activation could not restore its exact restart-state preimage",
        guidance: "inspect the typed private restart state before retrying",
      });
    }
  }
  if (applied.status !== "applied" && applied.failureClass === "runtime-target-read-only") {
    return runtimeTargetReadOnlyResult(beforeApply);
  }
  if (applied.status !== "applied") {
    return runtimeFailureResult(beforeApply, null, {
      phase: "runtime-target-transaction",
      code: "runtime_target_mutation_failed",
      message: "the runtime target transaction failed after durable barrier publication",
      guidance: "repair the target transaction failure and retry from the observed barrier state",
    });
  }
  return v4Inspection(rootDir, fs);
}

export function planProjectOnboardingLifecycleV4({ rootDir = process.cwd(), deps: overrides = {}, operation = "portable" } = {}) {
  return planLifecycle(rootDir, deps(overrides), operation);
}

export function applyProjectOnboardingLifecycleV4({ rootDir = process.cwd(), deps: overrides = {}, operation = "portable", planSha256, activate = false } = {}) {
  return applyLifecycle(rootDir, deps(overrides), operation, planSha256, activate);
}

export function planProjectOnboardingKickoffV4({
  rootDir = process.cwd(),
  goal,
  deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding");
  if (observed.status !== "kickoff-required") return observed;
  return planOnboardingKickoff({
    rootDir: observed.root,
    goal,
    repositoryCapability: observed.repository.mode,
    onboardingScript: ONBOARDING_SCRIPT,
    spawn: fs.spawnSync,
  });
}

export function applyProjectOnboardingKickoffV4({
  rootDir = process.cwd(),
  goal,
  planSha256,
  activate = false,
  deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding");
  if (!["kickoff-required", "ready"].includes(observed.status)
    || !["absent-pristine", "valid"].includes(observed.continuity.status)) {
    return observed;
  }
  const plan = reconstructOnboardingKickoffPlan({
    rootDir: observed.root,
    goal,
    repositoryCapability: observed.repository.mode,
    onboardingScript: ONBOARDING_SCRIPT,
    spawn: fs.spawnSync,
  });
  applyOnboardingKickoff({
    plan,
    expectedPlanSha256: planSha256,
    activate,
    deps: { ...overrides, spawn: fs.spawnSync },
  });
  return v4Inspection(rootDir, fs, "onboarding");
}

export function planProjectOnboardingKickoffPromotionV4({
  rootDir = process.cwd(), profile, featureId, planPath, prdPath, specPath, deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding");
  if (observed.status !== "ready" || observed.continuity.status !== "valid") return observed;
  return planOnboardingKickoffPromotion({
    rootDir: observed.root, profile, featureId, planPath, prdPath, specPath,
    repositoryCapability: observed.repository.mode, onboardingScript: ONBOARDING_SCRIPT, spawn: fs.spawnSync,
  });
}

export function applyProjectOnboardingKickoffPromotionV4({
  rootDir = process.cwd(), profile, featureId, planPath, prdPath, specPath,
  planSha256, activate = false, deps: overrides = {},
} = {}) {
  const fs = deps(overrides);
  const observed = v4Inspection(rootDir, fs, "onboarding");
  if (observed.status !== "ready" || observed.continuity.status !== "valid") return observed;
  const plan = reconstructOnboardingKickoffPromotionPlan({
    rootDir: observed.root, profile, featureId, planPath, prdPath, specPath,
    repositoryCapability: observed.repository.mode, onboardingScript: ONBOARDING_SCRIPT, spawn: fs.spawnSync,
  });
  applyOnboardingKickoffPromotion({
    plan, expectedPlanSha256: planSha256, activate, deps: { ...overrides, spawn: fs.spawnSync },
  });
  return v4Inspection(rootDir, fs, "onboarding");
}
