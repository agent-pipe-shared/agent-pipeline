import assert from "node:assert/strict";
import { registerTestCaseCompletion } from "../lib/test-case-completion.mjs";
import { openSync as openCompletionDescriptor } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applyInstall as installPrePush } from "./pre-push-hook-install.mjs";
import { applyInstall as installPreCommit } from "./pre-commit-hook-install.mjs";
import { applyInstall as installCommitMsg } from "./commit-msg-hook-install.mjs";
import { publishGitHookRuntimeSnapshot } from "../lib/git-hook-runtime-snapshot.mjs";
import { hardenWindowsPrivateDirectory } from "../lib/windows-private-state.mjs";
const completionCases = [];
function test(name, optionsOrRun, possibleRun) {
  const options = typeof optionsOrRun === "function" ? {} : optionsOrRun ?? {};
  const run = typeof optionsOrRun === "function" ? optionsOrRun : possibleRun;
  if (typeof name !== "string" || typeof run !== "function") throw new TypeError("invalid callback registration");
  const entry = { id: "ISP" + String(completionCases.length + 1).padStart(3, "0"), name, run };
  if (options.skip === true) entry.mode = "skip";
  completionCases.push(entry);
}


const sourcePluginRoot = join(process.cwd(), "plugins", "pipeline-core");
const sourceLib = join(sourcePluginRoot, "lib");

function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function fixtureRepo(label) {
  const root = mkdtempSync(join(tmpdir(), "hook-snapshot-progress-" + label + "-"));
  git(root, "init", "-q", "-b", "main");
  git(root, "config", "user.email", "fixture@example.invalid");
  git(root, "config", "user.name", "Fixture");
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, "add", "README.md");
  git(root, "commit", "-q", "-m", "fixture");
  return root;
}

function collectInstallProgress(install, args, expectedStatus) {
  const events = [];
  const result = install({ ...args, onProgress: (event) => events.push(event), timeBudgetMs: 80000 });
  assert.equal(result.status, expectedStatus, JSON.stringify(result));
  assert.ok(events.some((event) => event.phase === "copy"), "copy progress reaches the installer caller");
  assert.ok(events.some((event) => event.phase === "complete"), "completion progress reaches the installer caller");
  assert.ok(events.length <= 32, "progress remains bounded and omits file-by-file names");
  if (process.platform === "win32") assert.ok(events.some((event) => event.phase === "windows-acl"), "batched native ACL verification reports bounded progress");
}

