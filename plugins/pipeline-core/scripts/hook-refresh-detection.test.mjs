// SPDX-License-Identifier: SUL-1.0
/**
 * hook-refresh-detection.test.mjs - HOOKREFRESH-S1 (detection only, non-gating).
 *
 * Contract (specs/sprint-alfred-epic/design/bootstrap-hook-refresh-design.md, 3.2 and 3.3):
 *   - all three installers report, for an installed hook that is ours but was rendered from a
 *     different runtime snapshot than the loaded plugin tree, `current: false` and
 *     `updateRequired: true` (pre-push already did; pre-commit and commit-msg now do too);
 *   - check-clone-provisioning projects such a hook as the NON-GATING status `refresh`, never
 *     `install` and never `blocked`, including the mixed case (one current, one stale);
 *   - foreign, modified and declined hooks are never `refresh`;
 *   - nothing is written by planning, and no hook marker shape changes.
 *
 * The managed installs below are hand-written fixtures (shim, implementation and marker, with
 * the exact hashes each installer checks) bound to a runtime-<sha256>/lib path, so the suite
 * never publishes a snapshot and never depends on host private-directory hardening. The plugin
 * trees are tiny fixture libs, so no case reads the live plugin tree.
 *
 * Run: node --test plugins/pipeline-core/scripts/hook-refresh-detection.test.mjs
 */
import test, { after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { inspectGitHookSourceSnapshot } from "../lib/git-hook-runtime-snapshot.mjs";
import * as prePush from "./pre-push-hook-install.mjs";
import * as preCommit from "./pre-commit-hook-install.mjs";
import * as commitMsg from "./commit-msg-hook-install.mjs";
import { applyMandatoryHookGate, assessMandatoryHookReadiness, projectHookProvisioning } from "./check-clone-provisioning.mjs";

const INSTALLERS = [
  { name: "pre-push", mod: prePush },
  { name: "pre-commit", mod: preCommit },
  { name: "commit-msg", mod: commitMsg },
];

const sha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

// ---- isolation scaffolding -------------------------------------------------------------------------
// Every directory this suite creates is registered the moment it exists, before anything is written
// into it, and removed again unconditionally when the file's run ends (pass or fail).

const temporaryDirectories = [];

function makeTempDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `hook-refresh-${label}-`));
  temporaryDirectories.push(dir);
  return dir;
}

after(() => {
  const leftovers = [];
  for (const dir of temporaryDirectories) {
    rmSync(dir, { recursive: true, force: true });
    if (existsSync(dir)) leftovers.push(dir);
  }
  assert.deepEqual(leftovers, [], "every temporary directory this suite created must be removed again");
});

/** True when `candidate` is strictly below `base` (both resolved; case-insensitive on win32). */
function isInside(base, candidate) {
  const rel = relative(base, resolve(candidate));
  return rel !== "" && rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

/** Runs `run` with `overrides` applied to process.env and puts every touched variable back in `finally`. */
function withProcessEnv(overrides, run) {
  const previous = new Map(Object.keys(overrides).map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, overrides);
    return run();
  } finally {
    for (const [name, value] of previous) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

/** The core.hooksPath git would honour for `cwd` under the CURRENT process environment ("" when none). */
function visibleHooksPath(cwd) {
  const result = spawnSync("git", ["config", "--get", "core.hooksPath"], { cwd, encoding: "utf8" });
  return result.status === 0 ? result.stdout.trim() : "";
}

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE"];
const isAmbientGitVariable = (name) => AMBIENT_GIT_VARIABLES.includes(name.toUpperCase());

// The installers under test run their own `git rev-parse` with the inherited environment, so the
// ambient repository variables are taken out of the process for the duration of every case and put
// back afterwards, pass or fail (afterEach runs either way).
let ambientBackup = [];
beforeEach(() => {
  ambientBackup = Object.entries(process.env).filter(([name]) => isAmbientGitVariable(name));
  for (const [name] of ambientBackup) delete process.env[name];
});
afterEach(() => {
  for (const [name, value] of ambientBackup) process.env[name] = value;
  ambientBackup = [];
});

/** Every git call this suite makes itself starts without the ambient repository variables. */
const cleanGitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([name]) => !isAmbientGitVariable(name)));

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8", env: cleanGitEnv() });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function freshRepo(prefix) {
  const dir = makeTempDir(prefix);
  git(dir, "init", "-q", "-b", "main");
  // Pin the hooks directory INSIDE the repository so no machine-level core.hooksPath can redirect a hook write.
  git(dir, "config", "--local", "core.hooksPath", join(realpathSync.native(dir), ".git", "hooks").replaceAll("\\", "/"));
  return dir;
}

