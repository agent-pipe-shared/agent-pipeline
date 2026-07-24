// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  cpSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { observeCodexPublicCoreIdentity, observePublicCoreIdentity } from "./public-core-observation.mjs";

let symlinkCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "public-core-observation-symlink-probe-"));
  try { writeFileSync(join(probeDir, "target"), "x"); symlinkSync(join(probeDir, "target"), join(probeDir, "link")); }
  catch { symlinkCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!symlinkCapable) process.stdout.write("[capability: symlink unavailable] skipping symlink-specific checks\n");
}

let fifoCapable = true;
{
  const probeDir = mkdtempSync(join(tmpdir(), "public-core-observation-fifo-probe-"));
  try {
    const fifoPath = join(probeDir, "probe.fifo");
    execFileSync("mkfifo", [fifoPath]);
    const info = lstatSync(fifoPath);
    fifoCapable = !info.isFile() && !info.isDirectory();
  } catch { fifoCapable = false; }
  finally { rmSync(probeDir, { recursive: true, force: true }); }
  if (!fifoCapable) process.stdout.write("[capability: fifo unavailable] skipping fifo-specific checks\n");
}

const MANIFEST = `${JSON.stringify({
  name: "pipeline-core",
  version: "1.2.3-test.1",
  description: "fixture",
  hooks: "./hooks/codex-hooks.json",
  author: { name: "fixture" },
  interface: { displayName: "Fixture" },
}, null, 2)}\n`;
const VERSIONLESS_MANIFEST = `${JSON.stringify({
  name: "pipeline-core",
  description: "fixture",
  hooks: "./hooks/codex-hooks.json",
  author: { name: "fixture" },
  interface: { displayName: "Fixture" },
}, null, 2)}\n`;
const HOST_PLUGIN_VERSION = "1.2.3-test.1";

function codexHostSpawn(path, version = HOST_PLUGIN_VERSION) {
  return () => ({
    status: 0,
    signal: null,
    stdout: JSON.stringify({
      installed: [{
        pluginId: "pipeline-core@agent-pipeline",
        name: "pipeline-core",
        marketplaceName: "agent-pipeline",
        version,
        installed: true,
        enabled: true,
        source: { source: "local", path },
        marketplaceSource: { sourceType: "git", source: "https://example.test/public-core.git" },
        installPolicy: "AVAILABLE",
        authPolicy: "ON_INSTALL",
      }],
      available: [],
    }),
    stderr: "",
  });
}

function git(root, args, options = {}) {
  return execFileSync("git", args, {
    cwd: root,
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  }).trim();
}

function fixture(origin = "https://example.test/owner/public-core.git", manifest = MANIFEST) {
  const base = mkdtempSync(join(tmpdir(), "public-core-observation-"));
  const sourceRoot = join(base, "source");
  const sourcePluginRoot = join(sourceRoot, "plugins", "pipeline-core");
  const sourceManifestPath = join(sourcePluginRoot, ".codex-plugin", "plugin.json");
  mkdirSync(dirname(sourceManifestPath), { recursive: true });
  writeFileSync(sourceManifestPath, manifest);
  mkdirSync(join(sourcePluginRoot, "hooks"));
  writeFileSync(join(sourcePluginRoot, "hooks", "codex-hooks.json"), "{}\n");
  mkdirSync(join(sourcePluginRoot, "empty-directory"));
  git(sourceRoot, ["init", "--initial-branch=feature/fixture"]);
  git(sourceRoot, ["remote", "add", "origin", origin]);
  git(sourceRoot, ["add", "."]);
  git(sourceRoot, [
    "-c", "user.name=Fixture",
    "-c", "user.email=fixture@example.test",
    "commit", "-m", "fixture",
  ]);
  const installedPluginRoot = join(base, "installed", "1.2.3-test.1");
  mkdirSync(dirname(installedPluginRoot), { recursive: true });
  cpSync(sourcePluginRoot, installedPluginRoot, { recursive: true });
  return {
    base,
    sourceRoot,
    sourcePluginRoot,
    sourceManifestPath,
    installedPluginRoot,
    installedManifestPath: join(installedPluginRoot, ".codex-plugin", "plugin.json"),
    input(overrides = {}) {
      return {
        sourcePluginRoot,
        installedPluginRoot,
        ...overrides,
      };
    },
    cleanup() { rmSync(base, { recursive: true, force: true }); },
  };
}

function rejected(result, code = undefined) {
  assert.equal(result.schema, "pipeline.public-core-observation.v1");
  assert.equal(result.status, "rejected");
  assert.deepEqual(Object.keys(result).sort(), ["reasonCodes", "schema", "status"]);
  assert.equal(result.reasonCodes.length, 1);
  if (code !== undefined) assert.equal(result.reasonCodes[0], code);
}

