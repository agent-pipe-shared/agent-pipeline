// SPDX-License-Identifier: SUL-1.0
// Regression pin for pipeline.git-hook-runtime-snapshots-go-stale-after-plugin-changes (AC-179, matrix stage 25).
// Acceptance points of the original item:
//   P1 a hook snapshot is bound to the plugin identity (content-addressed) and a changed plugin is detected as stale;
//   P2 a typed HOOK-SNAPSHOT-STALE diagnostic is reported in preflight AND in the commit refusal, naming one refresh command;
//   P3 only the destination operand of cp/mv/install is the write target (a source outside the root is a read);
//   P4 fixtures run on win32 and POSIX (directory mode bits / directory symlinks are a typed host limitation).
// Fixtures live under the repository scratch/ (gitignored) and are removed before a test ends.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { createGovernanceScopeController } from "../governance-scope.mjs";
import { publishGitHookRuntimeSnapshot } from "../git-hook-runtime-snapshot.mjs";
import { HOOK_SNAPSHOT_STALE_CODE, assessHookCurrentness } from "../hook-currentness.mjs";
import { applyInstall as applyCommitMsg, planInstall as planCommitMsg, renderImpl } from "../../scripts/commit-msg-hook-install.mjs";
import { applyInstall as applyPreCommit, planInstall as planPreCommit } from "../../scripts/pre-commit-hook-install.mjs";
import { isForbiddenCrossRepositoryMutation } from "../../hooks/guard-lifecycle-ready.mjs";

const REPO = resolve(import.meta.dirname, "..", "..", "..", "..");
const PLUGIN = resolve(import.meta.dirname, "..", "..");
const HOST_LIMITATION = "host-limitation: owner Coordinator, due 2026-10-19 (Linux/WSL run, PO decision K7)";
const REAL_CATALOG = readFileSync(join(PLUGIN, "protected-baseline.json"));

function scratch(t) {
  const parent = join(REPO, "scratch");
  mkdirSync(parent, { recursive: true });
  const base = mkdtempSync(join(parent, "ghs-stale-"));
  t.after(() => rmSync(base, { recursive: true, force: true, maxRetries: 3 }));
  return base;
}
function pluginFixture(t, hookBody = "export const h = 1;\n") {
  const base = scratch(t), plugin = join(base, "plugin"), state = join(base, "state");
  for (const [path, body] of [["lib/governance-scope.mjs", "export const scope = 1;\n"], ["hooks/h.mjs", hookBody]]) {
    mkdirSync(join(plugin, path, ".."), { recursive: true });
    writeFileSync(join(plugin, path), body);
  }
  writeFileSync(join(plugin, "protected-baseline.json"), REAL_CATALOG);
  mkdirSync(state, { recursive: true, mode: 0o700 });
  return { base, plugin, lib: join(plugin, "lib"), state };
}

test("P1: the snapshot is content-addressed and a plugin change makes the recorded hook stale", (t) => {
  const f = pluginFixture(t);
  const snap = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  const recorded = join(snap.root, "lib");
  assert.match(snap.root.replaceAll("\\", "/"), new RegExp(`/runtime-${snap.manifestSha256}$`));
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: f.lib }), { current: true, updateRequired: false });
  writeFileSync(join(f.plugin, "hooks", "h.mjs"), "export const h = 2; // hotfix\n");
  assert.deepEqual(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: f.lib }), { current: false, updateRequired: true });
  // Fail closed: an unreadable source tree and a missing binding are stale, never current.
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: recorded, pluginLibDir: join(f.base, "missing", "lib") }).current, false);
  assert.equal(assessHookCurrentness({ recordedPluginLibDir: undefined, pluginLibDir: f.lib }).current, false);
});

test("P1: republishing after the change yields a different snapshot (old one is not silently reused)", (t) => {
  const f = pluginFixture(t);
  const first = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  writeFileSync(join(f.plugin, "hooks", "h.mjs"), "export const h = 3;\n");
  const second = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  assert.notEqual(second.manifestSha256, first.manifestSha256);
});

test("P2 (commit refusal): the rendered commit-msg implementation checks snapshot currentness and names HOOK-SNAPSHOT-STALE", () => {
  // Holds on the current source: renderImpl() in scripts/commit-msg-hook-install.mjs compares the snapshot with the
  // loaded plugin (snapshotIsStale), so an old active snapshot is refused; the installed-hook cases below exercise it.
  const rendered = renderImpl("/state/agent-pipeline/commit-msg-hook/runtime-" + "a".repeat(64) + "/lib");
  assert.match(rendered, /HOOK-SNAPSHOT-STALE/u);
});

test("P2 (preflight): the typed stale diagnostic is the literal HOOK-SNAPSHOT-STALE code", () => {
  // Preflight reports status hook-refresh-required / state installed-but-stale with a refresh nextAction, but not the
  // item's typed code. Pinned against the preflight source text; this holds on the current source.
  const source = readFileSync(join(PLUGIN, "scripts", "pipeline-start-preflight.mjs"), "utf8");
  assert.match(source, /HOOK-SNAPSHOT-STALE/u);
});

