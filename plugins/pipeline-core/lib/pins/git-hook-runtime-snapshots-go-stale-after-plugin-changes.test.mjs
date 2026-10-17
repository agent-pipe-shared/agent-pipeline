// SPDX-License-Identifier: SUL-1.0
// Regression pin for pipeline.git-hook-runtime-snapshots-go-stale-after-plugin-changes (AC-179, matrix stage 25).
// Acceptance points of the original item:
//   P1 a hook snapshot is bound to the plugin identity (content-addressed) and a changed plugin is detected as stale;
//   P2 a typed HOOK-SNAPSHOT-STALE diagnostic is reported in preflight AND in the commit refusal, naming one refresh command;
//   P3 only the destination operand of cp/install is the write target (a source outside the root is a read); mv also REMOVES
//      its sources, so an outside mv source is refused (ALF-C-C6G1-CORR-A, Critic C6g1 F1; protected-file patch);
//   P4 fixtures run on win32 and POSIX (directory mode bits / directory symlinks are a typed host limitation).
// Fixtures live under the repository scratch/ (gitignored) and are removed before a test ends.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";
import test from "node:test";

import { createGovernanceScopeController } from "../governance-scope.mjs";
import { inspectGitHookSourceSnapshot, publishGitHookRuntimeSnapshot } from "../git-hook-runtime-snapshot.mjs";
import { checkCloneProvisioning } from "../../scripts/check-clone-provisioning.mjs";
import { observePipelineStartPreflight } from "../../scripts/pipeline-start-preflight.mjs";
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

// P2 (preflight) is now a behavioural case at the end of this file (ALF-C-C6G4-F2): the former source-text grep for the literal
// passed on the pre-push observation alone and could not fail for a stale commit-msg or pre-commit snapshot.

test("P3: cp/install classify only the destination operand (an outside source is a read); mv removes its source (needs protected patch ALF-C-C6G1-CORR-A)", (t) => {
  const base = scratch(t), inside = join(base, "project"), outside = join(base, "installed-plugin").replaceAll("\\", "/");
  mkdirSync(inside, { recursive: true });
  const dest = join(inside, "x.mjs").replaceAll("\\", "/");
  for (const verb of ["cp", "mv", "install"]) {
    // The ONE inverted expectation (ALF-C-C6G1-CORR-A, Critic C6g1 F1): `mv` REMOVES its source, so an outside source is a
    // cross-repository mutation (it used to read "allowed" for all three verbs); cp and install only read theirs.
    assert.equal(isForbiddenCrossRepositoryMutation(`${verb} /outside-root/src/x.mjs ${dest}`, inside), verb === "mv", `${verb} outside source, inside destination`);
  }
  assert.equal(isForbiddenCrossRepositoryMutation(`cp ${dest} /tmp/elsewhere/x.mjs`, inside), true, "outside destination stays refused");
  assert.equal(typeof outside, "string");
});

// ---- ALF-C-C6G1-CORR-A (Critic C6g1 F1): cp/mv/install are judged by EVERY operand they write, create or remove ------------
// Cases titled with NEEDS_PATCH are RED on a tree without the protected-file patch scratch/patches/ALF-C-C6G1-CORR-A.patch
// (lib/guard/po-commands.mjs, isForbiddenCrossRepositoryMutation) and GREEN with it. The path logic is purely lexical, so the
// project root below is never created on disk.
const NEEDS_PATCH = "needs protected patch ALF-C-C6G1-CORR-A";
const W = (() => {
  const inside = join(REPO, "scratch", "c6g1-project").replaceAll("\\", "/");
  return { inside, outside: "/outside-root-c6g1", src: `${inside}/src/a.mjs`, dest: `${inside}/dest/a.mjs`, dir: `${inside}/dest` };
})();
const c6g1Forbidden = (command) => isForbiddenCrossRepositoryMutation(command, W.inside);
const c6g1Title = (command) => command.replaceAll(W.inside, "<project>").replaceAll(W.outside, "<outside>");