test("observes a Git source and equivalent flattened installed plugin", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  const calls = [];
  const result = observePublicCoreIdentity(repo.input(), {
    execFileSync(command, args, options) {
      calls.push({ command, args, options });
      return execFileSync(command, args, options);
    },
  });

  assert.deepEqual(calls.map(({ command, args }) => [command, args]), [
    ["git", ["rev-parse", "--show-toplevel"]],
    ["git", ["rev-parse", "HEAD"]],
    ["git", ["rev-parse", "HEAD^{tree}"]],
    ["git", ["symbolic-ref", "--short", "HEAD"]],
    ["git", ["remote", "get-url", "origin"]],
    ["git", ["status", "--porcelain=v1", "--untracked-files=all", "--", "plugins/pipeline-core"]],
  ]);
  for (const { options } of calls) assert.deepEqual(options, {
    cwd: repo.sourceRoot,
    shell: false,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.deepEqual(result.candidate, {
    repository: "https://example.test/owner/public-core.git",
    branch: "feature/fixture",
    commit: git(repo.sourceRoot, ["rev-parse", "HEAD"]),
    tree: git(repo.sourceRoot, ["rev-parse", "HEAD^{tree}"]),
  });
  assert.deepEqual(result.plugin, {
    name: "pipeline-core",
    version: "1.2.3-test.1",
    manifestSha256: createHash("sha256").update(MANIFEST).digest("hex"),
    contentSha256: result.plugin.contentSha256,
  });
  assert.match(result.plugin.contentSha256, /^[0-9a-f]{64}$/u);
});

test("accepts one physical source root as the installed development root", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  const result = observePublicCoreIdentity(repo.input({ installedPluginRoot: repo.sourcePluginRoot }));
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.match(result.plugin.contentSha256, /^[0-9a-f]{64}$/u);
});

test("accepts a versionless Codex manifest only with a typed host plugin-list version", (t) => {
  const repo = fixture(undefined, VERSIONLESS_MANIFEST);
  t.after(repo.cleanup);

  rejected(observePublicCoreIdentity(repo.input()), "SNT-A2-SOURCE-MANIFEST-SCHEMA");
  const result = observeCodexPublicCoreIdentity(repo.input(), { spawnSync: codexHostSpawn(repo.sourcePluginRoot) });
  assert.equal(result.status, "ready", JSON.stringify(result));
  assert.equal(result.plugin.version, HOST_PLUGIN_VERSION);
  assert.equal(result.plugin.manifestSha256, createHash("sha256").update(VERSIONLESS_MANIFEST).digest("hex"));
});

test("rejects caller-supplied and unavailable Codex host versions for a versionless manifest", (t) => {
  const repo = fixture(undefined, VERSIONLESS_MANIFEST);
  t.after(repo.cleanup);
  rejected(observePublicCoreIdentity(repo.input({ hostPluginVersion: HOST_PLUGIN_VERSION })), "SNT-A2-INPUT-SCHEMA");
  rejected(observeCodexPublicCoreIdentity(repo.input(), { spawnSync: () => ({ status: 1 }) }), "SNT-A2-CODEX-HOST-UNAVAILABLE");
});

test("rejects a declared manifest version that differs from the Codex host record", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  rejected(observeCodexPublicCoreIdentity(repo.input(), {
    spawnSync: codexHostSpawn(repo.sourcePluginRoot, "1.2.3-other"),
  }), "SNT-A2-SOURCE-MANIFEST-SCHEMA");
});

test("host-attested version never bypasses versionless source or installed snapshot drift", () => {
  const mutations = [
    [(repo) => writeFileSync(repo.installedManifestPath, MANIFEST), "SNT-A2-MANIFEST-MISMATCH"],
    [(repo) => writeFileSync(join(repo.installedPluginRoot, "hooks", "codex-hooks.json"), "changed\n"), "SNT-A2-CONTENT-MISMATCH"],
  ];
  for (const [mutate, expectedCode] of mutations) {
    const repo = fixture(undefined, VERSIONLESS_MANIFEST);
    try {
      mutate(repo);
      rejected(observeCodexPublicCoreIdentity(repo.input(), {
        spawnSync: codexHostSpawn(repo.sourcePluginRoot),
      }), expectedCode);
    } finally { repo.cleanup(); }
  }
});