test("P3: cp/mv/install classify only the destination operand; an outside source is a read", (t) => {
  const base = scratch(t), inside = join(base, "project"), outside = join(base, "installed-plugin").replaceAll("\\", "/");
  mkdirSync(inside, { recursive: true });
  const dest = join(inside, "x.mjs").replaceAll("\\", "/");
  for (const verb of ["cp", "mv", "install"]) {
    assert.equal(isForbiddenCrossRepositoryMutation(`${verb} /outside-root/src/x.mjs ${dest}`, inside), false, `${verb} outside source, inside destination`);
  }
  assert.equal(isForbiddenCrossRepositoryMutation(`cp ${dest} /tmp/elsewhere/x.mjs`, inside), true, "outside destination stays refused");
  assert.equal(typeof outside, "string");
});

test("P4: directory-mode and directory-symlink variants are a typed host limitation on win32", (t) => {
  if (process.platform === "win32") { t.skip(HOST_LIMITATION); return; }
  const f = pluginFixture(t);
  const snap = publishGitHookRuntimeSnapshot({ pluginLibDir: f.lib, stateDir: f.state });
  assert.ok(snap.root);
});

// ---- Installed-hook cases (ALF-C-P17-03C/03D): real hooks installed into contained fixture repositories --------------
const COMMIT_KILL_MS = 240_000;
// Installed-hook commits take 10-60 s on Windows (the hook digests the plugin tree twice per commit).
const INSTALLED_HOOK_TEST_TIMEOUT_MS = 600_000;
const PROVENANCE_MESSAGE = "feat: fixture change\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n";
const COPY_SKIP = /(?:^|\/)node_modules(?:\/|$)|\.test\.mjs$/u;
const HOOKS = Object.freeze({
  "commit-msg": Object.freeze({
    installer: "commit-msg-hook-install.mjs",
    apply: (rootDir, plugin) => applyCommitMsg({ rootDir, pluginLibDir: join(plugin, "lib") }),
    plan: (rootDir, plugin) => planCommitMsg({ rootDir, pluginLibDir: join(plugin, "lib") }),
  }),
  "pre-commit": Object.freeze({
    installer: "pre-commit-hook-install.mjs",
    apply: (rootDir, plugin) => applyPreCommit({ rootDir, pluginLibDir: join(plugin, "lib"), pluginHooksDir: join(plugin, "hooks"), pluginScriptsDir: join(plugin, "scripts") }),
    plan: (rootDir, plugin) => planPreCommit({ rootDir, pluginLibDir: join(plugin, "lib"), pluginHooksDir: join(plugin, "hooks"), pluginScriptsDir: join(plugin, "scripts") }),
  }),
});

/** A contained fixture: its own git repository (one commit, enrolled in Pipeline governance unless `enroll` is false) and
 *  its own copy of the plugin. `consumer` places the plugin the way a consumer machine holds it, in a plugin cache outside
 *  the project. */
function installedHookWorld(t, { consumer, enroll = true }) {
  const base = scratch(t);
  const pluginRoot = consumer
    ? join(base, "home", ".claude", "plugins", "cache", "fixture-marketplace", "pipeline-core", "0.0.0-fixture")
    : join(base, "plugin");
  const project = join(base, "project");
  cpSync(PLUGIN, pluginRoot, { recursive: true, filter: (source) => !COPY_SKIP.test(relative(PLUGIN, source).replaceAll("\\", "/")) });
  mkdirSync(project, { recursive: true });
  const env = { ...process.env, GIT_CEILING_DIRECTORIES: base.replaceAll("\\", "/") };
  const git = (...args) => spawnSync("git", args, { cwd: project, env, encoding: "utf8", timeout: COMMIT_KILL_MS });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Operator").status, 0);
  writeFileSync(join(project, "README.md"), "fixture\n");
  assert.equal(git("add", "--", "README.md").status, 0);
  assert.equal(git("commit", "-q", "-m", "init").status, 0);
  if (enroll) {
    const controller = createGovernanceScopeController({ hostStateRoot: join(project, ".git", "fixture-host-state") });
    const plan = controller.planDecision({ rootDir: project, decision: "enroll", by: "disposable-p17-03c-fixture" });
    assert.equal(controller.applyDecision(plan, { activate: true, planSha256: plan.planSha256 }).state, "active");
  }
  let counter = 0;
  return {
    base, pluginRoot, project, env,
    head: () => git("rev-parse", "HEAD").stdout.trim(),
    commit() {
      appendFileSync(join(project, "content.txt"), `${++counter}\n`);
      assert.equal(git("add", "--", "content.txt").status, 0);
      const messageFile = join(base, "message.txt");
      writeFileSync(messageFile, PROVENANCE_MESSAGE);
      return git("commit", "-F", messageFile);
    },
    /** What a plugin update does to the installed tree: its content (and so its digest) changes. */
    updatePlugin() { writeFileSync(join(pluginRoot, "lib", "plugin-update-after-hook-install.mjs"), "export const updated = true;\n"); },
  };
}