const checkRootPrivacy = (path) => {
  if (process.platform === "win32") assert.equal(hardenWindowsPrivateDirectory(path).status, "secure");
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

function prepareOwnerTemp(state, directoryName, pid, inventory, wrongIdentity = false) {
  const temporary = join(state, directoryName);
  mkdirSync(temporary, { mode: 0o700 });
  checkRootPrivacy(temporary);
  const manifestSha256 = sha256(Buffer.from(JSON.stringify({ schema: "pipeline.git-hook-runtime-snapshot.v1", inventory }) + "\n"));
  const owner = {
    schema: "pipeline.git-hook-runtime-temp-owner.v1",
    directoryName,
    temporaryIdentity: wrongIdentity
      ? { dev: "wrong-device", ino: "wrong-inode" }
      : { dev: String(statSync(temporary).dev), ino: String(statSync(temporary).ino) },
    pid,
    nonce: randomBytes(32).toString("hex"),
    manifestSha256,
    inventory,
  };
  writeFileSync(join(temporary, ".runtime-owner.json"), JSON.stringify(owner) + "\n", { mode: 0o600 });
  return temporary;
}

test("all three hook installers forward bounded snapshot progress callbacks", () => {
  const roots = [];
  try {
    const prePush = fixtureRepo("pre-push");
    roots.push(prePush);
    collectInstallProgress(installPrePush, { rootDir: prePush, pluginLibDir: sourceLib }, "installed");

    const preCommit = fixtureRepo("pre-commit");
    roots.push(preCommit);
    collectInstallProgress(installPreCommit, {
      rootDir: preCommit,
      pluginLibDir: sourceLib,
      pluginHooksDir: join(sourcePluginRoot, "hooks"),
      pluginScriptsDir: join(sourcePluginRoot, "scripts"),
    }, "installed");

    const commitMsg = fixtureRepo("commit-msg");
    roots.push(commitMsg);
    collectInstallProgress(installCommitMsg, { rootDir: commitMsg, pluginLibDir: sourceLib }, "installed");
  } finally {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  }
});

test("source drift during copy aborts before publishing and removes only its exact owned temporary", () => {
  const root = mkdtempSync(join(tmpdir(), "hook-snapshot-source-drift-"));
  const pluginRoot = join(root, "plugin");
  const lib = join(pluginRoot, "lib");
  const state = join(root, "state");
  mkdirSync(lib, { recursive: true, mode: 0o700 });
  mkdirSync(state, { mode: 0o700 });
  checkRootPrivacy(state);
  writeFileSync(join(pluginRoot, "protected-baseline.json"), "{}\n", { mode: 0o600 });
  const sourceFile = join(lib, "governance-scope.mjs");
  writeFileSync(sourceFile, "export const sourceVersion = 1;\n", { mode: 0o600 });
  try {
    assert.throws(() => publishGitHookRuntimeSnapshot({
      pluginLibDir: lib,
      stateDir: state,
      onProgress: (event) => {
        if (event.phase === "copy") writeFileSync(sourceFile, "export const sourceVersion = 2;\n", { mode: 0o600 });
      },
    }), { code: "GHS-SOURCE-DRIFT" });
    assert.deepEqual(readdirSync(state), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("existing snapshot is not returned after a source change during its readback", () => {
  const root = mkdtempSync(join(tmpdir(), "hook-snapshot-existing-drift-"));
  const pluginRoot = join(root, "plugin");
  const lib = join(pluginRoot, "lib");
  const state = join(root, "state");
  mkdirSync(lib, { recursive: true, mode: 0o700 });
  mkdirSync(state, { mode: 0o700 });
  checkRootPrivacy(state);
  writeFileSync(join(pluginRoot, "protected-baseline.json"), "{}\n", { mode: 0o600 });
  const sourceFile = join(lib, "governance-scope.mjs");
  writeFileSync(sourceFile, "export const sourceVersion = 1;\n", { mode: 0o600 });
  try {
    const first = publishGitHookRuntimeSnapshot({ pluginLibDir: lib, stateDir: state });
    assert.equal(existsSync(first.root), true);
    assert.throws(() => publishGitHookRuntimeSnapshot({
      pluginLibDir: lib,
      stateDir: state,
      onProgress: (event) => {
        if (event.phase === "verify") writeFileSync(sourceFile, "export const sourceVersion = 2;\n", { mode: 0o600 });
      },
    }), { code: "GHS-SOURCE-DRIFT" });
    assert.equal(existsSync(first.root), true, "previous immutable snapshot remains intact");
    assert.equal(readdirSync(state).some((name) => name.startsWith("runtime-tmp-")), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("stale cleanup removes only marked dead-owner partial trees and retains live or unmarked trees", () => {
  const root = mkdtempSync(join(tmpdir(), "hook-snapshot-stale-owner-"));
  const pluginRoot = join(root, "plugin");
  const lib = join(pluginRoot, "lib");
  const state = join(root, "state");
  mkdirSync(lib, { recursive: true, mode: 0o700 });
  mkdirSync(state, { mode: 0o700 });
  checkRootPrivacy(state);
  const baseline = Buffer.from("{}\n");
  const governance = Buffer.from("export const scope = true;\n");
  writeFileSync(join(pluginRoot, "protected-baseline.json"), baseline, { mode: 0o600 });
  writeFileSync(join(lib, "governance-scope.mjs"), governance, { mode: 0o600 });
  const inventory = [
    { path: "lib/governance-scope.mjs", sha256: sha256(governance) },
    { path: "protected-baseline.json", sha256: sha256(baseline) },
  ];
  const stale = prepareOwnerTemp(state, "runtime-tmp-0123456789abcdef", 2147483647, inventory);
  const live = prepareOwnerTemp(state, "runtime-tmp-fedcba9876543210", process.pid, inventory);
  const wrongIdentity = prepareOwnerTemp(state, "runtime-tmp-1111111111111111", 2147483647, inventory, true);
  const foreignContent = prepareOwnerTemp(state, "runtime-tmp-2222222222222222", 2147483647, inventory);
  const unmarked = join(state, "runtime-tmp-0000000000000000");
  mkdirSync(unmarked, { mode: 0o700 });
  writeFileSync(join(unmarked, "unknown.txt"), "retained\n", { mode: 0o600 });
  mkdirSync(join(stale, "lib"), { recursive: true, mode: 0o700 });
  writeFileSync(join(stale, "lib", "governance-scope.mjs"), governance, { mode: 0o600 });
  mkdirSync(join(foreignContent, "unlisted"), { mode: 0o700 });
  try {
    publishGitHookRuntimeSnapshot({ pluginLibDir: lib, stateDir: state, timeBudgetMs: 80000 });
    assert.equal(existsSync(stale), false, "dead, exact-manifest-owned partial tree is reclaimed");
    assert.equal(existsSync(live), true, "live owner is never reclaimed");
    assert.equal(existsSync(wrongIdentity), true, "directory identity mismatch is retained");
    assert.equal(existsSync(foreignContent), true, "unknown child content is retained");
    assert.equal(existsSync(join(unmarked, "unknown.txt")), true, "unmarked unknown content is retained");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

if (completionCases.length !== 4) throw new Error("case completion count drift: expected 4, got " + completionCases.length);
const completionFd = process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD === undefined
  ? openCompletionDescriptor(process.platform === "win32" ? "NUL" : "/dev/null", "w")
  : Number(process.env.PIPELINE_VERIFY_CASE_COMPLETION_FD);
registerTestCaseCompletion({ cases: completionCases, fd: completionFd, maxBytes: 65536 });