function hookPaths(dir, name) {
  const commonDir = git(dir, "rev-parse", "--path-format=absolute", "--git-common-dir");
  const hookPath = git(dir, "rev-parse", "--path-format=absolute", "--git-path", `hooks/${name}`);
  const state = join(commonDir, "agent-pipeline", `${name}-hook`);
  const paths = { commonDir, hookPath, state, implPath: join(state, "impl.mjs"), markerPath: join(state, "install-marker.json") };
  // Containment: no path a fixture may write to is ever handed out unless it lies inside the temporary repository.
  const root = realpathSync.native(dir);
  for (const [label, path] of Object.entries(paths)) {
    assert.ok(isInside(root, path), `${name} ${label} resolves outside the temporary repository`);
  }
  return paths;
}

/** A tiny plugin tree: the minimum the snapshot inspection accepts (a public lib file that
 * proves scope, plus the shipped baseline). Different labels give different digests. */
function fixturePluginLib(label) {
  const root = makeTempDir(`plugin-${label}`);
  const lib = join(root, "lib");
  mkdirSync(lib);
  writeFileSync(join(root, "protected-baseline.json"), "{}\n");
  writeFileSync(join(lib, "governance-scope.mjs"), `export const fixture = ${JSON.stringify(label)};\n`);
  return lib;
}

const digestOf = (lib) => inspectGitHookSourceSnapshot({ pluginLibDir: lib }).manifestSha256;
const runtimeLib = (paths, digest) => join(paths.state, `runtime-${digest}`, "lib");

/** What each installer's own `planInstall` accepts as "an install this installer wrote". */
function installManaged(spec, dir, recordedPluginLibDir) {
  const paths = hookPaths(dir, spec.name);
  const shim = `#!/bin/sh\n# fixture shim (${spec.name})\n`;
  const impl = `// fixture implementation (${spec.name})\n`;
  mkdirSync(dirname(paths.hookPath), { recursive: true });
  mkdirSync(paths.state, { recursive: true });
  writeFileSync(paths.hookPath, shim);
  writeFileSync(paths.implPath, impl);
  const marker = {
    schema: spec.mod.MARKER_SCHEMA,
    installerVersion: spec.mod.INSTALLER_VERSION,
    installedAt: "2026-01-01T00:00:00.000Z",
    hookPath: paths.hookPath,
    implPath: paths.implPath,
    pluginLibDir: recordedPluginLibDir,
    hookSha256: sha256(shim),
    implSha256: sha256(impl),
  };
  writeFileSync(paths.markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  return paths;
}

function declineHook(spec, dir) {
  const paths = hookPaths(dir, spec.name);
  mkdirSync(paths.state, { recursive: true });
  writeFileSync(join(paths.state, "decline-marker.json"), `${JSON.stringify({ schema: spec.mod.DECLINE_MARKER_SCHEMA, declinedAt: "2026-01-01T00:00:00.000Z" })}\n`);
  return paths;
}

function projectFor(spec, dir, lib) {
  return projectHookProvisioning({
    spec: {
      id: `${spec.name}-hook`,
      name: spec.name,
      installer: `${spec.name}-hook-install.mjs`,
      planInstall: ({ rootDir }) => spec.mod.planInstall({ rootDir, pluginLibDir: lib }),
    },
    rootDir: dir,
  });
}

const fakeSpec = (plan) => ({ id: "fixture-hook", name: "fixture", installer: "fixture.mjs", planInstall: () => plan });

const disk = (paths) => ({
  hook: readFileSync(paths.hookPath, "utf8"),
  impl: readFileSync(paths.implPath, "utf8"),
  marker: readFileSync(paths.markerPath, "utf8"),
  state: readdirSync(paths.state).sort(),
  hooks: readdirSync(dirname(paths.hookPath)).sort(),
});

// ---- the shared helper ------------------------------------------------------------------------

test("hook-currentness helper: an identical lib path is current without inspecting the tree", async () => {
  const { assessHookCurrentness } = await import("../lib/hook-currentness.mjs");
  const inspectSource = () => { throw new Error("must not inspect"); };
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: "plugin/lib", pluginLibDir: "plugin/lib", inspectSource }), { current: true, updateRequired: false });
});

