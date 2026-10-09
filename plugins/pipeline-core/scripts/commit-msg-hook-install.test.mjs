#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, devNull } from "node:os";
import { after } from "node:test";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createGovernanceScopeController } from "../lib/governance-scope.mjs";

import {
  applyInstall,
  applyDecline,
  applyRemoval,
  DECLINE_MARKER_SCHEMA,
  planInstall,
  planDecline,
  planRemoval,
} from "./commit-msg-hook-install.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "CMI" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


// TR-J-T3 (TOILRES T44/T58): applyInstall inventories the plugin root twice (publishGitHookRuntimeSnapshot), so a
// parallel writer into the LIVE tree fails these cases with GHS-SOURCE-DRIFT. Without an explicit lib-dir override
// the suite therefore snapshots a frozen copy of the plugin root, made once at load and removed in after().
const LIVE_PLUGIN_ROOT = fileURLToPath(new URL("..", import.meta.url));
const FROZEN_PLUGIN_ROOT = process.env.PIPELINE_CORE_TEST_PLUGIN_LIB_DIR === undefined
  ? mkdtempSync(join(tmpdir(), "commit-msg-hook-plugin-"))
  : null;
if (FROZEN_PLUGIN_ROOT !== null) {
  cpSync(LIVE_PLUGIN_ROOT, FROZEN_PLUGIN_ROOT, { recursive: true });
  after(() => { rmSync(FROZEN_PLUGIN_ROOT, { recursive: true, force: true, maxRetries: 3 }); });
}
const PLUGIN_LIB_DIR = process.env.PIPELINE_CORE_TEST_PLUGIN_LIB_DIR ?? join(FROZEN_PLUGIN_ROOT, "lib");
if (FROZEN_PLUGIN_ROOT !== null) {
  // Proof that the copy, not the live tree, is what the install cases snapshot.
  assert.ok(PLUGIN_LIB_DIR.startsWith(FROZEN_PLUGIN_ROOT), "PLUGIN_LIB_DIR must lie under the frozen plugin copy");
  assert.notEqual(PLUGIN_LIB_DIR, join(LIVE_PLUGIN_ROOT, "lib"), "PLUGIN_LIB_DIR must not be the live lib dir");
  assert.ok(existsSync(join(PLUGIN_LIB_DIR, "git-hook-runtime-snapshot.mjs")), "the frozen copy must carry the snapshot module");
  process.stderr.write(`# frozen plugin copy in use: ${basename(FROZEN_PLUGIN_ROOT)}\n`);
}

function enrollFixture(dir) {
  const controller = createGovernanceScopeController({hostStateRoot:join(dir, '.git', 'fixture-host-state')});
  const plan = controller.planDecision({rootDir:dir, decision:'enroll', by:'disposable-hook-installer-fixture'});
  assert.equal(controller.applyDecision(plan, {activate:true, planSha256:plan.planSha256}).state, 'active');
}

function freshRepo(name) {
  const dir = mkdtempSync(join(tmpdir(), `commit-msg-hook-${name}-`));
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8", timeout: 20_000 });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Human").status, 0);
  enrollFixture(dir);
  return { dir, git };
}

function hookPath(dir) {
  return spawnSync("git", ["rev-parse", "--path-format=absolute", "--git-path", "hooks/commit-msg"], {
    cwd: dir,
    encoding: "utf8",
  }).stdout.trim();
}

function commitWithMessage(dir, git, message) {
  writeFileSync(join(dir, "content.txt"), `${Math.random()}\n`, { flag: "a" });
  assert.equal(git("add", "content.txt").status, 0);
  const path = join(dir, "message.txt");
  writeFileSync(path, message);
  return git("commit", "-F", path);
}

function install(dir) {
  const result = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(result.status, "installed");
  return result;
}

function writeTrailerPolicy(dir, mode) {
  const configDir = join(dir, "project");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(configDir, "guard-config.json"), `${JSON.stringify({ commitTrailerPolicy: mode }, null, 2)}\n`);
}

test("installed hook allows a valid contiguous Pipeline provenance block", () => {
  const { dir, git } = freshRepo("valid");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: valid\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(result.status, 0, result.stderr);
});

