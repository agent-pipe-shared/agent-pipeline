#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";
import {
  activateSessionPowerRecord,
  createStartingSessionPowerRecord,
  resolveSessionPowerPaths,
} from "../lib/session-power.mjs";
import { disableProjectedSessionPower } from "./session-power.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "session-power.mjs");
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const NOW = new Date("2026-07-19T12:00:00.000Z");

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "pipe" });
}

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "session-power-cli-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Session Power Test"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "fixture"]);
  const descriptor = startSessionDescriptor(root, { sessionId: "session-hawkeye-01" });
  return { root, descriptor };
}

function call(root, args) {
  try {
    const stdout = execFileSync(process.execPath, [CLI, ...args], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? "") };
  }
}

function recordTuple() {
  return {
    activationNonce: A,
    adapterId: "linux-systemd-inhibit-v1",
    platform: "linux",
    hostBootId: "linux:123e4567-e89b-12d3-a456-426614174000",
    controllerPid: 41,
    controllerStart: "linux:123e4567-e89b-12d3-a456-426614174000:101",
    controllerExecutableSha256: B,
    childPid: 42,
    childStart: "linux:123e4567-e89b-12d3-a456-426614174000:102",
    childExecutableSha256: C,
    handleId: "handle:session-power:0001",
    startedAt: NOW.toISOString(),
  };
}

function proof(record, type, extra = {}) {
  return {
    type,
    activationNonce: record.activationNonce,
    controllerPid: record.controllerPid,
    controllerStart: record.controllerStart,
    controllerExecutableSha256: record.controllerExecutableSha256,
    childPid: record.childPid,
    childStart: record.childStart,
    childExecutableSha256: record.childExecutableSha256,
    handleId: record.handleId,
    ...extra,
  };
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

await check("exact status CLI is read-only and reports disabled for an absent projection", () => {
  const { root, descriptor } = fixture();
  try {
    const result = call(root, ["status", "--session-id", "session-hawkeye-01", "--expected-descriptor-sha256", descriptor.descriptorSha256]);
    assert.equal(result.status, 0);
    assert.deepEqual(JSON.parse(result.stdout), {
      schema: "pipeline.session-power-command-result.v1",
      operation: "status",
      sessionId: "session-hawkeye-01",
      status: "disabled",
      revision: 0,
      failureClass: null,
      observedAt: JSON.parse(result.stdout).observedAt,
    });
    const paths = resolveSessionPowerPaths(root, "session-hawkeye-01");
    assert.equal(existsSync(paths.recordPath), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check("unconfigured start stays disabled and starts no host-power process", () => {
  const { root, descriptor } = fixture();
  try {
    const result = call(root, ["start", "--session-id", "session-hawkeye-01", "--expected-descriptor-sha256", descriptor.descriptorSha256]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.status, "disabled");
    assert.equal(output.failureClass, null);
    const paths = resolveSessionPowerPaths(root, "session-hawkeye-01");
    assert.equal(existsSync(paths.recordPath), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check("disabled projection stops only the exact active controller record", async () => {
  const context = { repoFingerprint: D, sessionId: "session-hawkeye-01", descriptorSha256: B, controlPath: "/private/session-power.sock" };
  const active = activateSessionPowerRecord(createStartingSessionPowerRecord(context, recordTuple(), NOW), { expectedRevision: 0, now: NOW });
  const requests = [];
  const stopped = await disableProjectedSessionPower(active, context, {
    now: new Date("2026-07-19T12:01:00.000Z"),
    endpointRequest(path, request) {
      requests.push({ path, request });
      return request.type === "proof"
        ? proof(active, "proof", { committed: true })
        : proof(active, "stopped");
    },
  });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.revision, 2);
  assert.deepEqual(requests, [
    { path: context.controlPath, request: { type: "proof", activationNonce: active.activationNonce } },
    { path: context.controlPath, request: proof(active, "stop") },
  ]);
});

await check("disabled projection reconciles a committed starting controller before stopping it", async () => {
  const context = { repoFingerprint: D, sessionId: "session-hawkeye-01", descriptorSha256: B, controlPath: "/private/session-power.sock" };
  const starting = createStartingSessionPowerRecord(context, recordTuple(), NOW);
  const requests = [];
  const stopped = await disableProjectedSessionPower(starting, context, {
    now: new Date("2026-07-19T12:01:00.000Z"),
    endpointRequest(path, request) {
      requests.push({ path, request });
      return request.type === "proof"
        ? proof(starting, "proof", { committed: true })
        : proof(starting, "stopped");
    },
  });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.revision, 2);
  assert.deepEqual(requests.map(({ request }) => request.type), ["proof", "stop"]);
});

await check("disabled projection fails closed on a mismatched stop proof", async () => {
  const context = { repoFingerprint: D, sessionId: "session-hawkeye-01", descriptorSha256: B, controlPath: "/private/session-power.sock" };
  const active = activateSessionPowerRecord(createStartingSessionPowerRecord(context, recordTuple(), NOW), { expectedRevision: 0, now: NOW });
  const pending = await disableProjectedSessionPower(active, context, {
    now: new Date("2026-07-19T12:01:00.000Z"),
    endpointRequest(_path, request) {
      return request.type === "proof"
        ? proof(active, "proof", { committed: true })
        : proof(active, "stopped", { childPid: 99 });
    },
  });
  assert.equal(pending.status, "cleanup-pending");
  assert.equal(pending.failureClass, "stop-timeout");
});

await check("disabled projection fails closed when controller proof is false or missing", async () => {
  const context = { repoFingerprint: D, sessionId: "session-hawkeye-01", descriptorSha256: B, controlPath: "/private/session-power.sock" };
  for (const endpointRequest of [
    () => ({ type: "proof", committed: false }),
    () => { throw new Error("private endpoint unavailable"); },
  ]) {
    const active = activateSessionPowerRecord(createStartingSessionPowerRecord(context, recordTuple(), NOW), { expectedRevision: 0, now: NOW });
    let requests = 0;
    const pending = await disableProjectedSessionPower(active, context, {
      now: new Date("2026-07-19T12:01:00.000Z"),
      endpointRequest(...args) { requests += 1; return endpointRequest(...args); },
    });
    assert.equal(pending.status, "cleanup-pending");
    assert.equal(pending.failureClass, "identity-mismatch");
    assert.equal(requests, 1);
  }
});

await check("parser rejects unknown, duplicate and incomplete option shapes", () => {
  const { root } = fixture();
  try {
    const result = call(root, ["status", "--session-id", "session-hawkeye-01", "--session-id", "again"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /SP-ARGUMENT/u);
    assert.match(result.stderr, /Usage:/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(`\nsession-power CLI: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