test("hook-currentness helper: a runtime snapshot digest equal to the loaded tree is current, a different one is stale", async () => {
  const { assessHookCurrentness } = await import("../lib/hook-currentness.mjs");
  const recorded = (digest) => `state/runtime-${digest}/lib`;
  const loaded = { manifestSha256: "b".repeat(64) };
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded("b".repeat(64)), pluginLibDir: "plugin/lib", inspectSource: () => loaded }), { current: true, updateRequired: false });
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded("a".repeat(64)), pluginLibDir: "plugin/lib", inspectSource: () => loaded }), { current: false, updateRequired: true });
});

test("hook-currentness helper: backslash separators in the recorded path are recognised", async () => {
  const { assessHookCurrentness } = await import("../lib/hook-currentness.mjs");
  const digest = "c".repeat(64);
  const recordedPluginLibDir = ["state", `runtime-${digest}`, "lib"].join("\\");
  assert.equal(assessHookCurrentness({ recordedPluginLibDir, pluginLibDir: "plugin/lib", inspectSource: () => ({ manifestSha256: digest }) }).current, true);
});

test("hook-currentness helper: an unreadable source tree, a non-runtime path and a missing binding are all stale, never a throw", async () => {
  const { assessHookCurrentness } = await import("../lib/hook-currentness.mjs");
  const fault = () => { throw new Error("GHS-SOURCE-DRIFT"); };
  const digest = "d".repeat(64);
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: `state/runtime-${digest}/lib`, pluginLibDir: "plugin/lib", inspectSource: fault }).updateRequired, true);
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: "elsewhere/lib", pluginLibDir: "plugin/lib", inspectSource: fault }).updateRequired, true);
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: undefined, pluginLibDir: undefined, inspectSource: fault }).updateRequired, true);
});

// ---- per installer: planInstall -------------------------------------------------------------------