test("installed shim treats shell syntax, apostrophes, whitespace and newlines in its path as literal bytes", () => {
  const dir = mkdtempSync(join(
    tmpdir(),
    "commit-msg path ' $(touch${IFS}SHIM_SENTINEL) `touch${IFS}BACKTICK_SENTINEL` $SHIM_EXPANSION line\nnext-",
  ));
  const git = (...args) => spawnSync("git", args, {
    cwd: dir,
    encoding: "utf8",
    timeout: 20_000,
    env: { ...process.env, SHIM_EXPANSION: "EXPANDED" },
  });
  assert.equal(git("init", "-q", "-b", "main").status, 0);
  assert.equal(git("config", "user.email", "fixture@example.invalid").status, 0);
  assert.equal(git("config", "user.name", "Fixture Human").status, 0);
  install(dir);

  const result = commitWithMessage(dir, git, "feat: literal shim path\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(result.status, 0, result.stderr);
  assert.equal(existsSync(join(dir, "SHIM_SENTINEL")), false, "dollar-paren substitution must not execute");
  assert.equal(existsSync(join(dir, "BACKTICK_SENTINEL")), false, "backtick substitution must not execute");
  assert.equal(existsSync(join(dir, "EXPANDED")), false, "shell variables in the path must not expand");
});

test("installed hook blocks provenance split by a blank line", () => {
  const { dir, git } = freshRepo("split");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: split\n\nDispatch: stage-0 (elephant)\n\nAI-Assisted: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

for (const [name, message, expected] of [
  ["marker-only", "feat: marker\n\nAI-Assisted: true\n", /GIT-03-DISPATCH-MISSING/],
  ["dispatch-only", "feat: dispatch\n\nDispatch: stage-0 \(elephant\)\n", /GIT-03-MARKER-MISSING/],
]) {
  test(`installed hook blocks ${name} provenance`, () => {
    const { dir, git } = freshRepo(name);
    install(dir);
    const result = commitWithMessage(dir, git, message);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, expected);
  });
}

test("installed hook blocks provider and session correlation", () => {
  const { dir, git } = freshRepo("correlation");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: leaked context\n\nSession-Id: private-run\nCo-Authored-By: Codex <bot@example.invalid>\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-CORRELATION-TRAILER/);
  assert.match(result.stderr, /GIT-03-PROVIDER-COAUTHOR/);
});

test("installed hook blocks an unprovenanced commit in a Pipeline-managed repository", () => {
  const { dir, git } = freshRepo("human");
  install(dir);
  const result = commitWithMessage(dir, git, "docs: written by a person\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-MARKER-MISSING/);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

test("installed hook blocks a shell-script-wrapped commit without Pipeline provenance", () => {
  const { dir, git } = freshRepo("script-bypass");
  install(dir);
  const script = join(dir, "bypass.sh");
  writeFileSync(script, "#!/bin/sh\ngit commit --allow-empty -m 'chore: bypass'\n");
  const result = spawnSync("bash", [script], { cwd: dir, encoding: "utf8", timeout: 20_000 });
  assert.notEqual(result.status, 0, result.stderr);
  assert.match(result.stderr, /GIT-03-MARKER-MISSING/);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
  assert.equal(git("log", "--format=%s", "-1").stdout.trim(), "", "the wrapper must not create a commit");
});

test("absent policy defaults to blocking incomplete signaled provenance", () => {
  const { dir, git } = freshRepo("default-blocking");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: incomplete\n\nAI-Assisted: true\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-DISPATCH-MISSING/);
});

test("warn policy reports incomplete signaled provenance but allows the commit", () => {
  const { dir, git } = freshRepo("warn");
  writeTrailerPolicy(dir, "warn");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: migrating\n\nAI-Assisted: true\n");
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stderr, /WARN .*GIT-03-DISPATCH-MISSING.*commitTrailerPolicy is warn/s);
});

test("off policy does not produce provenance findings", () => {
  const { dir, git } = freshRepo("off");
  writeTrailerPolicy(dir, "off");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: explicitly disabled\n\nAI-Assisted: true\n");
  assert.equal(result.status, 0, result.stderr);
  assert.doesNotMatch(result.stderr, /GIT-03-DISPATCH-MISSING|WARN/);
});

test("off policy still blocks provider and session correlation", () => {
  const { dir, git } = freshRepo("off-correlation");
  writeTrailerPolicy(dir, "off");
  install(dir);
  const result = commitWithMessage(dir, git, "feat: correlation is never configurable\n\nSession-Id: private-run\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /GIT-03-CORRELATION-TRAILER/);
});

test("applyInstall refuses a foreign commit-msg hook without changing it", () => {
  const { dir } = freshRepo("foreign");
  const path = hookPath(dir);
  mkdirSync(dirname(path), { recursive: true });
  const foreign = "#!/bin/sh\necho foreign\n";
  writeFileSync(path, foreign);
  chmodSync(path, 0o755);
  const result = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(result.status, "refused-foreign-hook");
  assert.equal(readFileSync(path, "utf8"), foreign);
});

test("install, managed upgrade and removal preserve ownership checks", () => {
  const { dir } = freshRepo("lifecycle");
  assert.equal(planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "ready");
  const first = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(first.status, "installed");
  // TR-J-T3: the currentness check of an installed marker reads the source tree, so it must read the same frozen copy.
  assert.equal(planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "ready-to-upgrade");
  const second = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(second.status, "upgraded");
  assert.equal(planRemoval({ rootDir: dir }).status, "ready");
  assert.equal(applyRemoval({ rootDir: dir }).status, "removed");
  assert.equal(existsSync(first.hookPath), false);
  assert.equal(existsSync(first.implPath), false);
  assert.equal(planRemoval({ rootDir: dir }).status, "nothing-to-remove");
});

test("commit hook blocks unapproved staged implementation paths but still permits documentation", () => {
  const { dir, git } = freshRepo("staged-lifecycle");
  install(dir);
  mkdirSync(join(dir, ".claude"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  mkdirSync(join(dir, "docs"), { recursive: true });
  writeFileSync(join(dir, ".claude", "pipeline.yaml"), "schema: pipeline.manifest.v0\ngates:\n  dev-plan:\n    mode: blocking\n    type: human\n");
  writeFileSync(join(dir, ".claude", "pipeline-state.json"), `${JSON.stringify({
    schema: "pipeline.state.v0",
    activeFeature: { id: "fixture", planPath: ".claude/plans/p.md", phase: "design" },
    planApproved: false,
  })}\n`);
  writeFileSync(join(dir, "src", "game.js"), "export const value = 1;\n");
  writeFileSync(join(dir, "docs", "notes.md"), "ordinary documentation remains allowed\n");
  const commitWithStagedMessage = (message) => {
    const path = join(dir, "message.txt");
    writeFileSync(path, message);
    return git("commit", "-F", path);
  };
  assert.equal(git("add", ".claude/pipeline.yaml", ".claude/pipeline-state.json", "src/game.js").status, 0);
  const denied = commitWithStagedMessage("feat: blocked implementation\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.notEqual(denied.status, 0);
  assert.match(denied.stderr, /GUARD-DEVPLAN-LIFECYCLE/);

  assert.equal(git("reset", "-q").status, 0);
  assert.equal(git("add", ".claude/pipeline.yaml", ".claude/pipeline-state.json", "docs/notes.md").status, 0);
  const allowed = git("commit", "-m", "docs: ordinary documentation\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(allowed.status, 0, allowed.stderr);

  writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ disableAllHooks: true })}\n`);
  assert.equal(git("add", ".claude/settings.json").status, 0);
  writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ disableAllHooks: false })}\n`);
  const stagedSettings = commitWithStagedMessage("fix: reject staged hook disablement\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.notEqual(stagedSettings.status, 0);
  assert.match(stagedSettings.stderr, /PIPELINE-HOOKS-DISABLE-FORBIDDEN/);
});

test("upgrade and removal refuse a modified managed hook", () => {
  const { dir } = freshRepo("modified");
  const installed = install(dir);
  writeFileSync(installed.hookPath, "#!/bin/sh\necho modified\n");
  const upgrade = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(upgrade.status, "refused-modified-or-unreadable-managed-install");
  const removal = applyRemoval({ rootDir: dir });
  assert.equal(removal.status, "refused-modified-or-unreadable-managed-install");
  assert.equal(existsSync(installed.hookPath), true);
  assert.equal(existsSync(installed.implPath), true);
});

test("upgrade and removal refuse a modified managed implementation", () => {
  const { dir } = freshRepo("modified-impl");
  const installed = install(dir);
  writeFileSync(installed.implPath, "throw new Error('changed');\n");
  assert.equal(
    applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status,
    "refused-modified-or-unreadable-managed-install",
  );
  assert.equal(applyRemoval({ rootDir: dir }).status, "refused-modified-or-unreadable-managed-install");
  assert.equal(existsSync(installed.hookPath), true);
  assert.equal(existsSync(installed.implPath), true);
});

test("generated hook fails closed when Git's message file is unreadable", () => {
  const { dir } = freshRepo("unreadable-message");
  const installed = install(dir);
  const result = spawnSync(installed.hookPath, [join(dir, "missing-message.txt")], { cwd: dir, encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /could not be read/);
});

test("generated hook fails closed when its install-bound policy module is unavailable", () => {
  const { dir, git } = freshRepo("missing-policy");
  const fixturePlugin = join(dir, '.git', 'missing-policy-plugin');
  cpSync(join(PLUGIN_LIB_DIR, '..'), fixturePlugin, {recursive:true});
  const absentLibDir = join(fixturePlugin, 'lib');
  rmSync(join(absentLibDir, 'commit-message-policy.mjs'));
  const installed = applyInstall({ rootDir: dir, pluginLibDir: absentLibDir });
  assert.equal(installed.status, "installed");
  const marker = JSON.parse(readFileSync(installed.markerPath, "utf8"));
  assert.equal(existsSync(join(marker.pluginLibDir, "commit-message-policy.mjs")), false, "the installed snapshot preserves the missing policy module");
  const result = commitWithMessage(dir, git, "feat: cannot be evaluated\n");
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /policy could not be loaded|faulted before producing a verdict/);
});

test("decline marker has the same reversible, non-overwriting contract as the other hook installers", () => {
  const { dir } = freshRepo("decline");
  assert.equal(planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "ready");
  const declined = applyDecline({ rootDir: dir });
  assert.equal(declined.status, "declined");
  assert.match(declined.declinedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "declined");
  const marker = JSON.parse(readFileSync(join(dir, ".git", "agent-pipeline", "commit-msg-hook", "decline-marker.json"), "utf8"));
  assert.equal(marker.schema, DECLINE_MARKER_SCHEMA);
  assert.deepEqual(Object.keys(marker).sort(), ["declinedAt", "schema"]);
  assert.equal(planDecline({ rootDir: dir }).status, "ready");
  const installed = applyInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR });
  assert.equal(installed.status, "installed", "a decline must not make installation permanently impossible");
  assert.equal(planInstall({ rootDir: dir, pluginLibDir: PLUGIN_LIB_DIR }).status, "ready-to-upgrade");
});


test("installed hook permits first permissions settings but rejects new hook authority", () => {
  const {dir,git}=freshRepo("first-permissions-settings");
  install(dir);mkdirSync(join(dir,".claude"),{recursive:true});
  const settings=join(dir,".claude","settings.local.json");
  writeFileSync(settings,JSON.stringify({permissions:{allow:["Bash(node --version)"]}}));
  assert.equal(git("add","--force",".claude/settings.local.json").status,0);
  const initial=git("commit","-m","chore: first permissions\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(initial.status,0,initial.stderr);
  writeFileSync(settings,JSON.stringify({hooks:{PreToolUse:[]},permissions:{allow:[]}}));
  assert.equal(git("add","--force",".claude/settings.local.json").status,0);
  const changed=git("commit","-m","chore: changed hook authority\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.notEqual(changed.status,0);
  assert.match(changed.stderr,/PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN/u);
});

test("installed hook compares settings hooks against Git base and exact staged deletions", () => {
  const {dir,git}=freshRepo("base-hook-projection");mkdirSync(join(dir,".claude"),{recursive:true});
  const settings=join(dir,".claude","settings.json");
  const baseline={hooks:{PreToolUse:[{matcher:"Write",hooks:[{type:"command",command:"node guard.mjs"}]}]},permissions:{allow:[]}};
  writeFileSync(settings,JSON.stringify(baseline));assert.equal(git("add",".claude/settings.json").status,0);
  assert.equal(git("commit","-m","chore: fixture base").status,0);
  install(dir);
  writeFileSync(settings,JSON.stringify({permissions:{allow:[]}}));assert.equal(git("add",".claude/settings.json").status,0);
  // Restore the worktree after staging; the hook must still reject the index removal.
  writeFileSync(settings,JSON.stringify(baseline));
  const removed=git("commit","-m","chore: removed hooks\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.notEqual(removed.status,0);assert.match(removed.stderr,/PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN/u);
  assert.equal(git("reset","-q","HEAD","--",".claude/settings.json").status,0);
  assert.equal(git("rm","--cached",".claude/settings.json").status,0);
  const deleted=git("commit","-m","chore: deleted settings\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.notEqual(deleted.status,0);assert.match(deleted.stderr,/PIPELINE-HOOKS-SETTINGS-CHANGE-FORBIDDEN/u);
  assert.equal(git("reset","-q","HEAD","--",".claude/settings.json").status,0);
  writeFileSync(settings,JSON.stringify({...baseline,permissions:{allow:["Read"]}}));
  assert.equal(git("add",".claude/settings.json").status,0);
  const ordinary=git("commit","-m","chore: permissions update\n\nAI-Assisted: true\nDispatch: stage-0 (elephant)\n");
  assert.equal(ordinary.status,0,ordinary.stderr);
});

// A-S2b (HOOKREFRESH, PO decision M): the --install CLI must report the refusal code the install
// path actually threw, as one JSON object with exit 1 -- not die with an uncaught exception and no
// JSON. The CLI offers no dependency seam of its own, so the throwing dependency is injected from
// outside with a Node module-customization hook: the child resolves
// `lib/hardened-private-directory.mjs` to a stub whose `ensureHardenedPrivateDirectory` throws an
// error carrying the typed code PB-WINDOWS-ASSURANCE (the real helper throws exactly that code on win32).
test("--install CLI: a typed refusal thrown by the install path is reported as its own code (PB-WINDOWS-ASSURANCE), exit 1", () => {
  const workDir = mkdtempSync(join(tmpdir(), "commit-msg-typed-refusal-"));
  try {
    const repoDir = join(workDir, "repo");
    mkdirSync(repoDir);
    const init = spawnSync("git", ["init", "-q"], { cwd: repoDir, encoding: "utf8" });
    assert.equal(init.status, 0, init.stderr);
    const stubSource = 'export function ensureHardenedPrivateDirectory() { throw Object.assign(new Error("fixture: private-state assurance refused"), { code: "PB-WINDOWS-ASSURANCE" }); }';
    const hooksSource = [
      `const STUB_URL = ${JSON.stringify(`data:text/javascript,${encodeURIComponent(stubSource)}`)};`,
      "export async function resolve(specifier, context, nextResolve) {",
      "  const resolved = await nextResolve(specifier, context);",
      '  return resolved.url.endsWith("/lib/hardened-private-directory.mjs") ? { url: STUB_URL, shortCircuit: true } : resolved;',
      "}",
    ].join("\n");
    const preloadPath = join(workDir, "inject-typed-refusal.mjs");
    writeFileSync(preloadPath, [
      'import { register } from "node:module";',
      `register(${JSON.stringify(`data:text/javascript,${encodeURIComponent(hooksSource)}`)});`,
    ].join("\n"), "utf8");
    // TR-J-T3: deliberately the LIVE installer. The injected stub throws inside ensureHardenedPrivateDirectory, which
    // runs before publishGitHookRuntimeSnapshot, and a fresh repository has no marker to inspect, so this case never
    // inventories the live tree and its assertion is about the CLI's typed-refusal JSON, not about a lib path.
    const installer = fileURLToPath(new URL("./commit-msg-hook-install.mjs", import.meta.url));
    const result = spawnSync(process.execPath, ["--import", pathToFileURL(preloadPath).href, installer, "--install"], {
      cwd: repoDir,
      encoding: "utf8",
      timeout: 60000,
    });
    let payload;
    try {
      payload = JSON.parse(result.stdout);
    } catch {
      assert.fail(`stdout must be one JSON object; got ${JSON.stringify(result.stdout)} (stderr: ${result.stderr})`);
    }
    assert.equal(payload.status, "refused");
    assert.equal(payload.code, "PB-WINDOWS-ASSURANCE");
    assert.equal(result.status, 1, `exit code (stderr: ${result.stderr})`);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

if (completionCases.length !== 23) throw new Error("case completion count drift: expected 23, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(devNull, "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
