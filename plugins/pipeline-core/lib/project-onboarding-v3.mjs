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
import { appServerNextAction, observeOnboardingAppServer } from "./codex-onboarding-app-server.mjs";
import { observeCodexOnboardingCapabilities } from "./codex-onboarding-capabilities.mjs";
import {
  applyOnboardingContinuityRepair,
  applyOnboardingKickoff,
  classifyOnboardingContinuity,
  KICKOFF_GOAL_MAX_BYTES,
  planOnboardingContinuityRepair,
  planOnboardingKickoff,
  reconstructOnboardingKickoffPlan,
} from "./onboarding-continuity.mjs";
import { applyRunnerProfileMigrationV3, inspectRunnerProfileMigrationV3, planRunnerProfileMigrationV3 } from "./runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { loadManifest, validateManifest } from "./manifest.mjs";
import { parseYaml } from "./yaml-lite.mjs";
import { codexCustomAgentSeed, loadRuntimeProjectionV3OwnedKeys, planRuntimeProjectionV3 } from "./runtime-projection-v3.mjs";
import {
  prepareRuntimeRestartBinding, persistRestartBarrier, readCurrentRuntimeReadback,
  readRestartBarrier, removeRestartBarrierCas, runtimeRestartBindingCurrent,
} from "./codex-onboarding-runtime.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";

const SOURCE = "pipeline.user.yaml";
const SCHEMA = "pipeline.project-onboarding.v4";
const LEGACY_SCHEMA = "pipeline.project-onboarding.v3";
const PLAN_SCHEMA = "pipeline.project-onboarding-plan.v3";
const SOURCE_RECOVERY_SCHEMA = "pipeline.project-onboarding-source-recovery.v1";
const MANIFEST_REPAIR_PLAN_SCHEMA = "pipeline.project-onboarding-manifest-repair-plan.v1";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const AUTHENTICATED = new WeakMap();
const AUTHENTICATED_MANIFEST_REPAIRS = new WeakMap();
const USER_RESERVED_PATHS = new Set([".agents", ".claude", ".codex"]);
const ONBOARDING_SCRIPT = fileURLToPath(new URL("../scripts/project-onboarding-v3.mjs", import.meta.url));
const MIGRATION_SCRIPT = fileURLToPath(new URL("../scripts/runner-profile-migration-v3.mjs", import.meta.url));
const HOST_REPOSITORY_INIT_SCRIPT = fileURLToPath(new URL("../scripts/codex-host-repository-init.mjs", import.meta.url));

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

function emptyContinuity() { return { status: "unavailable", stateSha256: null, handoverSha256: null, historySha256: null }; }

function emptyAppServer() { return { required: false, status: "not-requested", code: null }; }

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
    const calibration = JSON.parse(fs.readFileSync(safePath(root, ".claude/pipeline.json", fs), "utf8"));
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
    'node "$P" \\',
    '  --root "$R" \\',
    '  --barrier-sha256 "$B" \\',
    "  --activate",
  ];
  const powershell = [
    ...boundedAssignmentLines("$P", launcher, true),
    ...boundedAssignmentLines("$R", root, true),
    ...boundedAssignmentLines("$B", barrierSha256, true),
    "& node $P `",
    "  --root $R `",
    "  --barrier-sha256 $B `",
    "  --activate",
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
  if (value.required === false) return value.status === "not-requested" && value.code === null;
  if (value.required !== true || typeof value.code !== "string" || !/^CAS-[A-Z0-9-]+$/u.test(value.code)) return false;
  if (value.status === "running") return value.code === "CAS-READY";
  if (value.status === "execution-denied") return value.code === "CAS-EXECUTION-UNAVAILABLE";
  if (value.status === "not-running") return value.code === "CAS-DAEMON-UNREACHABLE";
  return value.status === "unavailable"
    && value.code !== "CAS-READY"
    && value.code !== "CAS-DAEMON-UNREACHABLE";
}