const refreshCommands = (stderr) => [...stderr.matchAll(/node "([^"\r\n]+)" --install/gu)].map((match) => match[1]);

function assertStaleRefusal(world, installer, refused, headBefore) {
  assert.notEqual(refused.status, 0, `a stale snapshot must refuse the commit (stdout: ${refused.stdout})`);
  assert.match(refused.stderr, new RegExp(HOOK_SNAPSHOT_STALE_CODE, "u"), refused.stderr);
  const commands = refreshCommands(refused.stderr);
  assert.equal(commands.length, 1, `the refusal names exactly one refresh command (stderr: ${refused.stderr})`);
  assert.equal(resolve(commands[0]), resolve(world.pluginRoot, "scripts", installer), "the command is the installer's own, in the plugin the hook was installed from");
  assert.equal(world.head(), headBefore, "a refused commit leaves HEAD untouched");
  return commands[0];
}

for (const [hookName, hook] of Object.entries(HOOKS)) {
  test(`AC-179 (installed ${hookName} hook): a snapshot older than its plugin refuses the commit with HOOK-SNAPSHOT-STALE and one refresh command; a current snapshot commits`, { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
    const world = installedHookWorld(t, { consumer: false });
    assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
    assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, false, "a fresh install is current");
    const accepted = world.commit();
    assert.equal(accepted.status, 0, `a current snapshot commits (stderr: ${accepted.stderr})`);
    world.updatePlugin();
    assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, true, "the installer's own plan reports the drift");
    const headBefore = world.head();
    assertStaleRefusal(world, hook.installer, world.commit(), headBefore);
  });
}

test("AC-179 (consumer layout): with the plugin installed outside the project, staleness binds to the installed plugin and the printed refresh command repairs it", { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
  const world = installedHookWorld(t, { consumer: true });
  const hook = HOOKS["commit-msg"];
  assert.ok(relative(world.project, world.pluginRoot).startsWith(".."), "the plugin root is outside the project");
  assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
  const accepted = world.commit();
  assert.equal(accepted.status, 0, `a current snapshot commits (stderr: ${accepted.stderr})`);
  world.updatePlugin();
  assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, true, "the installed plugin's change is detected");
  const headBefore = world.head();
  const command = assertStaleRefusal(world, hook.installer, world.commit(), headBefore);
  assert.ok(relative(world.project, command).startsWith(".."), "the refresh command points at the installed plugin, not into the project");
  const refreshed = spawnSync(process.execPath, [command, "--install"], { cwd: world.project, env: world.env, encoding: "utf8", timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS });
  assert.equal(refreshed.status, 0, `the printed command refreshes the snapshot (stderr: ${refreshed.stderr})`);
  assert.equal(JSON.parse(refreshed.stdout).status, "upgraded");
  assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, false, "the refreshed snapshot is current again");
  const retried = world.commit();
  assert.equal(retried.status, 0, `the refreshed hook admits the retried commit (stderr: ${retried.stderr})`);
});

test("AC-179 (sanctioned refresh): refresh-mandatory-hooks rebinds both stale snapshots, so the next commit passes", { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
  const world = installedHookWorld(t, { consumer: true });
  for (const hook of Object.values(HOOKS)) assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
  world.updatePlugin();
  for (const hook of Object.values(HOOKS)) assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, true);
  const refresh = spawnSync(process.execPath, [join(world.pluginRoot, "scripts", "refresh-mandatory-hooks.mjs"), "--root", world.project], { cwd: world.project, env: world.env, encoding: "utf8", timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS });
  const report = JSON.parse(refresh.stdout.trim().split(/\r?\n/u).at(-1));
  assert.equal(report.schema, "pipeline.mandatory-hook-refresh.v1", refresh.stderr);
  const outcomes = Object.fromEntries(report.results.map((entry) => [entry.id, entry.status]));
  assert.equal(outcomes["pre-commit-hook"], "refreshed", JSON.stringify(report));
  assert.equal(outcomes["commit-msg-hook"], "refreshed", JSON.stringify(report));
  for (const hook of Object.values(HOOKS)) assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, false, "both snapshots are current after the refresh");
  const accepted = world.commit();
  assert.equal(accepted.status, 0, `both refreshed hooks admit the commit (stderr: ${accepted.stderr})`);
});

test("AC-179 (inert outside governance scope): a stale installed pre-commit hook in a repository that is NOT enrolled does not refuse the commit", { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
  const world = installedHookWorld(t, { consumer: false, enroll: false });
  const hook = HOOKS["pre-commit"];
  assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
  world.updatePlugin();
  assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, true, "the snapshot is stale");
  const committed = world.commit();
  assert.equal(committed.status, 0, `an unenrolled repository stays inert even with a stale hook (stderr: ${committed.stderr})`);
  assert.doesNotMatch(committed.stderr, new RegExp(HOOK_SNAPSHOT_STALE_CODE, "u"), committed.stderr);
});