for (const spec of INSTALLERS) {
  const { name, mod } = spec;

  test(`${name}: a stale-but-ours install reports current:false / updateRequired:true`, () => {
    const dir = freshRepo(`${name}-stale`);
    const oldLib = fixturePluginLib("old");
    const newLib = fixturePluginLib("new");
    installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(oldLib)));
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.equal(plan.status, "ready-to-upgrade");
    assert.equal(plan.current, false);
    assert.equal(plan.updateRequired, true);
  });

  test(`${name}: an install rendered from the loaded tree reports current:true / updateRequired:false`, () => {
    const dir = freshRepo(`${name}-current`);
    const newLib = fixturePluginLib("new");
    installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(newLib)));
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.equal(plan.status, "ready-to-upgrade");
    assert.equal(plan.current, true);
    assert.equal(plan.updateRequired, false);
  });

  test(`${name}: an install recorded against the loaded lib path itself is current`, () => {
    const dir = freshRepo(`${name}-samepath`);
    const newLib = fixturePluginLib("new");
    installManaged(spec, dir, newLib);
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.equal(plan.current, true);
    assert.equal(plan.updateRequired, false);
  });

  test(`${name}: an install bound to a different, non-snapshot lib path is stale`, () => {
    const dir = freshRepo(`${name}-otherpath`);
    const newLib = fixturePluginLib("new");
    installManaged(spec, dir, fixturePluginLib("elsewhere"));
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.equal(plan.status, "ready-to-upgrade");
    assert.equal(plan.updateRequired, true);
  });

  test(`${name}: planning a stale install writes nothing`, () => {
    const dir = freshRepo(`${name}-readonly`);
    const oldLib = fixturePluginLib("old");
    const newLib = fixturePluginLib("new");
    const paths = installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(oldLib)));
    const before = disk(paths);
    mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.deepEqual(disk(paths), before);
  });

  test(`${name}: a foreign hook is never reported as refreshable`, () => {
    const dir = freshRepo(`${name}-foreign`);
    const { hookPath } = hookPaths(dir, name);
    mkdirSync(dirname(hookPath), { recursive: true });
    writeFileSync(hookPath, "#!/bin/sh\necho a human already had this\n");
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: fixturePluginLib("new") });
    assert.equal(plan.status, "foreign-hook-present");
    assert.notEqual(plan.updateRequired, true);
    assert.equal(projectFor(spec, dir, fixturePluginLib("new")).status, "foreign-owner");
  });

  test(`${name}: a hook modified after install is never reported as refreshable`, () => {
    const dir = freshRepo(`${name}-modified`);
    const oldLib = fixturePluginLib("old");
    const newLib = fixturePluginLib("new");
    const paths = installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(oldLib)));
    writeFileSync(paths.hookPath, "#!/bin/sh\necho tampered\n");
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: newLib });
    assert.notEqual(plan.status, "ready-to-upgrade");
    assert.notEqual(plan.updateRequired, true);
    assert.equal(projectFor(spec, dir, newLib).status, "foreign-owner");
  });

  test(`${name}: a declined hook is never reported as refreshable`, () => {
    const dir = freshRepo(`${name}-declined`);
    declineHook(spec, dir);
    const plan = mod.planInstall({ rootDir: dir, pluginLibDir: fixturePluginLib("new") });
    assert.equal(plan.status, "declined");
    assert.notEqual(plan.updateRequired, true);
    assert.equal(projectFor(spec, dir, fixturePluginLib("new")).status, "decline");
  });

  test(`${name}: projection of a stale install is refresh with the repair action, a current one is current`, () => {
    const dir = freshRepo(`${name}-projection`);
    const oldLib = fixturePluginLib("old");
    const newLib = fixturePluginLib("new");
    const paths = installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(oldLib)));
    const stale = projectFor(spec, dir, newLib);
    assert.equal(stale.status, "refresh");
    assert.equal(stale.path, paths.hookPath);
    assert.equal(stale.repairAction, `node plugins/pipeline-core/scripts/${name}-hook-install.mjs --install`);
    const fresh = projectFor(spec, dir, oldLib);
    assert.equal(fresh.status, "current");
    assert.equal(fresh.repairAction, null);
  });
}

// ---- projection table (pure) ----------------------------------------------------------------------

test("projection: updateRequired maps to refresh, current stays current, ownership states stay put", () => {
  const upgrade = (extra) => ({ status: "ready-to-upgrade", hookPath: "/repo/hooks/fixture", ...extra });
  assert.equal(projectHookProvisioning({ spec: fakeSpec(upgrade({ current: true, updateRequired: false })), rootDir: "/repo" }).status, "current");
  const stale = projectHookProvisioning({ spec: fakeSpec(upgrade({ current: false, updateRequired: true })), rootDir: "/repo" });
  assert.equal(stale.status, "refresh");
  assert.equal(stale.repairAction, "node plugins/pipeline-core/scripts/fixture.mjs --install");
  for (const [status, expected] of [["declined", "decline"], ["foreign-hook-present", "foreign-owner"], ["modified-or-unreadable-managed-install", "foreign-owner"], ["orphan-managed-file", "foreign-owner"], ["unreadable-managed-state", "foreign-owner"], ["repository-unresolved", "unresolved"], ["ready", "install"]]) {
    const projected = projectHookProvisioning({ spec: fakeSpec({ status, hookPath: "/repo/hooks/fixture", current: false, updateRequired: true }), rootDir: "/repo" });
    assert.equal(projected.status, expected, status);
    assert.notEqual(projected.status, "refresh", status);
  }
});

test("projection: a plan carrying only the legacy current:false still projects as install", () => {
  const projected = projectHookProvisioning({ spec: fakeSpec({ status: "ready-to-upgrade", hookPath: "/repo/hooks/fixture", current: false }), rootDir: "/repo" });
  assert.equal(projected.status, "install");
});

// ---- mandatory readiness: a stale hook never blocks -----------------------------------------------

const readinessReport = (preCommitStatus, commitMsgStatus, prePushStatus = "current") => ({
  checks: [
    { id: "pre-commit-hook", status: preCommitStatus, path: "pc", repairAction: null },
    { id: "commit-msg-hook", status: commitMsgStatus, path: "cm", repairAction: null },
    { id: "pre-push-hook", status: prePushStatus, path: "pp", repairAction: null },
  ],
});

