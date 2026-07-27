#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import test from "node:test";
import { join, resolve } from "node:path";

import { observeCodexRulesetSource } from "./codex-host-plugin-list.mjs";

const SHA = "a".repeat(40);
const FIXTURE_ROOT = resolve("codex-host-plugin-list-fixture");
const BIN_ROOT = join(FIXTURE_ROOT, "bin");
const LOADED_ROOT = join(FIXTURE_ROOT, "loaded", "plugins", "pipeline-core");
const INSTALLED_ROOT = join(FIXTURE_ROOT, "installed", "plugins", "pipeline-core");
const LOCAL_ROOT = join(FIXTURE_ROOT, "local");

function pluginEntry({
  pluginId = "pipeline-core@agent-pipeline",
  version = "0.4.6+codex.test",
  path = INSTALLED_ROOT,
  sourceType = "git",
  source = "https://github.com/agent-pipe-shared/agent-pipeline.git",
} = {}) {
  return {
    pluginId,
    name: "pipeline-core",
    marketplaceName: pluginId.slice("pipeline-core@".length),
    version,
    installed: true,
    enabled: true,
    source: { source: "local", path },
    marketplaceSource: { sourceType, source },
    installPolicy: "AVAILABLE",
    authPolicy: "ON_INSTALL",
  };
}

function pluginList(installed) {
  return JSON.stringify({ installed, available: [] });
}

function observe({
  installed = [pluginEntry()],
  loadedPluginRoot = LOADED_ROOT,
  selfApplicationRoot = undefined,
  heads = new Map([[LOADED_ROOT, SHA], [INSTALLED_ROOT, SHA]]),
  spawnCalls = undefined,
  gitCalls = undefined,
} = {}) {
  return observeCodexRulesetSource({
    loadedPluginRoot,
    selfApplicationRoot,
    resolveExecutable(name) {
      if (name === "codex") return { ok: true, path: join(BIN_ROOT, "codex") };
      if (name === "git") return { ok: true, path: join(BIN_ROOT, "git") };
      return { ok: false, status: "binary_missing" };
    },
    spawnSync(path, args, options) {
      spawnCalls?.push({ path, args, options });
      return { status: 0, signal: null, stdout: pluginList(installed), stderr: "" };
    },
    execFileSync(path, args, options) {
      gitCalls?.push({ path, args, options });
      const root = args[1];
      if (!heads.has(root)) throw new Error("pre-head private detail");
      return `${heads.get(root)}\n`;
    },
    observeSelfApplication(input) {
      return {
        schema: "pipeline.public-core-observation.v1",
        status: "ready",
        candidate: { commit: heads.get(input.sourcePluginRoot) },
        plugin: { contentSha256: "c".repeat(64) },
      };
    },
  });
}

function assertSafe(result, forbidden) {
  const serialized = JSON.stringify(result);
  for (const value of forbidden) assert.equal(serialized.includes(value), false, serialized);
}

test("Codex-only readback yields a normalized public marketplace observation", () => {
  const spawnCalls = [];
  const gitCalls = [];
  const result = observe({ spawnCalls, gitCalls });

  assert.deepEqual(result, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "ready",
    observation: {
      schema: "pipeline.ruleset-source.v1",
      runner: "codex",
      selectedPlugin: { id: "pipeline-core@agent-pipeline", version: "0.4.6+codex.test" },
      source: { class: "marketplace-public" },
      loadedIdentity: { status: "available", algorithm: "git-sha1", value: SHA },
      installedIdentity: { status: "available", algorithm: "git-sha1", value: SHA },
    },
  });
  assert.deepEqual(spawnCalls, [{
    path: join(BIN_ROOT, "codex"),
    args: ["plugin", "list", "--json"],
    options: {
      encoding: "utf8",
      env: { GIT_TERMINAL_PROMPT: "0", LANG: "C", LC_ALL: "C", NO_COLOR: "1" },
      maxBuffer: 128 * 1024,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 5000,
    },
  }]);
  assert.deepEqual(gitCalls, [
    {
      path: join(BIN_ROOT, "git"),
      args: ["-C", LOADED_ROOT, "rev-parse", "HEAD"],
      options: { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] },
    },
    {
      path: join(BIN_ROOT, "git"),
      args: ["-C", INSTALLED_ROOT, "rev-parse", "HEAD"],
      options: { encoding: "utf8", shell: false, stdio: ["ignore", "pipe", "pipe"] },
    },
  ]);
  assertSafe(result, [LOADED_ROOT, INSTALLED_ROOT, "github.com"]);
});

