// SPDX-License-Identifier: SUL-1.0

/**
 * Fresh consumer-root onboarding for the public V3 authority.  Unlike the
 * migration, this is deliberately narrow: it writes only absent, Pipeline-owned
 * targets after an explicit activation. A pre-existing ungoverned project is a
 * distinct additive adoption path; existing authority stays owned by the
 * migration/repair workflow.
 */
import { createHash } from "node:crypto";
import {
  accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, readFileSync,
  rmSync, rmdirSync, unlinkSync, writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve, sep } from "node:path";

import { CODEX_HOST_CONTROL_PATHS, hasCodexHostControlLayout } from "./codex-host-layout.mjs";
import { inspectRunnerProfileMigrationV3, planRunnerProfileMigrationV3 } from "./runner-profile-migration-v3.mjs";
import { loadRunnerProfilesV3Registry, validatePipelineUserV3 } from "./runner-profiles-v3.mjs";
import { codexCustomAgentSeed, loadRuntimeProjectionV3OwnedKeys, planRuntimeProjectionV3 } from "./runtime-projection-v3.mjs";
import { validateV3BootstrapAuthority } from "../scripts/v3-bootstrap-authority.mjs";

const SOURCE = "pipeline.user.yaml";
const SCHEMA = "pipeline.project-onboarding.v3";
const PLAN_SCHEMA = "pipeline.project-onboarding-plan.v3";
const SAFE_RELATIVE = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/u;
const AUTHENTICATED = new WeakMap();
const USER_RESERVED_PATHS = new Set([".agents", ".claude", ".codex"]);

function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function diagnostic(path, code, message, repair) { return { path, code, message, repair }; }
function describe(bytes) { return bytes === null ? { status: "absent", sha256: null, byteLength: 0 } : { status: "present", sha256: sha256(bytes), byteLength: Buffer.byteLength(bytes, "utf8") }; }
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
  return { accessSync, constants, existsSync, lstatSync, mkdirSync, readdirSync, realpathSync, readFileSync, rmSync, rmdirSync, unlinkSync, writeFileSync, spawnSync, ...overrides };
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