test("readiness: all current is ready and carries no refresh list", () => {
  const readiness = assessMandatoryHookReadiness(readinessReport("current", "current"));
  assert.equal(readiness.status, "ready");
  assert.equal(readiness.code, null);
  assert.equal("refreshAvailable" in readiness, false);
  assert.equal(applyMandatoryHookGate("ready", readiness), "ready");
});

test("readiness: one stale hook, the other stale, or one current and one stale are ready (mixed is not blocked)", () => {
  for (const [preCommitStatus, commitMsgStatus, expected] of [
    ["refresh", "current", ["pre-commit-hook"]],
    ["current", "refresh", ["commit-msg-hook"]],
    ["refresh", "refresh", ["pre-commit-hook", "commit-msg-hook"]],
  ]) {
    const readiness = assessMandatoryHookReadiness(readinessReport(preCommitStatus, commitMsgStatus));
    assert.equal(readiness.status, "ready", `${preCommitStatus}+${commitMsgStatus}`);
    assert.equal(readiness.code, null);
    assert.deepEqual(readiness.refreshAvailable, expected);
    assert.equal(applyMandatoryHookGate("ready", readiness), "ready");
  }
});

test("readiness: a stale pre-push hook is not a mandatory hook and changes nothing", () => {
  const readiness = assessMandatoryHookReadiness(readinessReport("current", "current", "refresh"));
  assert.equal(readiness.status, "ready");
  assert.equal("refreshAvailable" in readiness, false);
});

test("readiness: stale beside a foreign or declined hook keeps the existing foreign handling", () => {
  for (const other of ["foreign-owner", "decline"]) {
    for (const checks of [readinessReport("refresh", other), readinessReport(other, "refresh")]) {
      const readiness = assessMandatoryHookReadiness(checks);
      assert.equal(readiness.status, "blocked", other);
      assert.equal(readiness.code, "HOOK-READINESS-OWNER-OR-DECLINE", other);
    }
  }
  assert.equal(assessMandatoryHookReadiness(readinessReport("refresh", "unresolved")).status, "unresolved");
});

test("readiness: stale beside an absent hook is exactly as unsupported as current beside an absent hook", () => {
  const reference = assessMandatoryHookReadiness(readinessReport("current", "install"));
  const stale = assessMandatoryHookReadiness(readinessReport("refresh", "install"));
  assert.equal(stale.status, reference.status);
  assert.equal(stale.code, reference.code);
});

// ---- mixed state through the real installers --------------------------------------------------------

test("mixed repository: a current pre-commit beside a stale commit-msg projects to [current, refresh] and stays ready", () => {
  const dir = freshRepo("mixed");
  const oldLib = fixturePluginLib("old");
  const newLib = fixturePluginLib("new");
  installManaged(INSTALLERS[1], dir, runtimeLib(hookPaths(dir, "pre-commit"), digestOf(newLib)));
  installManaged(INSTALLERS[2], dir, runtimeLib(hookPaths(dir, "commit-msg"), digestOf(oldLib)));
  const checks = [projectFor(INSTALLERS[1], dir, newLib), projectFor(INSTALLERS[2], dir, newLib)];
  assert.deepEqual(checks.map((check) => check.status), ["current", "refresh"]);
  const readiness = assessMandatoryHookReadiness({ checks });
  assert.equal(readiness.status, "ready");
  assert.deepEqual(readiness.refreshAvailable, ["commit-msg-hook"]);
});

test("mixed repository: a stale pre-commit beside a foreign commit-msg is blocked by ownership, not by staleness", () => {
  const dir = freshRepo("stale-foreign");
  const oldLib = fixturePluginLib("old");
  const newLib = fixturePluginLib("new");
  installManaged(INSTALLERS[1], dir, runtimeLib(hookPaths(dir, "pre-commit"), digestOf(oldLib)));
  const { hookPath } = hookPaths(dir, "commit-msg");
  mkdirSync(dirname(hookPath), { recursive: true });
  writeFileSync(hookPath, "#!/bin/sh\necho foreign\n");
  const checks = [projectFor(INSTALLERS[1], dir, newLib), projectFor(INSTALLERS[2], dir, newLib)];
  assert.deepEqual(checks.map((check) => check.status), ["refresh", "foreign-owner"]);
  const readiness = assessMandatoryHookReadiness({ checks });
  assert.equal(readiness.status, "blocked");
  assert.equal(readiness.code, "HOOK-READINESS-OWNER-OR-DECLINE");
});

