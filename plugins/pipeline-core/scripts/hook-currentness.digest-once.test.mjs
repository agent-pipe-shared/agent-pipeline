// SPDX-License-Identifier: SUL-1.0
/**
 * hook-currentness.digest-once.test.mjs - HOOKREFRESH-S1c.
 *
 * Contract (specs/sprint-alfred-epic/design/bootstrap-hook-refresh-design.md 3.2 step 1 and 5 rows
 * S1/S2; Critic finding F2): the loaded plugin tree's digest is read at most ONCE per
 * `checkCloneProvisioning` call, not once per installer.
 *   - one `checkCloneProvisioning` call with an injected, counting source inspector inspects exactly
 *     once however many of the three managed hooks are bound to a runtime snapshot, whether the
 *     inspection answers, disagrees or fails; and not at all when no hook needs a digest;
 *   - `projectHookProvisioning` hands the inspector to the installer's `planInstall` only when one is
 *     given, so the argument shape without it is exactly what it was before;
 *   - without the new parameter every installer's `planInstall` still inspects the loaded tree itself;
 *   - the projection (and the whole report) is deep-equal with and without an injected inspector.
 *
 * The managed installs below are hand-written fixtures (shim, implementation and marker, with the
 * exact hashes each installer checks) inside temporary repositories whose `core.hooksPath` is pinned
 * inside the repository, with the ambient GIT_* variables taken out of the process for each case, so
 * the suite never publishes a snapshot, never writes a real hook or git configuration, and removes
 * every directory it created. The plugin trees used for digests are tiny fixture libs.
 *
 * Run: node --test plugins/pipeline-core/scripts/hook-currentness.digest-once.test.mjs
 */
