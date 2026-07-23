#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Duplex } from "node:stream";
import { fileURLToPath } from "node:url";

import { SESSION_POWER_LEASE_SECONDS } from "../lib/session-power.mjs";
import { parse as parseHelper } from "./session-power-helper.mjs";
import { runController, validateControllerConfig } from "./session-power-controller.mjs";

const HERE = fileURLToPath(new URL(".", import.meta.url));
const HELPER = join(HERE, "session-power-helper.mjs");
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);

class PrivatePipe extends Duplex {
  constructor() { super(); this.output = ""; }
  _read() {}
  _write(chunk, _encoding, callback) { this.output += chunk.toString("utf8"); callback(); }
  receive(value) { this.push(`${JSON.stringify(value)}\n`); }
  frames() { return this.output.trim().split("\n").filter(Boolean).map((line) => JSON.parse(line)); }
}

function config(root) {
  const controlPath = join(root, "controller.sock");
  return {
    schema: "pipeline.session-power-controller-config.v1",
    activationNonce: A,
    controller: { pid: process.pid, start: "linux:boot-a:101", executableSha256: B },
    context: {
      repoFingerprint: C,
      sessionId: "session-hawkeye-01",
      descriptorSha256: D,
      directory: root,
      recordPath: join(root, "record.json"),
      lockPath: join(root, "record.json.lock"),
      controlPath,
    },
    nodePath: process.execPath,
    helperPath: HELPER,
    controlPath,
    leaseSeconds: SESSION_POWER_LEASE_SECONDS,
  };
}

function identityForPid(pid) {
  return pid === 4242
    ? { platform: "linux", hostBootId: "linux:boot-b", start: "linux:boot-b:202", executableSha256: C }
    : { platform: "linux", hostBootId: "linux:boot-a", start: "linux:boot-a:101", executableSha256: B };
}

let passed = 0;
const failures = [];
async function check(name, fn) {
  try { await fn(); passed += 1; console.log(`PASS ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.error(`FAIL ${name} -- ${error.message}`); }
}

await check("controller configuration is closed and fixed to the 12-hour lease", () => {
  const root = mkdtempSync(join(tmpdir(), "session-power-controller-"));
  try {
    const value = config(root);
    assert.deepEqual(validateControllerConfig(value), value);
    value.leaseSeconds = 12;
    assert.throws(() => validateControllerConfig(value), /configuration is invalid/u);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

const controllerContract = process.platform === "linux"
  ? "controller sends startup ACK, accepts only an exact commit tuple, and uses fixed argv"
  : "controller reports the Linux-only host-power capability as unavailable";

await check(controllerContract, async () => {
  const root = mkdtempSync(join(tmpdir(), "session-power-controller-"));
  const pipe = new PrivatePipe();
  const child = new EventEmitter();
  child.pid = 4242;
  child.kill = () => true;
  let spawned = null;
  try {
    if (process.platform !== "linux") {
      await assert.rejects(runController(config(root), pipe, { identityForPid, spawnChild() { throw new Error("must not spawn a Linux controller"); } }), /platform is unavailable/u);
      return;
    }
    const running = runController(config(root), pipe, {
      identityForPid,
      spawnChild(command, args, options) { spawned = { command, args, options }; return child; },
      now: () => new Date("2026-07-19T12:00:00.000Z"),
    });
    while (pipe.frames().length === 0) await new Promise((resolve) => setTimeout(resolve, 1));
    const ack = pipe.frames()[0];
    assert.equal(ack.type, "startup-ack");
    assert.equal(ack.activationNonce, A);
    assert.equal(ack.childPid, 4242);
    assert.equal(spawned.command, "/usr/bin/systemd-inhibit");
    assert.equal(spawned.options.shell, false);
    assert.deepEqual(spawned.args.slice(0, 4), ["--what=idle:sleep", "--mode=block", "--who=agent-pipeline", "--why=active-pipeline-session"]);
    assert.equal(spawned.args.at(-1), "43200");
    pipe.receive({ type: "commit", activationNonce: ack.activationNonce, controllerPid: ack.controllerPid, controllerStart: ack.controllerStart, controllerExecutableSha256: ack.controllerExecutableSha256, childPid: ack.childPid, childStart: ack.childStart, childExecutableSha256: ack.childExecutableSha256, handleId: ack.handleId });
    const live = await running;
    assert.equal(pipe.frames()[1].type, "committed-ack");
    await live.shutdown();
  } finally { rmSync(root, { recursive: true, force: true }); }
});

await check("helper accepts only fixed identity/lease argv", () => {
  assert.deepEqual(parseHelper(["--controller-pid", "41", "--controller-start", "linux:boot:1", "--lease-seconds", "43200"]), { pid: 41, start: "linux:boot:1" });
  assert.throws(() => parseHelper(["--controller-pid", "41", "--controller-start", "linux:boot:1", "--lease-seconds", "10"]), /invalid/u);
});

console.log(`\nsession-power controller: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