// ---- isolation (Critic finding F1): a fixture write never leaves its own temporary repository -------

const forwardSlashes = (path) => path.replaceAll("\\", "/");

test("HRD-ISOLATION: hostile ambient git state never redirects a fixture hook write outside its temporary repository", () => {
  // Everything a hostile run could be redirected to is a directory created right here. The machine's
  // own git configuration is replaced in every scenario (GIT_CONFIG_GLOBAL, GIT_CONFIG_NOSYSTEM), so
  // even a failing run can only ever write into these decoys, never into a real hooks directory.
  const decoyRoot = makeTempDir("decoy");
  git(decoyRoot, "init", "-q", "-b", "main");
  const decoyGitDir = join(realpathSync.native(decoyRoot), ".git");
  mkdirSync(join(decoyGitDir, "hooks"), { recursive: true });
  const machineHooks = join(decoyRoot, "machine-hooks");
  mkdirSync(machineHooks);
  const neutralConfig = join(decoyRoot, "neutral.gitconfig");
  const hostileConfig = join(decoyRoot, "hostile.gitconfig");
  writeFileSync(neutralConfig, "");
  writeFileSync(hostileConfig, `[core]\n\thooksPath = ${forwardSlashes(machineHooks)}\n`);
  const sameDirectory = (left, right) => left !== "" && relative(resolve(left), resolve(right)) === "";

  const scenarios = [
    {
      name: "ambient repository variables",
      slug: "ambient",
      env: { GIT_DIR: decoyGitDir, GIT_COMMON_DIR: decoyGitDir, GIT_WORK_TREE: decoyRoot, GIT_INDEX_FILE: join(decoyGitDir, "index"), GIT_CONFIG_GLOBAL: neutralConfig },
      guardedDir: join(decoyGitDir, "hooks"),
      visible: null,
    },
    {
      name: "machine-wide core.hooksPath",
      slug: "machine",
      env: { GIT_CONFIG_GLOBAL: hostileConfig },
      guardedDir: machineHooks,
      visible: machineHooks,
    },
  ];

  for (const scenario of scenarios) {
    const guardedBefore = readdirSync(scenario.guardedDir).sort();
    withProcessEnv({ GIT_CONFIG_NOSYSTEM: "1", ...scenario.env }, () => {
      const seen = visibleHooksPath(decoyRoot);
      if (scenario.visible === null) assert.equal(seen, "", `${scenario.name}: precondition - no hooks path may be visible to git`);
      else assert.ok(sameDirectory(seen, scenario.visible), `${scenario.name}: precondition - the hostile hooks path must be the one git sees`);

      const spec = INSTALLERS[0];
      const dir = freshRepo(`isolation-${scenario.slug}`);
      const paths = hookPaths(dir, spec.name);
      installManaged(spec, dir, join(dir, "plugin-lib"));
      const root = realpathSync.native(dir);
      for (const path of [paths.commonDir, paths.hookPath, paths.state, paths.implPath, paths.markerPath]) {
        assert.ok(isInside(root, path), `${scenario.name}: ${path} must stay inside the temporary repository`);
      }
      assert.deepEqual(readdirSync(scenario.guardedDir).sort(), guardedBefore, `${scenario.name}: nothing may be written to the redirect target`);
    });
  }

  // An environment-level hooks path outranks the repository's own pin; the path helper must then
  // refuse to hand out a location outside the repository rather than return it.
  const guarded = freshRepo("isolation-guard");
  withProcessEnv({
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: neutralConfig,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.hooksPath",
    GIT_CONFIG_VALUE_0: forwardSlashes(machineHooks),
  }, () => {
    assert.ok(sameDirectory(visibleHooksPath(guarded), machineHooks), "precondition: an environment-level hooks path outranks the local pin");
    assert.throws(() => hookPaths(guarded, "pre-push"), /outside/);
  });
});