// An operand written, created or removed outside the project (a target directory hidden in a short-option cluster or behind a
// long-option abbreviation, an mv source, an install -d operand) or an option the closed tables cannot place: refused.
for (const command of [
  `cp -rt ${W.outside}/dest ${W.src}`, `cp -vt ${W.outside}/dest ${W.src}`, `cp -rt${W.outside}/dest ${W.src}`,
  `mv -vt ${W.outside}/dest ${W.src}`, `install -Dt ${W.outside}/dest ${W.src}`,
  `cp --target ${W.outside}/dest ${W.src}`, `cp --target=${W.outside}/dest ${W.src}`, `cp --t=${W.outside}/dest ${W.src}`,
  `mv --targ ${W.outside}/dest ${W.src}`, `install --target-dir ${W.outside}/dest ${W.src}`,
  `mv -t ${W.dir} ${W.outside}/src/x.mjs`, `mv -vt ${W.dir} ${W.src} ${W.outside}/a.mjs`,
  `install -d ${W.outside}/created ${W.dir}`, `install --directory ${W.outside}/created ${W.dir}`, `install --dir ${W.outside}/created ${W.dir}`,
  `cp --bogus-option ${W.src} ${W.dest}`, `cp -Q ${W.src} ${W.dest}`, `mv --no ${W.src} ${W.dest}`, `cp ${W.src} -t`,
  `cp -t ${W.dir} -t ${W.dir}2 ${W.src}`,
]) {
  test(`P3 (F1): a write, creation or removal outside the project is refused (${NEEDS_PATCH}): ${c6g1Title(command)}`, () => {
    assert.equal(c6g1Forbidden(command), true);
  });
}
test(`P3 (F1): an outside mv source is refused, matching the inverted P3 expectation (${NEEDS_PATCH})`, () => {
  assert.equal(c6g1Forbidden(`mv ${W.outside}/src/x.mjs ${W.dest}`), true);
});

// Controls: hold on the original source AND with the patch.
test("P3 (F1 control): an outside READ source of cp/install stays allowed", () => {
  for (const command of [
    `cp -a ${W.outside}/src ${W.dest}`, `cp --target-directory=${W.dir} ${W.outside}/src/x.mjs`,
    `install -m 0644 ${W.outside}/src/x.mjs ${W.dest}`,
  ]) assert.equal(c6g1Forbidden(command), false, c6g1Title(command));
});
// The same outside READ source behind a cluster or an abbreviated -t used to be misjudged as the written operand: it is a read.
test(`P3 (F1): an outside READ source stays allowed when the target directory is spelled -t in a cluster or as an abbreviation (${NEEDS_PATCH})`, () => {
  for (const command of [
    `cp -rt ${W.dir} ${W.outside}/src/x.mjs`, `install -Dt ${W.dir} ${W.outside}/src/x.mjs`, `cp --target ${W.dir} ${W.outside}/src/x.mjs`,
  ]) assert.equal(c6g1Forbidden(command), false, c6g1Title(command));
});
test("P3 (F1 control): commands whose every written operand is inside the project stay allowed", () => {
  for (const command of [
    `cp -r ${W.src} ${W.dest}`, `cp -vt ${W.dir} ${W.src}`, `cp -- ${W.src} ${W.dest}`, `cp -pr --preserve=mode ${W.src} ${W.dest}`,
    `mv ${W.src} ${W.dest}`, `mv -vt ${W.dir} ${W.src} ${W.inside}/b.mjs`, `install -d ${W.dir} ${W.inside}/d2`,
    `install --owner=root --mode=0644 ${W.src} ${W.dest}`,
  ]) assert.equal(c6g1Forbidden(command), false, c6g1Title(command));
});
// ALF-C-C6G1-CORR-A3 (Critic C6g1 D2-F1): GNU cp declares --sparse=WHEN with a MANDATORY argument, so a separated value
// (`--sparse always`) is consumed by the option and the real destination stays the last operand. RED on a tree without
// scratch/patches/ALF-C-C6G1-CORR-A3.patch (lib/guard/po-commands.mjs: "sparse" listed as a flag, so "always" was judged as the
// destination and an outside write passed); GREEN with it.
const NEEDS_PATCH_A3 = "needs protected patch ALF-C-C6G1-CORR-A3";
test(`P3 (D2-F1): a trailing separated '--sparse always' does not hide an outside destination (${NEEDS_PATCH_A3})`, () => {
  assert.equal(c6g1Forbidden(`cp ${W.src} ${W.outside}/dst --sparse always`), true);
  assert.equal(c6g1Forbidden(`cp --sparse always ${W.src} ${W.outside}/dst`), true);
});
test(`P3 (D2-F1 control): a separated '--sparse always' with an in-project destination stays allowed (${NEEDS_PATCH_A3})`, () => {
  assert.equal(c6g1Forbidden(`cp ${W.src} ${W.dest} --sparse always`), false);
  assert.equal(c6g1Forbidden(`cp --sparse=always ${W.src} ${W.dest}`), false);
});
test("P3 (F1 control): an outside destination stays refused for every verb", () => {
  for (const command of [`cp ${W.src} ${W.outside}/x`, `mv ${W.src} ${W.outside}/x`, `install ${W.src} ${W.outside}/x`, `install -d ${W.outside}/x`]) {
    assert.equal(c6g1Forbidden(command), true, c6g1Title(command));
  }
});

