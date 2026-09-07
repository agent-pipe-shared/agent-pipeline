#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { checkCodexAppServer, CODEX_APP_SERVER_HEALTH_SCHEMA, observeCodexAppServer, run } from "./codex-app-server-health.mjs";

const daemon = {
  status: "running", backend: "pid", managedCodexPath: "/opt/codex", managedCodexVersion: "0.144.6",
  socketPath: "/tmp/codex.sock", cliVersion: "0.144.6", appServerVersion: "0.144.6",
};
const response = (status, stdout = "", stderr = "", error = undefined) => ({ status, stdout, stderr, error });
const health = () => response(0, JSON.stringify(daemon));

let passed = 0;
function check(name, fn) { fn(); passed += 1; process.stdout.write(`PASS CAS${String(passed).padStart(2, "0")} ${name}\n`); }

check("a closed running daemon observation is ready", () => {
  const result = observeCodexAppServer({ spawn: () => health() });
  assert.equal(result.schema, CODEX_APP_SERVER_HEALTH_SCHEMA);
  assert.equal(result.code, "CAS-READY");
  assert.equal(result.status, "ready");
  assert.deepEqual(result.daemon, daemon);
});

check("missing Codex is a typed unavailable result and never restarts", () => {
  const missing = Object.assign(new Error("not found"), { code: "ENOENT" });
  const result = checkCodexAppServer({ recover: true, spawn: () => response(null, "", "", missing) });
  assert.equal(result.code, "CAS-CODEX-UNAVAILABLE");
  assert.equal(result.recovery, "not-attempted");
});

check("unreachable daemon performs one fixed restart and requires a new healthy observation", () => {
  const calls = [];
  const results = [response(1, "", "socket stale"), response(0), health()];
  const result = checkCodexAppServer({ recover: true, spawn: (_bin, args) => { calls.push(args); return results.shift(); } });
  assert.equal(result.code, "CAS-READY");
  assert.equal(result.recovery, "restarted");
  assert.deepEqual(calls, [["app-server", "daemon", "version"], ["app-server", "daemon", "restart"], ["app-server", "daemon", "version"]]);
});

check("failed recovery does not loop and names the recovery failure", () => {
  const calls = [];
  const result = checkCodexAppServer({ recover: true, spawn: (_bin, args) => { calls.push(args); return calls.length === 1 ? response(1, "", "socket stale") : response(1, "", "restart failed"); } });
  assert.equal(result.code, "CAS-DAEMON-RECOVERY-FAILED");
  assert.equal(result.recovery, "failed");
  assert.equal(calls.length, 2);
});

check("invalid or version-drift output is stale and never accepted as a worker claim", () => {
  const invalid = observeCodexAppServer({ spawn: () => response(0, "not json") });
  assert.equal(invalid.code, "CAS-DAEMON-INVALID-OBSERVATION");
  const drift = observeCodexAppServer({ spawn: () => response(0, JSON.stringify({ ...daemon, appServerVersion: "0.144.5" })) });
  assert.equal(drift.code, "CAS-DAEMON-VERSION-DRIFT");
});

check("Critic readiness requires a successful bounded model-start probe", () => {
  const calls = [];
  const ready = observeCodexAppServer({
    requireModelReady: true,
    criticModel: "gpt-6-astra",
    spawn: (_bin, args) => {
      calls.push(args);
      return args[0] === "app-server"
      ? health()
      : response(0, JSON.stringify({ schema: "pipeline.codex-app-server-model-probe.v1", status: "ready", code: "CAS-MODEL-READY", detail: null }));
    },
  });
  assert.equal(ready.code, "CAS-READY");
  assert.equal(calls[1].at(-1), "gpt-6-astra");
  const unavailable = observeCodexAppServer({
    requireModelReady: true,
    criticModel: "gpt-6-astra",
    spawn: (_bin, args) => args[0] === "app-server" ? health() : response(2, ""),
  });
  assert.equal(unavailable.status, "stale");
  assert.equal(unavailable.code, "CAS-MODEL-UNAVAILABLE");
});

check("critic-ready resolves the V3-bound candidate model and never probes an unavailable route", () => {
  let output = "";
  const calls = [];
  const exit = run(["--critic-ready", "--root", "/project", "--candidate-commit", "a".repeat(40)], {
    resolveCriticRoute(input) {
      assert.deepEqual(input, { rootDir: resolve("/project"), candidateCommit: "a".repeat(40) });
      return { model: "gpt-6-astra" };
    },
    spawn: (_bin, args) => { calls.push(args); return args[0] === "app-server" ? health() : response(0, JSON.stringify({ schema: "pipeline.codex-app-server-model-probe.v1", status: "ready", code: "CAS-MODEL-READY", detail: null })); },
    write: (value) => { output += value; }, writeError() {},
  });
  assert.equal(exit, 0);
  assert.equal(calls[1].at(-1), "gpt-6-astra");
  output = ""; calls.length = 0;
  const unavailable = run(["--critic-ready"], {
    resolveCriticRoute() { throw new Error("unavailable"); }, spawn: () => { calls.push(true); return health(); },
    write: (value) => { output += value; }, writeError() {},
  });
  assert.equal(unavailable, 2);
  assert.equal(JSON.parse(output).code, "CAS-MODEL-ROUTE-UNAVAILABLE");
  assert.equal(calls.length, 0);
});