function observeReadyAppServer(intent, fs) {
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

function readyLifecycleResult({ root, intent, repository, runtime, continuity = emptyContinuity() }, fs) {
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
  // Runtime projection and App-Server health are distinct authorities. A
  // plugin-managed projection still requires the same single, read-only
  // App-Server observation as a project-local projection before bootstrap,
  // session, or dispatch may report ready.
  const appServer = observeReadyAppServer(intent, fs);
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

function selectedRunnerIsCodex(root, fs) {
  try {
    const parsed = parseYaml(fs.readFileSync(safePath(root, SOURCE, fs), "utf8"));
    return parsed?.runners?.default === "codex";
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
        if (!selectedRunnerIsCodex(legacy.root, fs)) {
          return lifecycleResult({ status: "invalid", root: legacy.root, runner: null, intent, repository, runtime: emptyRuntime(),
            nextAction: commandAction([ONBOARDING_SCRIPT, "plan-source-recovery", "--root", legacy.root], false, false, SOURCE_RECOVERY_SCHEMA, ["recoverable", "unrepairable"]),
            diagnostics: [lifecycleDiagnostic("$.source.runners.default", "source_invalid", "the selected runner is not Codex", "review the unsupported source transition disposition") ] });
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
    return lifecycleResult({ status: "partial", root: legacy.root, intent, repository, runtime: emptyRuntime(), nextAction: null,
      diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the project has an incomplete Pipeline authority", "inspect the existing source and generated targets")] });
  }
  if (legacy.status === "ready") {
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
        return lifecycleResult({ status: "runtime-readback-unavailable", root: legacy.root, intent, repository,
          runtime: emptyRuntime("readback-unavailable"), nextAction: null,
          diagnostics: [lifecycleDiagnostic("$.runtime", "runtime_readback_unavailable", "private restart state could not be observed safely", "restart/readback capability is unavailable in this environment")],
        });
      }
    }
  }
  return lifecycleResult({ status: "partial", root: legacy.root, intent, repository, runtime: emptyRuntime(), nextAction: null,
    diagnostics: [lifecycleDiagnostic("$.authority", "partial_authority", "the Pipeline authority is incomplete", "inspect the source and generated targets")] });
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
  const manifest = validateManifest(parseYaml(baselines[".claude/pipeline.yaml"].bytes), { rootDir: inspected.root });
  if (manifest.status !== "ok") return { schema: PLAN_SCHEMA, status: "invalid-projection", root: inspected.root, diagnostics: manifest.errors, targets: [], requiresExplicitActivation: true };
  const internal = [
    ...[".claude/pipeline.json", ".claude/pipeline.yaml", ".claude/settings.json"].map((path) => ({ path, bytes: baselines[path].bytes })),
    { path: SOURCE, bytes: renderYaml(intent) },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const targets = internal.map((target) => ({ path: target.path, kind: target.path === SOURCE ? "source" : "runtime", before: describe(null), after: describe(target.bytes), changed: true }));
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
  let persisted;
  try {
    const binding = prepareRuntimeRestartBinding({
      rootDir: plan.root,
      sourceSha256: plan.sourceSha256,
      runtimeTargets,
      codexExecutable: fs.codexExecutable,
    });
    // The barrier is durable before the target transaction begins. A crash in
    // either direction therefore blocks rather than claiming a loaded runtime.
    persisted = persistRestartBarrier({ rootDir: plan.root, repositoryCapability: beforeApply.repository.mode, binding, deps: fs });
  } catch {
    const observed = v4Inspection(rootDir, fs);
    return lifecycleResult({ status: "runtime-readback-unavailable", root: observed.root, intent: observed.intent, repository: observed.repository,
      runtime: emptyRuntime("readback-unavailable"), nextAction: null,
      diagnostics: [lifecycleDiagnostic("$.runtime", "runtime_readback_unavailable", "restart barrier could not be persisted before runtime mutation", "restart/readback capability is unavailable in this environment")],
    });
  }
  if (operation === "readback") return v4Inspection(rootDir, fs);
  const applied = applyRunnerProfileMigrationV3(plan, { rootDir, activate: true, deps: fs });
  if (applied.status !== "applied" && persisted.written) {
    try {
      removeRestartBarrierCas({ rootDir: plan.root, repositoryCapability: beforeApply.repository.mode, expectedRawSha256: persisted.rawSha256, deps: fs });
      for (const directory of [...(persisted.createdDirectories ?? [])].reverse()) {
        if (!fs.existsSync(directory)) continue;
        const info = fs.lstatSync(directory);
        if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("private runtime directory changed before rollback");
        fs.rmdirSync(directory);
        fsyncDirectory(dirname(directory), fs);
      }
    } catch {
      return lifecycleResult({
        status: "runtime-readback-unavailable",
        root: beforeApply.root,
        intent: beforeApply.intent,
        repository: beforeApply.repository,
        runtime: emptyRuntime("readback-unavailable"),
        nextAction: null,
        diagnostics: [lifecycleDiagnostic(
          "$.runtime",
          "runtime_readback_unavailable",
          "failed runtime activation could not remove its exact restart barrier",
          "inspect private restart state before retrying",
        )],
      });
    }
  }
  if (applied.status !== "applied" && applied.failureClass === "runtime-target-read-only") {
    return runtimeTargetReadOnlyResult(beforeApply);
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