test("a local selected root is self-application only when it is the loaded checkout", () => {
  const root = `${LOCAL_ROOT}/plugins/pipeline-core`;
  const local = pluginEntry({
    pluginId: "pipeline-core@agent-pipeline-local",
    path: root,
    sourceType: "local",
    source: LOCAL_ROOT,
  });
  const selfApplication = observe({
    installed: [local],
    loadedPluginRoot: root,
    selfApplicationRoot: LOCAL_ROOT,
    heads: new Map([[root, SHA]]),
  });
  assert.equal(selfApplication.status, "ready");
  assert.equal(selfApplication.observation.source.class, "self-application");

  const localDevelopment = observe({
    installed: [local],
    loadedPluginRoot: LOADED_ROOT,
    selfApplicationRoot: LOCAL_ROOT,
    heads: new Map([[LOADED_ROOT, SHA], [root, SHA]]),
  });
  assert.equal(localDevelopment.status, "ready");
  assert.equal(localDevelopment.observation.source.class, "local-development");
});

test("missing and ambiguous Pipeline selections have distinct typed outcomes", () => {
  const missing = observe({ installed: [] });
  assert.deepEqual(missing, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "codex-plugin-list-unavailable",
    observation: null,
  });

  const ambiguous = observe({ installed: [pluginEntry(), pluginEntry({ pluginId: "pipeline-core@agent-pipeline-local", path: `${LOCAL_ROOT}/plugins/pipeline-core`, sourceType: "local", source: LOCAL_ROOT })] });
  assert.deepEqual(ambiguous, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "codex-plugin-list-ambiguous",
    observation: null,
  });
});

test("a selected root without HEAD remains a typed pre-head observation", () => {
  const result = observe({ heads: new Map([[LOADED_ROOT, SHA]]) });
  assert.equal(result.status, "pre-head");
  assert.deepEqual(result.observation.loadedIdentity, { status: "available", algorithm: "git-sha1", value: SHA });
  assert.deepEqual(result.observation.installedIdentity, { status: "unavailable" });
  assertSafe(result, [LOADED_ROOT, INSTALLED_ROOT, "pre-head private detail"]);
});

test("private coordinates and malformed host records fail closed without a leak", () => {
  const secret = "https://user:secret@private.example.invalid/core.git?token=private";
  const privatePath = join(FIXTURE_ROOT, "private", "cache", "pipeline-core");
  const result = observe({ installed: [pluginEntry({ path: privatePath, source: secret })] });
  assert.deepEqual(result, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "codex-plugin-list-unavailable",
    observation: null,
  });
  assertSafe(result, [secret, privatePath, "private.example.invalid"]);
});

test("only the reviewed Public Core marketplace is public; safe other Git sources stay private", () => {
  const privateRemote = "https://git.example.invalid/company/agent-pipeline.git";
  const privateResult = observe({ installed: [pluginEntry({ source: privateRemote })] });
  assert.equal(privateResult.status, "ready");
  assert.equal(privateResult.observation.source.class, "marketplace-private");
  assertSafe(privateResult, [privateRemote, "git.example.invalid"]);

  const ssh = "git@github.com:agent-pipe-shared/agent-pipeline.git";
  const unsafe = observe({ installed: [pluginEntry({ source: ssh })] });
  assert.equal(unsafe.status, "codex-plugin-list-unavailable");
  assertSafe(unsafe, [ssh]);
});

test("self application rejects a dirty or content-drifted checkout without output paths", () => {
  const root = `${LOCAL_ROOT}/plugins/pipeline-core`;
  const local = pluginEntry({
    pluginId: "pipeline-core@agent-pipeline-local",
    path: root,
    sourceType: "local",
    source: LOCAL_ROOT,
  });
  const result = observeCodexRulesetSource({
    loadedPluginRoot: root,
    selfApplicationRoot: LOCAL_ROOT,
    resolveExecutable(name) {
      if (name === "codex") return { ok: true, path: join(BIN_ROOT, "codex") };
      if (name === "git") return { ok: true, path: join(BIN_ROOT, "git") };
      return { ok: false };
    },
    spawnSync() { return { status: 0, signal: null, stdout: pluginList([local]), stderr: "" }; },
    execFileSync(_path, args) { return `${args[1] === root ? SHA : ""}\n`; },
    observeSelfApplication() { return { schema: "pipeline.public-core-observation.v1", status: "rejected" }; },
  });
  assert.deepEqual(result, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "self-application-unattested",
    observation: null,
  });
  assertSafe(result, [root, LOCAL_ROOT]);
});

test("invalid caller roots are rejected without observing the host", () => {
  const result = observe({ loadedPluginRoot: "relative/private-root" });
  assert.deepEqual(result, {
    schema: "pipeline.codex-ruleset-source-observation.v1",
    status: "invalid-input",
    observation: null,
  });
});
