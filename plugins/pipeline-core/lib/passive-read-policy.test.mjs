// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { isAllowedPassiveReadTarget } from "./passive-read-policy.mjs";

test("recursive additional roots are exact physical boundaries and retain project key authority", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "passive-additional-root-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo"), home = join(fixture, "home");
  const plugin = join(fixture, "plugin"), sibling = join(fixture, "plugin-sibling");
  const keys = join(fixture, "keys");
  for (const directory of [root, home, plugin, sibling, keys]) mkdirSync(directory);
  writeFileSync(join(plugin, "index.mjs"), "export const value = 1;\n");
  writeFileSync(join(sibling, "readme.md"), "harmless\n");
  writeFileSync(join(keys, "ordinary.md"), "synthetic fixture\n");
  mkdirSync(join(home, ".ssh"));
  writeFileSync(join(home, ".ssh", "ordinary.md"), "synthetic fixture\n");
  const context = { rootDir: root, homeDir: home, recursive: true,
    additionalRecursiveRoots: [plugin],
    machinePlaneRead: () => ({ status: "absent" }),
    repoKeyDirectory: (project) => {
      assert.equal(project, root, "key authority remains bound to original project");
      return { status: "valid", directory: keys };
    },
  };
  assert.equal(isAllowedPassiveReadTarget(plugin, context), true);
  assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [] }), false);
  assert.equal(isAllowedPassiveReadTarget(sibling, context), false);
  assert.equal(isAllowedPassiveReadTarget("plugin", context), false, "relative paths resolve only in project");
  assert.equal(isAllowedPassiveReadTarget(join(plugin, "..", "plugin") + "/../plugin", context), false);
  for (const boundary of [null, "plugin", plugin + "/..", join(fixture, "missing"), join(plugin, "index.mjs")]) {
    assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: [boundary] }), false);
  }
  assert.equal(isAllowedPassiveReadTarget(plugin, { ...context, additionalRecursiveRoots: plugin }), false);
  const escape = join(plugin, "outside");
  symlinkSync(sibling, escape, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(escape, context), false);
  assert.equal(isAllowedPassiveReadTarget(escape, { ...context, additionalRecursiveRoots: [escape] }), false);
  const alias = join(plugin, "key-alias");
  symlinkSync(keys, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(join(alias, "ordinary.md"), context), false);
  assert.equal(isAllowedPassiveReadTarget(keys, { ...context, additionalRecursiveRoots: [keys] }), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh"), {
    ...context, additionalRecursiveRoots: [join(home, ".ssh")],
  }), false);
  assert.equal(isAllowedPassiveReadTarget(plugin, {
    ...context, machinePlaneRead: () => ({ status: "invalid" }),
  }), false);
  assert.equal(isAllowedPassiveReadTarget(plugin, {
    ...context, repoKeyDirectory: () => ({ status: "invalid" }),
  }), false);
  writeFileSync(join(plugin, "po-private.pem"), "synthetic fixture\n");
  assert.equal(isAllowedPassiveReadTarget(plugin, context), false, "recursive inventory still excludes keys");
});