import test, { after, afterEach, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

import { inspectGitHookSourceSnapshot } from "../lib/git-hook-runtime-snapshot.mjs";
import * as prePush from "./pre-push-hook-install.mjs";
import * as preCommit from "./pre-commit-hook-install.mjs";
import * as commitMsg from "./commit-msg-hook-install.mjs";
import { checkCloneProvisioning, projectHookProvisioning } from "./check-clone-provisioning.mjs";

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
  const dir = mkdtempSync(join(tmpdir(), `hook-digest-once-${label}-`));
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

const AMBIENT_GIT_VARIABLES = ["GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_CONFIG_COUNT", "GIT_CONFIG_PARAMETERS"];
const isAmbientGitVariable = (name) => AMBIENT_GIT_VARIABLES.includes(name.toUpperCase()) || /^GIT_CONFIG_(KEY|VALUE)_\d+$/iu.test(name);

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

/** A repository with all three hooks installed and bound to the runtime snapshot of `digest`. */
function repoBoundTo(prefix, digest) {
  const dir = freshRepo(prefix);
  for (const spec of INSTALLERS) installManaged(spec, dir, runtimeLib(hookPaths(dir, spec.name), digest));
  return dir;
}

/** A source inspector that records which library directory it was asked about. `answer` is either
 * the value to return or a function producing it (and possibly throwing). */
function countingInspector(answer) {
  const calls = [];
  const inspect = ({ pluginLibDir } = {}) => {
    calls.push(pluginLibDir);
    return typeof answer === "function" ? answer({ pluginLibDir }) : answer;
  };
  inspect.calls = calls;
  return inspect;
}

const hookStatuses = (report) => report.checks.filter((check) => check.id.endsWith("-hook")).map((check) => [check.id, check.status]);
const LOADED = "a".repeat(64);
const OTHER = "b".repeat(64);

// ---- (1) one checkCloneProvisioning call -> at most one inspection ------------------------------------

test("checkCloneProvisioning: three hooks bound to the loaded snapshot cost exactly one inspection", () => {
  const dir = repoBoundTo("once-current", LOADED);
  const inspect = countingInspector({ manifestSha256: LOADED });
  const report = checkCloneProvisioning(dir, { inspectSource: inspect });
  assert.equal(inspect.calls.length, 1, "the loaded plugin tree must be inspected once for the whole call, not once per installer");
  assert.deepEqual(hookStatuses(report), [["pre-push-hook", "current"], ["pre-commit-hook", "current"], ["commit-msg-hook", "current"]]);
});

test("checkCloneProvisioning: three stale hooks still cost exactly one inspection and are all refreshable", () => {
  const dir = repoBoundTo("once-stale", LOADED);
  const inspect = countingInspector({ manifestSha256: OTHER });
  const report = checkCloneProvisioning(dir, { inspectSource: inspect });
  assert.equal(inspect.calls.length, 1);
  assert.deepEqual(hookStatuses(report), [["pre-push-hook", "refresh"], ["pre-commit-hook", "refresh"], ["commit-msg-hook", "refresh"]]);
  assert.deepEqual(report.refreshAvailable, ["pre-push-hook", "pre-commit-hook", "commit-msg-hook"]);
});

test("checkCloneProvisioning: a failed inspection is remembered, not retried by the other two installers", () => {
  const dir = repoBoundTo("once-fault", LOADED);
  const inspect = countingInspector(() => { throw new Error("GHS-SOURCE-DRIFT"); });
  const report = checkCloneProvisioning(dir, { inspectSource: inspect });
  assert.equal(inspect.calls.length, 1);
  assert.deepEqual(hookStatuses(report), [["pre-push-hook", "refresh"], ["pre-commit-hook", "refresh"], ["commit-msg-hook", "refresh"]]);
});

test("checkCloneProvisioning: the inspection is lazy - no hook that needs a digest means no inspection", () => {
  const absent = freshRepo("once-absent");
  const none = countingInspector({ manifestSha256: LOADED });
  assert.deepEqual(hookStatuses(checkCloneProvisioning(absent, { inspectSource: none })), [["pre-push-hook", "install"], ["pre-commit-hook", "install"], ["commit-msg-hook", "install"]]);
  assert.equal(none.calls.length, 0);

  // A hook bound to some other, non-snapshot library path is stale without any digest comparison.
  const elsewhere = freshRepo("once-elsewhere");
  const otherLib = fixturePluginLib("elsewhere");
  for (const spec of INSTALLERS) installManaged(spec, elsewhere, otherLib);
  const unused = countingInspector({ manifestSha256: LOADED });
  assert.deepEqual(hookStatuses(checkCloneProvisioning(elsewhere, { inspectSource: unused })), [["pre-push-hook", "refresh"], ["pre-commit-hook", "refresh"], ["commit-msg-hook", "refresh"]]);
  assert.equal(unused.calls.length, 0);
});

test("checkCloneProvisioning: two calls are two independent inspections (nothing is remembered across calls)", () => {
  const dir = repoBoundTo("once-calls", LOADED);
  const inspect = countingInspector({ manifestSha256: LOADED });
  checkCloneProvisioning(dir, { inspectSource: inspect });
  checkCloneProvisioning(dir, { inspectSource: inspect });
  assert.equal(inspect.calls.length, 2);
});

// ---- the helper that provides "once" ------------------------------------------------------------------

test("createOnceSourceInspector: lazy, one underlying inspection per library directory, results and faults both remembered", async () => {
  const { createOnceSourceInspector } = await import("../lib/hook-currentness.mjs");
  const calls = [];
  const underlying = ({ pluginLibDir }) => {
    calls.push(pluginLibDir);
    if (pluginLibDir === "bad/lib") throw new Error("GHS-SOURCE-DRIFT");
    return { manifestSha256: LOADED, pluginLibDir };
  };
  const once = createOnceSourceInspector(underlying);
  assert.deepEqual(calls, [], "creating the inspector must not inspect anything");
  const first = once({ pluginLibDir: "good/lib" });
  assert.equal(first.manifestSha256, LOADED);
  assert.equal(once({ pluginLibDir: "good/lib" }), first, "the remembered answer is returned as is");
  assert.deepEqual(calls, ["good/lib"], "the underlying inspector receives the caller's library directory, once");
  assert.throws(() => once({ pluginLibDir: "bad/lib" }), /GHS-SOURCE-DRIFT/);
  assert.throws(() => once({ pluginLibDir: "bad/lib" }), /GHS-SOURCE-DRIFT/);
  assert.deepEqual(calls, ["good/lib", "bad/lib"], "a fault is remembered too");
});

// ---- projectHookProvisioning: the parameter is forwarded only when given -------------------------------

test("projectHookProvisioning: the source inspector reaches planInstall only when one is given", () => {
  const seen = [];
  const spec = {
    id: "fixture-hook",
    name: "fixture",
    installer: "fixture.mjs",
    planInstall: (args) => { seen.push(args); return { status: "ready", hookPath: "/repo/hooks/fixture" }; },
  };
  projectHookProvisioning({ spec, rootDir: "/repo" });
  assert.deepEqual(Object.keys(seen[0]), ["rootDir"], "without an inspector the argument shape is exactly what it was");
  assert.equal(seen[0].rootDir, "/repo");

  const inspectSource = () => ({ manifestSha256: LOADED });
  projectHookProvisioning({ spec, rootDir: "/repo", inspectSource });
  assert.equal(seen[1].rootDir, "/repo");
  assert.equal(seen[1].inspectSource, inspectSource, "the very same inspector is handed to the installer");
});

// ---- (2) per installer: the default path is unchanged -----------------------------------------------

for (const spec of INSTALLERS) {
  const { name, mod } = spec;

  test(`${name}: without the parameter planInstall inspects the loaded tree on its own`, () => {
    const dir = freshRepo(`${name}-own`);
    const libA = fixturePluginLib("a");
    const libB = fixturePluginLib("b");
    installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(libA)));
    // Only a real read of the loaded tree can tell these two apart: the recorded path is neither lib path.
    const matching = mod.planInstall({ rootDir: dir, pluginLibDir: libA });
    assert.equal(matching.status, "ready-to-upgrade");
    assert.equal(matching.current, true);
    assert.equal(matching.updateRequired, false);
    const differing = mod.planInstall({ rootDir: dir, pluginLibDir: libB });
    assert.equal(differing.status, "ready-to-upgrade");
    assert.equal(differing.current, false);
    assert.equal(differing.updateRequired, true);
  });

  test(`${name}: an injected inspector replaces the read, is consulted once per plan and leaves the plan shape alone`, () => {
    const dir = freshRepo(`${name}-injected`);
    const libA = fixturePluginLib("a");
    const libB = fixturePluginLib("b");
    installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(libA)));

    // The loaded tree really is libB, but the inspector says it digests like libA: the answer is honoured.
    const sayA = countingInspector({ manifestSha256: digestOf(libA) });
    const current = mod.planInstall({ rootDir: dir, pluginLibDir: libB, inspectSource: sayA });
    assert.equal(current.current, true);
    assert.deepEqual(sayA.calls, [libB]);

    // The loaded tree really is libA, but the inspector says libB: stale, although a real read would say current.
    const sayB = countingInspector({ manifestSha256: digestOf(libB) });
    const stale = mod.planInstall({ rootDir: dir, pluginLibDir: libA, inspectSource: sayB });
    assert.equal(stale.current, false);
    assert.equal(stale.updateRequired, true);
    assert.deepEqual(sayB.calls, [libA]);

    const withoutParameter = mod.planInstall({ rootDir: dir, pluginLibDir: libB });
    assert.deepEqual(Object.keys(current).sort(), Object.keys(withoutParameter).sort());
  });

  // ---- (3) the projection is the same with and without an injected inspector ------------------------

  test(`${name}: the projection with an injected inspector deep-equals the projection without one`, () => {
    const dir = freshRepo(`${name}-equal`);
    const oldLib = fixturePluginLib("old");
    const newLib = fixturePluginLib("new");
    installManaged(spec, dir, runtimeLib(hookPaths(dir, name), digestOf(oldLib)));
    for (const [label, lib] of [["current", oldLib], ["stale", newLib]]) {
      const projectionSpec = {
        id: `${name}-hook`,
        name,
        installer: `${name}-hook-install.mjs`,
        planInstall: ({ rootDir, inspectSource }) => mod.planInstall({ rootDir, pluginLibDir: lib, inspectSource }),
      };
      const without = projectHookProvisioning({ spec: projectionSpec, rootDir: dir });
      const delegating = countingInspector(({ pluginLibDir }) => inspectGitHookSourceSnapshot({ pluginLibDir }));
      const withInjected = projectHookProvisioning({ spec: projectionSpec, rootDir: dir, inspectSource: delegating });
      assert.deepEqual(withInjected, without, label);
      assert.equal(without.status, label === "current" ? "current" : "refresh", label);
      assert.equal(delegating.calls.length, 1, `${label}: the injected inspector was consulted exactly once`);
    }
  });
}

test("checkCloneProvisioning: the whole report is deep-equal with and without an injected inspector", () => {
  // Hooks bound to a fixture digest: the live plugin tree cannot match it, so both runs read it for real
  // and agree on `refresh` (a drifting or unreadable live tree is stale too, so neither run can flip).
  const dir = repoBoundTo("equal-report", LOADED);
  const withoutInjection = checkCloneProvisioning(dir);
  const delegating = countingInspector(({ pluginLibDir }) => inspectGitHookSourceSnapshot({ pluginLibDir }));
  const withInjection = checkCloneProvisioning(dir, { inspectSource: delegating });
  assert.deepEqual(withInjection, withoutInjection);
  assert.deepEqual(hookStatuses(withoutInjection), [["pre-push-hook", "refresh"], ["pre-commit-hook", "refresh"], ["commit-msg-hook", "refresh"]]);
  assert.equal(delegating.calls.length, 1, "the injected inspector was consulted exactly once");
});