test("rejects missing, extra, and byte-drifted installed content", () => {
  const mutations = [
    (repo) => unlinkSync(join(repo.installedPluginRoot, "hooks", "codex-hooks.json")),
    (repo) => writeFileSync(join(repo.installedPluginRoot, "extra.txt"), "extra\n"),
    (repo) => writeFileSync(join(repo.installedPluginRoot, "hooks", "codex-hooks.json"), "changed\n"),
    (repo) => mkdirSync(join(repo.installedPluginRoot, "extra-empty-directory")),
  ];
  for (const mutate of mutations) {
    const repo = fixture();
    try {
      mutate(repo);
      rejected(observePublicCoreIdentity(repo.input()), "SNT-A2-CONTENT-MISMATCH");
    } finally { repo.cleanup(); }
  }
});

test("rejects dirt inside the source plugin and accepts dirt outside it", (t) => {
  const dirty = fixture();
  try {
    writeFileSync(join(dirty.sourcePluginRoot, "dirty.txt"), "dirty\n");
    rejected(observePublicCoreIdentity(dirty.input()), "SNT-A2-SOURCE-DIRTY");
  } finally { dirty.cleanup(); }

  const outside = fixture();
  t.after(outside.cleanup);
  writeFileSync(join(outside.sourceRoot, "outside.txt"), "outside\n");
  assert.equal(observePublicCoreIdentity(outside.input()).status, "ready");
});

test("rejects symlinked, hard-linked, and special installed entries", () => {
  const cases = [
    ...(symlinkCapable ? [(repo) => symlinkSync(join(repo.installedPluginRoot, "hooks", "codex-hooks.json"), join(repo.installedPluginRoot, "linked.json"))] : []),
    (repo) => linkSync(join(repo.installedPluginRoot, "hooks", "codex-hooks.json"), join(repo.installedPluginRoot, "hard-linked.json")),
    ...(fifoCapable ? [(repo) => {
      try { execFileSync("mkfifo", [join(repo.installedPluginRoot, "special.fifo")]); }
      catch (error) { if (error?.status !== 0) throw error; }
    }] : []),
  ];
  for (const mutate of cases) {
    const repo = fixture();
    try {
      mutate(repo);
      const result = observePublicCoreIdentity(repo.input());
      rejected(result);
      assert.ok(["SNT-A2-PLUGIN-SYMLINK", "SNT-A2-PLUGIN-NONREGULAR"].includes(result.reasonCodes[0]));
    } finally { repo.cleanup(); }
  }
});

test("rejects source and installed manifest mismatch before general content drift", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  const changed = JSON.parse(MANIFEST);
  changed.version = "1.2.3-test.2";
  writeFileSync(repo.installedManifestPath, `${JSON.stringify(changed, null, 2)}\n`);
  rejected(observePublicCoreIdentity(repo.input()), "SNT-A2-MANIFEST-MISMATCH");
});

test("rejects a file identity swap during installed enumeration", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  const selected = join(repo.installedPluginRoot, "hooks", "codex-hooks.json");
  const displaced = `${selected}.original`;
  let swapped = false;
  const result = observePublicCoreIdentity(repo.input(), {
    afterOpen({ root, relativePath }) {
      if (!swapped && root === repo.installedPluginRoot && relativePath === "hooks/codex-hooks.json") {
        swapped = true;
        renameSync(selected, displaced);
        writeFileSync(selected, "{}\n");
      }
    },
  });
  rejected(result, "SNT-A2-PLUGIN-CHANGED");
});

test("rejects detached and unsafe origins", () => {
  const detached = fixture();
  try {
    git(detached.sourceRoot, ["checkout", "--detach"]);
    rejected(observePublicCoreIdentity(detached.input()), "SNT-A2-GIT-DETACHED");
  } finally { detached.cleanup(); }
  for (const origin of [
    "https://user:secret@example.test/owner/public-core.git",
    "https://example.test/owner/public-core.git?token=secret",
    "git@example.test:owner/public-core.git",
  ]) {
    const repo = fixture(origin);
    try { rejected(observePublicCoreIdentity(repo.input()), "SNT-A2-GIT-ORIGIN-INVALID"); }
    finally { repo.cleanup(); }
  }
});

test("rejects unsafe roots, open inputs, and dependency errors without leaking details", (t) => {
  const repo = fixture();
  t.after(repo.cleanup);
  rejected(observePublicCoreIdentity({ sourcePluginRoot: repo.sourcePluginRoot }));
  rejected(observePublicCoreIdentity({ ...repo.input(), extra: true }));
  rejected(observePublicCoreIdentity(repo.input({ sourcePluginRoot: dirname(repo.sourcePluginRoot) })));
  rejected(observePublicCoreIdentity(repo.input(), { extra: true }));
  const secret = `${repo.base}/private-error-content`;
  const result = observePublicCoreIdentity(repo.input(), {
    execFileSync() { throw new Error(secret); },
  });
  rejected(result);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(repo.base), false);
  assert.equal(serialized.includes(secret), false);
  assert.doesNotMatch(serialized, /private-error-content|Error/u);
});
