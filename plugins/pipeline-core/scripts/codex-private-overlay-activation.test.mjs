#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { main } from "./codex-private-overlay-activation.mjs";

// Fixed argv-shape literals; wrapped through resolve() so they stay
// host-canonical (production requires resolve(path) === path) on whichever
// platform runs this test instead of being a Linux-only POSIX literal.
const PROJECT_ROOT = resolve("/private/project");
const SOURCE_PLUGIN_ROOT = resolve("/local/marketplace/plugins/pipeline-core");
const SENTINEL = "private-host-sentinel";
const PLAN_SHA256 = "a".repeat(64);
const USAGE = "Usage: codex-private-overlay-activation.mjs <inspect|plan|status|load-context> --project-root <absolute-path>\n       codex-private-overlay-activation.mjs activate --project-root <absolute-path> --expected-plan-sha256 <64hex>\n";
const REJECTION = '{"schema":"pipeline.codex-private-overlay-source-resolution.v1","status":"rejected","reasonCodes":["SNT-A-CODEX-SOURCE-UNAVAILABLE"]}\n';

function pluginEntry(overrides = {}) {
  return {
    pluginId: "pipeline-core@agent-pipeline",
    name: "pipeline-core",
    marketplaceName: "agent-pipeline",
    version: "0.2.0+fixture",
    installed: true,
    enabled: true,
    source: {
      source: "local",
      path: SOURCE_PLUGIN_ROOT,
      ...(overrides.source ?? {}),
    },
    marketplaceSource: {
      sourceType: "git",
      source: "https://example.invalid/public-core.git",
      ...(overrides.marketplaceSource ?? {}),
    },
    installPolicy: "AVAILABLE",
    authPolicy: "ON_INSTALL",
    ...Object.fromEntries(Object.entries(overrides).filter(([key]) => !["source", "marketplaceSource"].includes(key))),
  };
}

function document(installed = [pluginEntry()], overrides = {}) {
  return { installed, available: [], ...overrides };
}

function successfulSpawn(value = document()) {
  return () => ({
    status: 0,
    signal: null,
    stdout: JSON.stringify(value),
    stderr: "",
  });
}

function capture(argv, overrides = {}) {
  let stdout = "";
  let stderr = "";
  const calls = [];
  const dependencies = {
    spawnSync: successfulSpawn(),
    activationMain(args) { calls.push(args); return 0; },
    ...overrides,
    write(chunk) { stdout += String(chunk); return true; },
    writeError(chunk) { stderr += String(chunk); return true; },
  };
  const code = main(argv, dependencies);
  return { code, stdout, stderr, calls };
}

test("inspect resolves with the exact fixed Codex argv and injects only the local source root", () => {
  const spawnCalls = [];
  const result = capture(["inspect", "--project-root", PROJECT_ROOT], {
    spawnSync(command, args, options) {
      spawnCalls.push({ command, args, options });
      return successfulSpawn()();
    },
    activationMain(args) {
      assert.deepEqual(args, [
        "inspect",
        "--project-root", PROJECT_ROOT,
        "--source-plugin-root", SOURCE_PLUGIN_ROOT,
      ]);
      return 7;
    },
  });
  assert.deepEqual(result, { code: 7, stdout: "", stderr: "", calls: [] });
  assert.equal(spawnCalls.length, 1);
  assert.equal(spawnCalls[0].command, "codex");
  assert.deepEqual(spawnCalls[0].args, ["plugin", "list", "--marketplace", "agent-pipeline", "--json"]);
  assert.deepEqual(spawnCalls[0].options, {
    encoding: "utf8",
    env: {
      GIT_TERMINAL_PROMPT: "0",
      LANG: "C",
      LC_ALL: "C",
      NO_COLOR: "1",
      PATH: process.env.PATH ?? "",
    },
    maxBuffer: 128 * 1024,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    timeout: 5000,
  });
});

test("activation preserves only public arguments and appends the reviewed digest after the internal source", () => {
  const result = capture([
    "activate",
    "--expected-plan-sha256", PLAN_SHA256,
    "--project-root", PROJECT_ROOT,
  ]);
  assert.equal(result.code, 0);
  assert.deepEqual(result.calls, [[
    "activate",
    "--project-root", PROJECT_ROOT,
    "--source-plugin-root", SOURCE_PLUGIN_ROOT,
    "--expected-plan-sha256", PLAN_SHA256,
  ]]);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "");
});

test("status and load-context delegate through the same internally resolved plugin source", () => {
  for (const command of ["status", "load-context"]) {
    const result = capture([command, "--project-root", PROJECT_ROOT]);
    assert.deepEqual(result, {
      code: 0,
      stdout: "",
      stderr: "",
      calls: [[
        command,
        "--project-root", PROJECT_ROOT,
        "--source-plugin-root", SOURCE_PLUGIN_ROOT,
      ]],
    });
  }
});

test("invalid public invocations emit fixed usage before source resolution", () => {
  const cases = [
    [],
    ["inspect"],
    ["unknown", "--project-root", PROJECT_ROOT],
    ["inspect", "--project-root", "relative"],
    ["inspect", "--project-root", PROJECT_ROOT, "--project-root", PROJECT_ROOT],
    ["inspect", "--project-root", PROJECT_ROOT, "--source-plugin-root", SOURCE_PLUGIN_ROOT],
    ["inspect", "--project-root", PROJECT_ROOT, "--expected-plan-sha256", PLAN_SHA256],
    ["status", "--project-root", PROJECT_ROOT, "--expected-plan-sha256", PLAN_SHA256],
    ["load-context", "--project-root", PROJECT_ROOT, "--expected-plan-sha256", PLAN_SHA256],
    ["activate", "--project-root", PROJECT_ROOT],
    ["activate", "--project-root", PROJECT_ROOT, "--expected-plan-sha256", "short"],
  ];
  for (const argv of cases) {
    let spawned = false;
    const result = capture(argv, { spawnSync: () => { spawned = true; } });
    assert.deepEqual(result, { code: 64, stdout: "", stderr: USAGE, calls: [] });
    assert.equal(spawned, false);
  }
});