check("model probe rejects missing model, relative executable, and returned-model mismatch", () => {
  const probe = join(import.meta.dirname, "codex-app-server-model-probe.mjs");
  const root = mkdtempSync(join(tmpdir(), "codex-model-probe-"));
  try {
    writeFileSync(join(root, "app-server"), `
const { writeFileSync } = require("node:fs");
const events = [];
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += String(chunk);
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    events.push({ id: message.id ?? null, method: message.method ?? null, params: message.params ?? null });
    if (message.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + "\\n");
    if (message.id === 2) process.stdout.write(JSON.stringify({ id: 2, result: { model: process.env.FAKE_MODEL ?? message.params.model, modelProvider: "openai", thread: { id: "fixture-thread" } } }) + "\\n");
  }
});
process.stdin.on("end", () => {
  writeFileSync("protocol.json", JSON.stringify({ events, stdinEnded: true }));
  process.exit(0);
});
`);
    const missing = spawnSync(process.execPath, [probe, process.execPath], { cwd: root, encoding: "utf8", timeout: 2_000 });
    assert.equal(missing.status, 2);
    assert.equal(JSON.parse(missing.stdout).code, "CAS-MODEL-PROBE-INPUT");
    const relative = spawnSync(process.execPath, [probe, "codex", "gpt-6-astra"], { cwd: root, encoding: "utf8", timeout: 2_000 });
    assert.equal(relative.status, 2);
    assert.equal(JSON.parse(relative.stdout).code, "CAS-MODEL-PROBE-INPUT");
    const mismatch = spawnSync(process.execPath, [probe, process.execPath, "gpt-6-astra"], { cwd: root, encoding: "utf8", timeout: 2_000, env: { ...process.env, FAKE_MODEL: "wrong-model" } });
    assert.equal(mismatch.status, 2);
    assert.equal(JSON.parse(mismatch.stdout).code, "CAS-MODEL-PROBE-UNAVAILABLE");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("model probe starts the configured non-Sol read-only thread, never turns it, and closes its bounded protocol", () => {
  const probe = join(import.meta.dirname, "codex-app-server-model-probe.mjs");
  const root = mkdtempSync(join(tmpdir(), "codex-model-probe-"));
  try {
    writeFileSync(join(root, "app-server"), `
const { writeFileSync } = require("node:fs");
const events = [];
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += String(chunk);
  let newline;
  while ((newline = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, newline);
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    const message = JSON.parse(line);
    events.push({ id: message.id ?? null, method: message.method ?? null, params: message.params ?? null });
    if (message.id === 1) process.stdout.write(JSON.stringify({ id: 1, result: {} }) + "\\n");
    if (message.id === 2) process.stdout.write(JSON.stringify({ id: 2, result: { model: message.params.model, modelProvider: "openai", thread: { id: "fixture-thread" } } }) + "\\n");
  }
});
process.stdin.on("end", () => {
  writeFileSync("protocol.json", JSON.stringify({ events, stdinEnded: true }));
  process.exit(0);
});
`);
    const result = spawnSync(process.execPath, [probe, process.execPath, "gpt-6-astra"], { cwd: root, encoding: "utf8", timeout: 2_000 });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).code, "CAS-MODEL-READY");
    const transcript = JSON.parse(readFileSync(join(root, "protocol.json"), "utf8"));
    const start = transcript.events.find((event) => event.id === 2);
    assert.deepEqual(start.params, {
      cwd: tmpdir(), model: "gpt-6-astra", allowProviderModelFallback: false,
      ephemeral: true, approvalPolicy: "never", sandbox: "read-only",
      developerInstructions: "Model readiness probe only. Do not start a turn or access repository content.",
    });
    assert.equal(transcript.events.some((event) => event.method === "turn/start"), false);
    assert.equal(transcript.stdinEnded, true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("win32 detects platform before spawning restart and returns a distinct typed result", () => {
  const calls = [];
  const result = checkCodexAppServer({
    recover: true,
    platform: "win32",
    spawn: (_bin, args) => { calls.push(args); return response(1, "", "socket stale"); },
  });
  assert.equal(result.status, "unsupported");
  assert.equal(result.code, "CAS-PLATFORM-UNSUPPORTED");
  assert.equal(result.recovery, "not-applicable");
  assert.match(result.operatorAction, /WSL/);
  assert.match(result.detail, /win32/);
  assert.deepEqual(calls, [["app-server", "daemon", "version"]]);
});

check("non-Windows platforms still attempt the real restart call unchanged", () => {
  const calls = [];
  const results = [response(1, "", "socket stale"), response(0), health()];
  const result = checkCodexAppServer({
    recover: true,
    platform: "linux",
    spawn: (_bin, args) => { calls.push(args); return results.shift(); },
  });
  assert.equal(result.code, "CAS-READY");
  assert.equal(result.recovery, "restarted");
  assert.deepEqual(calls, [["app-server", "daemon", "version"], ["app-server", "daemon", "restart"], ["app-server", "daemon", "version"]]);

  const darwinCalls = [];
  const darwinResult = checkCodexAppServer({
    recover: true,
    platform: "darwin",
    spawn: (_bin, args) => { darwinCalls.push(args); return darwinCalls.length === 1 ? response(1, "", "socket stale") : response(1, "", "restart failed"); },
  });
  assert.equal(darwinResult.code, "CAS-DAEMON-RECOVERY-FAILED");
  assert.equal(darwinResult.recovery, "failed");
  assert.deepEqual(darwinCalls, [["app-server", "daemon", "version"], ["app-server", "daemon", "restart"]]);
});

process.stdout.write(`${passed}/11 checks passed.\n`);