function isHostControlLayout(root, entries, fs) {
  return entries.length >= 2 && entries.length <= CODEX_HOST_CONTROL_PATHS.length
    && entries.every((entry) => CODEX_HOST_CONTROL_PATHS.includes(entry.name))
    && [".codex", ".git"].every((name) => entries.some((entry) => entry.name === name))
    && hasCodexHostControlLayout(root, {
      access: fs.accessSync,
      fsConstants: fs.constants,
      lstat: fs.lstatSync,
      readdir: fs.readdirSync,
    });
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
function freshBaselines({ hostManaged = false } = {}) {
  return {
    ".claude/settings.json": { status: "present", bytes: "{}\n" },
    // `git diff --check` is deliberately HEAD-independent: onboarding creates
    // no commit, so `git diff --check HEAD` would make the one verify command
    // fail before the user's initial commit exists.
    ".claude/pipeline.json": { status: "present", bytes: `${JSON.stringify({ project: "new-project", verify: "git diff --check", handover: "docs/state.md", autonomy: "gated", branchModel: "feature-branch", repositoryMode: hostManaged ? "host-managed" : "local-only", worktree: "optional", stakes: "standard", constraints: [hostManaged ? "Codex owns .git and .codex; configure project verification before delivery." : "Configure project-specific policy before delivery."] }, null, 2)}\n` },
    ".claude/pipeline.yaml": { status: "present", bytes: "language:\n  human_facing: en\nmodelRouting:\n  legacy:\n    model: legacy\n    effort: low\n" },
    ".codex/config.toml": { status: "present", bytes: "" },
    ".codex/agents/implementor.toml": { status: "present", bytes: codexCustomAgentSeed("implementor") },
    ".codex/agents/critic.toml": { status: "present", bytes: codexCustomAgentSeed("critic") },
    ".codex/agents/consult-advisor.toml": { status: "present", bytes: "" },
  };
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
function inspection(rootDir, fs) {
  let root;
  try { root = safeRoot(rootDir, fs); } catch (error) { return { schema: SCHEMA, status: "unsafe", diagnostics: [diagnostic("$.root", "unsafe_root", error.message, "supply a real non-symlink directory")] }; }
  let entries;
  try { entries = rootEntries(root, fs); } catch (error) { return { schema: SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.root", "root_unreadable", error.message, "repair root access before onboarding")] }; }
  const link = entries.find((entry) => entry.symlink);
  if (link) return { schema: SCHEMA, status: "unsafe", root, diagnostics: [diagnostic(`$.entries.${link.name}`, "symlink_entry", "fresh onboarding rejects symbolic links", "use a real empty directory")], entries: entries.map((entry) => entry.name) };
  if (entries.length === 0) return { schema: SCHEMA, status: "fresh", root, diagnostics: [], entries: [] };
  if (isHostControlLayout(root, entries, fs)) {
    return {
      schema: SCHEMA,
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
    const migrated = inspectRunnerProfileMigrationV3({ rootDir: root });
    if (migrated.status === "ready" && ["v0", "v1", "v2"].includes(migrated.sourceKind)) {
      return { schema: SCHEMA, status: "migration-required", root, sourceKind: migrated.sourceKind, diagnostics: [diagnostic("$.source", "legacy_source", "the root has a legacy pipeline authority", "use runner-profile-migration-v3 inspect, plan, then apply --activate")], entries: entries.map((entry) => entry.name) };
    }
    if (migrated.status === "ready" && migrated.sourceKind === "v3") {
      const authority = validateV3BootstrapAuthority({ rootDir: root });
      if (authority.status === "ready") return { schema: SCHEMA, status: "ready", root, diagnostics: [], entries: entries.map((entry) => entry.name) };
    }
  }
  let runtimePresent;
  try { runtimePresent = hasOwnRuntime(root, fs); }
  catch (error) {
    return { schema: SCHEMA, status: "unsafe", root, diagnostics: [diagnostic("$.runtime", "unsafe_runtime_path", error.message, "remove symbolic links before onboarding")], entries: entries.map((entry) => entry.name) };
  }
  if (!runtimePresent && !fs.existsSync(sourcePath) && isAdoptableUnmanagedRoot(entries, root, fs)) {
    return {
      schema: SCHEMA,
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
  return { schema: SCHEMA, status: "partial", root, diagnostics: [diagnostic("$.root", code, "the root is not a brand-new empty project directory", "do not overwrite it; inspect or repair its existing authority explicitly")], entries: entries.map((entry) => entry.name) };
}

export function inspectProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {} } = {}) { return inspection(rootDir, deps(overrides)); }

export function planProjectOnboardingV3({ rootDir = process.cwd(), deps: overrides = {} } = {}) {
  const fs = deps(overrides); const inspected = inspection(rootDir, fs);
  if (!["fresh", "fresh-host-managed", "existing-unmanaged"].includes(inspected.status)) return { schema: PLAN_SCHEMA, status: inspected.status, root: inspected.root, diagnostics: inspected.diagnostics, targets: [], requiresExplicitActivation: true };
  const hostManaged = inspected.status === "fresh-host-managed";
  const git = hostManaged ? { ok: true, version: null } : gitCapability(fs, inspected.root);
  if (!git.ok) return { schema: PLAN_SCHEMA, status: "unsupported", root: inspected.root, diagnostics: [diagnostic("$.git", "git_initial_branch_unsupported", git.reason, "install Git 2.28 or newer before activation")], targets: [], requiresExplicitActivation: true };
  const intent = freshIntent(); const validation = validatePipelineUserV3(intent);
  if (!validation.ok) return { schema: PLAN_SCHEMA, status: "invalid-authority", root: inspected.root, diagnostics: validation.errors, targets: [], requiresExplicitActivation: true };
  const projection = planRuntimeProjectionV3(intent, { source: SOURCE, baselines: freshBaselines({ hostManaged }) });
  if (projection.status !== "ready") return { schema: PLAN_SCHEMA, status: "invalid-projection", root: inspected.root, diagnostics: projection.diagnostics ?? [], targets: [], requiresExplicitActivation: true };
  const internal = [
    ...projection.targets.filter((target) => !hostManaged || !target.path.startsWith(".codex/")).map((target) => ({ path: target.path, bytes: target.after.bytes })),
    { path: SOURCE, bytes: renderYaml(intent) },
  ].sort((left, right) => left.path.localeCompare(right.path));
  const targets = internal.map((target) => ({ path: target.path, kind: target.path === SOURCE ? "source" : "runtime", before: describe(null), after: describe(target.bytes), changed: true }));
  const initializesGit = !hostManaged && (inspected.status === "fresh" || !inspected.entries.includes(".git"));
  const plan = { schema: PLAN_SCHEMA, status: "ready", root: inspected.root, state: inspected.status, intentSha256: sha256(JSON.stringify(stable(intent))), git: hostManaged ? { mode: "host-managed", initialBranch: null, version: null, initializesGit: false } : { mode: "local", initialBranch: "main", version: git.version, initializesGit }, targets, changes: targets.map((target) => target.path), requiresExplicitActivation: true, activation: { command: "apply --activate", createsGitRepository: initializesGit, createsCommit: false } };
  AUTHENTICATED.set(plan, { signature: JSON.stringify(plan), root: inspected.root, targets: internal, state: inspected.status, initializesGit, hostManaged });
  return plan;
}

function ensurePreimage(root, expectedState, fs) {
  const now = inspection(root, fs);
  if (now.status !== expectedState) throw new Error(`root changed since planning (${now.status})`);
}
function removeEmptyParents(root, target, fs) {
  let parent = dirname(target);
  while (parent !== root) {
    try { fs.rmdirSync(parent); } catch (error) { if (error?.code === "ENOTEMPTY" || error?.code === "ENOENT") break; throw error; }
    parent = dirname(parent);
  }
}
function rollback(root, created, gitCreated, fs) {
  const failures = [];
  for (const target of [...created].reverse()) {
    try { if (fs.existsSync(target)) fs.unlinkSync(target); removeEmptyParents(root, target, fs); } catch (error) { failures.push(error); }
  }
  if (gitCreated) { try { fs.rmSync(join(root, ".git"), { recursive: true, force: true }); } catch (error) { failures.push(error); } }
  return failures;
}

export function applyProjectOnboardingV3(plan, { rootDir = plan?.root ?? process.cwd(), activate = false, deps: overrides = {} } = {}) {
  if (!activate) return { schema: PLAN_SCHEMA, status: "activation-required", diagnostics: [diagnostic("$.activate", "activation_required", "apply requires explicit activation", "review the plan and pass --activate")] };
  const state = plan && AUTHENTICATED.get(plan);
  if (!state || state.signature !== JSON.stringify(plan)) return { schema: PLAN_SCHEMA, status: "invalid-plan", diagnostics: [diagnostic("$", "invalid_plan", "apply accepts only an unchanged in-process onboarding plan", "run plan again") ] };
  const fs = deps(overrides); let root; const created = []; let gitCreated = false;
  try {
    root = safeRoot(rootDir, fs);
    if (root !== state.root) throw new Error("apply root differs from authenticated onboarding plan root");
    ensurePreimage(root, state.state, fs);
    for (const target of state.targets) safePath(root, target.path, fs);
    const git = state.hostManaged ? { ok: true } : gitCapability(fs, root); if (!git.ok) throw new Error(git.reason);
    if (state.initializesGit) {
      const initialized = fs.spawnSync("git", ["init", "--initial-branch=main"], { cwd: root, encoding: "utf8" });
      if (initialized.error || initialized.status !== 0) throw new Error(`git init --initial-branch=main failed: ${String(initialized.stderr ?? initialized.error ?? "unknown error").trim()}`);
      gitCreated = true;
    }
    for (const target of state.targets) {
      const path = safePath(root, target.path, fs);
      if (fs.existsSync(path)) throw new Error(`target appeared during activation: ${target.path}`);
      fs.mkdirSync(dirname(path), { recursive: true });
      fs.writeFileSync(path, target.bytes, { encoding: "utf8", flag: "wx", mode: 0o600 });
      created.push(path);
    }
    const authority = validateV3BootstrapAuthority({ rootDir: root });
    if (authority.status !== "ready") throw new Error(`post-apply V3 bootstrap authority readback was not ready: ${authority.diagnostics?.[0]?.code ?? "unknown"}`);
    const migration = planRunnerProfileMigrationV3({ rootDir: root });
    const hostProjectionPending = state.hostManaged && migration.status === "ready" && migration.runtimeMode === "host-managed-codex"
      && migration.changes.every((target) => target.path.startsWith(".codex/"));
    if (migration.status !== "noop" && !hostProjectionPending) throw new Error("post-apply V3 migration plan was not noop");
    return { schema: PLAN_SCHEMA, status: "applied", root, changes: plan.changes, git: state.hostManaged ? { mode: "host-managed", initialized: false, initialBranch: null, committed: false } : { mode: "local", initialized: gitCreated, initialBranch: "main", committed: false }, authority: { status: authority.status, runtimeProjection: authority.runtimeProjection }, migration: { status: migration.status, runtimeMode: migration.runtimeMode ?? "standard" }, diagnostics: [] };
  } catch (error) {
    const rollbackFailures = root ? rollback(root, created, gitCreated, fs) : [];
    if (rollbackFailures.length) return { schema: PLAN_SCHEMA, status: "rollback-failed", root, diagnostics: [diagnostic("$.transaction", "rollback_failed", `${error.message}; rollback also failed: ${rollbackFailures[0].message}`, "repair generated paths manually before retrying")] };
    return { schema: PLAN_SCHEMA, status: "rolled-back", root, diagnostics: [diagnostic("$.transaction", "apply_failed", error.message, "repair the root and run inspect then plan again")] };
  }
}