test("closed plugin-list validation rejects every unavailable or unsafe source shape", () => {
  const valid = pluginEntry();
  const cases = [
    document([]),
    document([valid, pluginEntry()]),
    document([pluginEntry({ enabled: false })]),
    document([pluginEntry({ installed: false })]),
    document([pluginEntry({ pluginId: "other@agent-pipeline" })]),
    document([pluginEntry({ name: "other" })]),
    document([pluginEntry({ marketplaceName: "other" })]),
    document([pluginEntry({ source: { source: "remote" } })]),
    document([pluginEntry({ source: { path: "relative/plugins/pipeline-core" } })]),
    document([pluginEntry({ source: { extra: SENTINEL } })]),
    document([pluginEntry({ marketplaceSource: { sourceType: "local" } })]),
    document([pluginEntry({ marketplaceSource: { source: "https://user:secret@example.invalid/core.git" } })]),
    document([pluginEntry({ marketplaceSource: { source: "https://example.invalid/core.git?token=secret" } })]),
    document([pluginEntry({ unexpected: SENTINEL })]),
    { installed: [valid], available: [], extra: SENTINEL },
  ];
  for (const value of cases) {
    let delegated = false;
    const result = capture(["plan", "--project-root", PROJECT_ROOT], {
      spawnSync: successfulSpawn(value),
      activationMain: () => { delegated = true; },
    });
    assert.deepEqual(result, { code: 2, stdout: REJECTION, stderr: "", calls: [] });
    assert.equal(delegated, false);
    for (const forbidden of [SOURCE_PLUGIN_ROOT, SENTINEL, "secret", "token"]) {
      assert.equal(result.stdout.includes(forbidden), false);
      assert.equal(result.stderr.includes(forbidden), false);
    }
  }
});

test("malformed and oversized JSON fail with the same sanitized result", () => {
  for (const stdout of ["{malformed", "x".repeat(64 * 1024 + 1), "", 7]) {
    const result = capture(["inspect", "--project-root", PROJECT_ROOT], {
      spawnSync: () => ({ status: 0, signal: null, stdout, stderr: SENTINEL }),
    });
    assert.deepEqual(result, { code: 2, stdout: REJECTION, stderr: "", calls: [] });
    assert.equal(result.stdout.includes(SENTINEL), false);
  }
});

test("spawn failures, errors, signals, and exceptions never expose host details", () => {
  const failures = [
    () => ({ status: 1, signal: null, stdout: "", stderr: `${SOURCE_PLUGIN_ROOT} ${SENTINEL}` }),
    () => ({ status: null, signal: null, error: new Error(`${SOURCE_PLUGIN_ROOT} ${SENTINEL}`), stdout: "" }),
    () => ({ status: 0, signal: "SIGTERM", stdout: JSON.stringify(document()), stderr: SENTINEL }),
    () => { throw new Error(`${SOURCE_PLUGIN_ROOT} ${SENTINEL}`); },
  ];
  for (const spawnSync of failures) {
    const result = capture(["inspect", "--project-root", PROJECT_ROOT], { spawnSync });
    assert.deepEqual(result, { code: 2, stdout: REJECTION, stderr: "", calls: [] });
    assert.equal(result.stdout.includes(SOURCE_PLUGIN_ROOT), false);
    assert.equal(result.stdout.includes(SENTINEL), false);
  }
});

test("delegate exceptions and open dependency injection remain sanitized", () => {
  const thrown = capture(["inspect", "--project-root", PROJECT_ROOT], {
    activationMain: () => { throw new Error(`${SOURCE_PLUGIN_ROOT} ${SENTINEL}`); },
  });
  assert.deepEqual(thrown, { code: 2, stdout: REJECTION, stderr: "", calls: [] });
  const malformed = capture(["inspect", "--project-root", PROJECT_ROOT], {
    activationMain: () => undefined,
  });
  assert.deepEqual(malformed, { code: 2, stdout: REJECTION, stderr: "", calls: [] });

  let stdout = "";
  const code = main(["inspect", "--project-root", PROJECT_ROOT], {
    spawnSync: successfulSpawn(),
    activationMain: () => 0,
    write: (chunk) => { stdout += String(chunk); return true; },
    writeError: () => true,
    unexpected: SENTINEL,
  });
  assert.equal(code, 2);
  assert.equal(stdout, REJECTION);
  assert.equal(stdout.includes(SENTINEL), false);
});

test("wrapper has no filesystem mutation surface and success writes only through the delegated main", () => {
  const source = readFileSync(new URL("./codex-private-overlay-activation.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /from "node:fs"|writeFile|mkdir|rename|unlink|chmod|rmSync/u);
  let hostCalls = 0;
  const result = capture(["plan", "--project-root", PROJECT_ROOT], {
    spawnSync: () => { hostCalls += 1; return successfulSpawn()(); },
    activationMain: () => { hostCalls += 1; return 0; },
  });
  assert.equal(hostCalls, 2);
  assert.deepEqual(result, { code: 0, stdout: "", stderr: "", calls: [] });
});