// ALF-C-C6G1-CORR-A4 (Critic G1-D3-F1, AC-179): an outside cp/install SOURCE is a read "subject to the read policy", so a source
// under a protected credential root (passive-read-policy) is refused. Synthetic path strings only: nothing is read or copied.
// RED on a tree without scratch/patches/ALF-C-C6G1-CORR-A4.patch (lib/guard/po-commands.mjs); GREEN with it.
const NEEDS_PATCH_A4 = "needs protected patch ALF-C-C6G1-CORR-A4";
const CREDENTIAL_SOURCES = [
  join(homedir(), ".ssh", "c6g1-synthetic-key").replaceAll("\\", "/"),
  join(homedir(), ".aws", "c6g1-synthetic-credentials").replaceAll("\\", "/"),
];
test(`P3 (G1-D3-F1): a cp/install source under a protected credential root is refused (${NEEDS_PATCH_A4})`, () => {
  for (const source of CREDENTIAL_SOURCES) {
    for (const command of [
      `cp ${source} ${W.dest}`, `install -m 0600 ${source} ${W.dest}`, `cp -t ${W.dir} ${source}`, `cp -a ${W.src} ${source} ${W.dir}`,
    ]) assert.equal(c6g1Forbidden(command), true, command.replaceAll(W.inside, "<project>"));
  }
});
test("P3 (G1-D3-F1 control): an ordinary in-project source copied to an in-project destination stays allowed", () => {
  for (const command of [`cp ${W.src} ${W.dest}`, `install -m 0644 ${W.src} ${W.dest}`, `cp -t ${W.dir} ${W.src}`]) {
    assert.equal(c6g1Forbidden(command), false, c6g1Title(command));
  }
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

test("AC-179 (inert outside governance scope): a stale installed commit-msg hook in a repository that is NOT enrolled does not refuse the commit", { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
  const world = installedHookWorld(t, { consumer: false, enroll: false });
  const hook = HOOKS["commit-msg"];
  assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
  world.updatePlugin();
  assert.equal(hook.plan(world.project, world.pluginRoot).updateRequired, true, "the snapshot is stale");
  const committed = world.commit();
  assert.equal(committed.status, 0, `an unenrolled repository stays inert even with a stale commit-msg hook (stderr: ${committed.stderr})`);
  assert.doesNotMatch(committed.stderr, new RegExp(HOOK_SNAPSHOT_STALE_CODE, "u"), committed.stderr);
});

// ---- ALF-C-C6G4-F2 (Critic C6g4 F2): preflight carries the typed code for EVERY stale mandatory hook ------------------------
test("P2 (preflight, behavioural): a stale commit-msg and a stale pre-commit snapshot each carry the typed HOOK-SNAPSHOT-STALE code naming the hook", { timeout: INSTALLED_HOOK_TEST_TIMEOUT_MS }, (t) => {
  const world = installedHookWorld(t, { consumer: false });
  for (const hook of Object.values(HOOKS)) assert.equal(hook.apply(world.project, world.pluginRoot).status, "installed");
  // The loaded plugin tree is the fixture's own copy, so "current" and "stale" are decided by its content digest.
  const inspectSource = () => inspectGitHookSourceSnapshot({ pluginLibDir: join(world.pluginRoot, "lib") });
  const observe = () => observePipelineStartPreflight({ cwd: world.project, env: world.env, checkCloneProvisioningFn: (cwd) => checkCloneProvisioning(cwd, { inspectSource }) });
  assert.equal(observe().staleHookSnapshots, undefined, "a current pair carries no stale code");
  world.updatePlugin();
  const stale = observe().staleHookSnapshots;
  assert.ok(Array.isArray(stale), `a stale pair carries typed codes (got ${JSON.stringify(stale)})`);
  const byHook = Object.fromEntries(stale.map((entry) => [entry.hook, entry.code]));
  assert.equal(byHook["commit-msg"], HOOK_SNAPSHOT_STALE_CODE, "stale commit-msg snapshot");
  assert.equal(byHook["pre-commit"], HOOK_SNAPSHOT_STALE_CODE, "stale pre-commit snapshot");
});
