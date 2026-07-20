#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createStartingSessionPowerRecord,
  createUnavailableSessionPowerRecord,
  resolveSessionPowerContext,
  writeSessionPowerRecord,
} from "../lib/session-power.mjs";
import { startSessionDescriptor } from "../lib/worktree-lifecycle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLEANUP = join(HERE, "session-cleanup.mjs");
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

function git(root, args) { execFileSync("git", args, { cwd: root, stdio: "pipe" }); }
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "session-cleanup-power-"));
  git(root, ["init"]);
  git(root, ["config", "user.email", "test@example.invalid"]);
  git(root, ["config", "user.name", "Session Cleanup Power Test"]);
  writeFileSync(join(root, "README.md"), "fixture\n");
  git(root, ["add", "README.md"]);
  git(root, ["commit", "-m", "fixture"]);
  const session = startSessionDescriptor(root, { sessionId: "session-hawkeye-01" });
  return { root, session, context: resolveSessionPowerContext(root, session.sessionId, session.descriptorSha256) };
}
function cleanup(root, session) {
  try {
    return { status: 0, stdout: execFileSync(process.execPath, [CLEANUP, "cleanup", "--repo", root, "--session-descriptor", session.sessionId, "--expected-descriptor-sha256", session.descriptorSha256], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), stderr: "" };
  } catch (error) {
    return { status: error.status ?? 1, stdout: String(error.stdout ?? ""), stderr: String(error.stderr ?? "") };
  }
}
function tuple(startedAt) {
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
    startedAt,
  };
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try { fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

check("descriptor-bound cleanup accepts unavailable power as nonblocking and retires the session", () => {
  const { root, session, context } = fixture();
  try {
    writeSessionPowerRecord(context, createUnavailableSessionPowerRecord({ repoFingerprint: context.repoFingerprint, sessionId: session.sessionId, descriptorSha256: session.descriptorSha256 }, "tool-missing", { observed: { platform: "linux" } }));
    const result = cleanup(root, session);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).status, "complete");
    assert.equal(existsSync(session.path), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

check("cleanup-pending power blocks cleanup before descriptor retirement", () => {
  const { root, session, context } = fixture();
  try {
    const startedAt = new Date();
    writeSessionPowerRecord(context, createStartingSessionPowerRecord({ repoFingerprint: context.repoFingerprint, sessionId: session.sessionId, descriptorSha256: session.descriptorSha256 }, tuple(startedAt.toISOString()), startedAt));
    const result = cleanup(root, session);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /WT-SESSION-POWER/u);
    assert.equal(existsSync(session.path), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

console.log(`\nsession cleanup power: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