test("an external user report remains readable while key material and aliases are excluded", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "passive-read-policy-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const root = join(fixture, "repo");
  const home = join(fixture, "home");
  const keyDir = join(fixture, "keys");
  const documents = join(fixture, "documents");
  mkdirSync(root);
  mkdirSync(home);
  mkdirSync(keyDir);
  mkdirSync(documents);
  mkdirSync(join(home, ".ssh"));
  mkdirSync(join(home, ".kube"));
  mkdirSync(join(home, ".config", "gh"), { recursive: true });
  mkdirSync(join(home, ".codex", "plugins", "cache"), { recursive: true });
  const report = join(home, "review.md");
  const key = join(keyDir, "random-name.md");
  writeFileSync(report, "report\n");
  writeFileSync(key, "private\n");
  writeFileSync(join(home, ".ssh", "id_ed25519"), "private\n");
  writeFileSync(join(home, ".kube", "config"), "private\n");
  writeFileSync(join(home, ".config", "gh", "hosts.yml"), "private\n");
  writeFileSync(join(home, ".codex", "auth.json"), "private\n");
  writeFileSync(join(home, ".codex", "plugins", "cache", "readme.md"), "plugin docs\n");
  const context = { rootDir: root, homeDir: home, credentialRoots: [keyDir] };
  assert.equal(isAllowedPassiveReadTarget(report, context), true);
  assert.equal(isAllowedPassiveReadTarget("~/review.md", context), true);
  assert.equal(isAllowedPassiveReadTarget(key, context), false);
  const repoKeyDir = join(fixture, "repo-specific-key");
  mkdirSync(repoKeyDir);
  const repoKey = join(repoKeyDir, "ordinary-report.md");
  writeFileSync(repoKey, "private\n");
  assert.equal(isAllowedPassiveReadTarget(repoKey, {
    ...context, repoKeyDirectory: () => ({ status: "valid", directory: repoKeyDir }),
  }), false, "repository key pointer takes precedence over a different machine key root");
  assert.equal(isAllowedPassiveReadTarget(report, {
    ...context, repoKeyDirectory: () => ({ status: "invalid", directory: null }),
  }), false, "a malformed repository key pointer cannot silently widen external reads");
  assert.equal(isAllowedPassiveReadTarget(report, {
    ...context, machinePlaneRead: () => ({ status: "invalid", plane: null }),
  }), false, "a malformed machine plane cannot silently widen external reads");
  const initialized = spawnSync("git", ["init"], { cwd: root, encoding: "utf8" });
  assert.equal(initialized.status, 0);
  mkdirSync(join(root, ".git", "agent-pipeline"), { recursive: true });
  writeFileSync(join(root, ".git", "agent-pipeline", "po-key-directory.json"), JSON.stringify({
    schema: "pipeline.po-key-directory.v1", poKeyDirectory: repoKeyDir,
    updatedAt: "2026-09-30T00:00:00.000Z",
  }));
  assert.equal(isAllowedPassiveReadTarget(repoKey, { rootDir: root, homeDir: home }), false,
    "real repository pointer protects a divergent key directory without test injection");
  assert.equal(isAllowedPassiveReadTarget(report, { rootDir: root, homeDir: home }), true);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".ssh", "id_ed25519"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".kube", "config"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".config", "gh", "hosts.yml"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".codex", "auth.json"), context), false);
  assert.equal(isAllowedPassiveReadTarget(join(home, ".codex", "plugins", "cache", "readme.md"), context), true);
  if (process.platform === "linux") {
    assert.equal(isAllowedPassiveReadTarget("/proc/self/environ", context), false);
    assert.equal(isAllowedPassiveReadTarget("/etc/passwd", context), false);
  }
  assert.equal(isAllowedPassiveReadTarget(join(home, "po-private.pem"), context), false);
  assert.equal(isAllowedPassiveReadTarget(home, { ...context, recursive: true }), false);
  assert.equal(isAllowedPassiveReadTarget(documents, { ...context, directoryListing: true }), true);
  assert.equal(isAllowedPassiveReadTarget(documents, { ...context, recursive: true }), false);
  assert.equal(isAllowedPassiveReadTarget(`${keyDir}/*`, context), false, "Bash wildcard expansion cannot bypass the key root");
  const alias = join(home, "alias");
  symlinkSync(keyDir, alias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(join(alias, "random-name.md"), context), false);
  mkdirSync(join(keyDir, "sub"));
  assert.equal(isAllowedPassiveReadTarget(`${alias}/sub/../random-name.md`, context), false);
  const outsideAlias = join(root, "outside-alias");
  symlinkSync(documents, outsideAlias, process.platform === "win32" ? "junction" : "dir");
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, recursive: true }), false);
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, directoryListing: true }), true);
  writeFileSync(join(documents, "po-private.pem"), "private\n");
  assert.equal(isAllowedPassiveReadTarget(outsideAlias, { ...context, recursive: true }), false);
  const internal = join(root, "src");
  mkdirSync(internal);
  writeFileSync(join(internal, "index.mjs"), "export const value = 1;\n");
  assert.equal(isAllowedPassiveReadTarget(internal, { ...context, recursive: true }), true);
  writeFileSync(join(internal, "po-private.pem"), "SECRET=x\n");
  assert.equal(isAllowedPassiveReadTarget(internal, { ...context, recursive: true }), false);
  if (process.platform === "win32") {
    const alternateCase = report[0] === report[0].toLowerCase()
      ? report[0].toUpperCase() + report.slice(1) : report[0].toLowerCase() + report.slice(1);
    assert.equal(isAllowedPassiveReadTarget(alternateCase, context), true);
  }
});
