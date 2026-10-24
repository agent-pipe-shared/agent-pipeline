#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  SESSION_POWER_LEASE_SECONDS,
  activateSessionPowerRecord,
  createDisabledSessionPowerRecord,
  createStartingSessionPowerRecord,
  createUnavailableSessionPowerRecord,
  fixedAdapterLaunch,
  heartbeatSessionPowerRecord,
  recoverSessionPowerRecord,
  stopSessionPowerRecord,
  validateSessionPowerRecord,
} from "./session-power.mjs";

const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const D = "d".repeat(64);
const NOW = new Date("2026-07-19T12:00:00.000Z");
const CONTEXT = { repoFingerprint: A, sessionId: "session-hawkeye-01", descriptorSha256: B };

function tuple() {
  return {
    activationNonce: C,
    adapterId: "linux-systemd-inhibit-v1",
    platform: "linux",
    hostBootId: "linux:123e4567-e89b-12d3-a456-426614174000",
    controllerPid: 41,
    controllerStart: "linux:123e4567-e89b-12d3-a456-426614174000:101",
    controllerExecutableSha256: D,
    childPid: 42,
    childStart: "linux:123e4567-e89b-12d3-a456-426614174000:102",
    childExecutableSha256: A,
    handleId: "handle:session-power:0001",
    startedAt: NOW.toISOString(),
  };
}

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

check("disabled and unavailable records are closed honest no-process states", () => {
  const disabled = createDisabledSessionPowerRecord(CONTEXT, NOW);
  assert.deepEqual(validateSessionPowerRecord(disabled), { ok: true, code: null });
  const unavailable = createUnavailableSessionPowerRecord(CONTEXT, "tool-missing", { observed: { platform: "linux", adapterId: "linux-systemd-inhibit-v1" }, now: NOW });
  assert.deepEqual(validateSessionPowerRecord(unavailable), { ok: true, code: null });
  unavailable.childPid = 7;
  assert.equal(validateSessionPowerRecord(unavailable).ok, false);
});

check("starting needs one complete fixed 12-hour tuple and active adds heartbeat", () => {
  const starting = createStartingSessionPowerRecord(CONTEXT, tuple(), NOW);
  assert.equal(starting.leaseExpiresAt, new Date(NOW.getTime() + SESSION_POWER_LEASE_SECONDS * 1000).toISOString());
  assert.deepEqual(validateSessionPowerRecord(starting), { ok: true, code: null });
  const active = activateSessionPowerRecord(starting, { expectedRevision: 0, now: new Date("2026-07-19T12:00:01.000Z") });
  assert.equal(active.status, "active");
  assert.equal(active.revision, 1);
  assert.deepEqual(validateSessionPowerRecord(active, { now: new Date("2026-07-19T12:00:10.000Z"), requireFresh: true }), { ok: true, code: null });
});

check("heartbeat CAS changes only its three legal bytes and never renews the lease", () => {
  const active = activateSessionPowerRecord(createStartingSessionPowerRecord(CONTEXT, tuple(), NOW), { expectedRevision: 0, now: NOW });
  const next = heartbeatSessionPowerRecord(active, { expectedRevision: 1, now: new Date("2026-07-19T12:00:30.000Z") });
  const changed = Object.keys(next).filter((key) => JSON.stringify(next[key]) !== JSON.stringify(active[key]));
  assert.deepEqual(changed.sort(), ["heartbeatAt", "observedAt", "revision"]);
  assert.equal(next.leaseExpiresAt, active.leaseExpiresAt);
  assert.throws(() => heartbeatSessionPowerRecord(active, { expectedRevision: 0, now: NOW }), /current active/u);
});

check("recovery proves the exact endpoint tuple before promotion and never signals a PID", () => {
  const starting = createStartingSessionPowerRecord(CONTEXT, tuple(), NOW);
  const noProof = recoverSessionPowerRecord(starting, { now: new Date("2026-07-19T12:01:00.000Z") });
  assert.equal(noProof.status, "cleanup-pending");
  assert.equal(noProof.failureClass, "identity-mismatch");
  const proof = {
    activationNonce: starting.activationNonce,
    controllerPid: starting.controllerPid,
    controllerStart: starting.controllerStart,
    controllerExecutableSha256: starting.controllerExecutableSha256,
    childPid: starting.childPid,
    childStart: starting.childStart,
    childExecutableSha256: starting.childExecutableSha256,
    handleId: starting.handleId,
  };
  const recovered = recoverSessionPowerRecord(starting, { now: new Date("2026-07-19T12:01:00.000Z"), endpointProof: proof });
  assert.equal(recovered.status, "active");
  assert.equal(recovered.revision, 1);
});

check("stop accepts only endpoint proof and a false proof blocks Close as cleanup-pending", () => {
  const active = activateSessionPowerRecord(createStartingSessionPowerRecord(CONTEXT, tuple(), NOW), { expectedRevision: 0, now: NOW });
  const blocked = stopSessionPowerRecord(active, { now: new Date("2026-07-19T12:02:00.000Z") });
  assert.equal(blocked.status, "cleanup-pending");
  assert.equal(blocked.failureClass, "stop-timeout");
  const proof = Object.fromEntries(["activationNonce", "controllerPid", "controllerStart", "controllerExecutableSha256", "childPid", "childStart", "childExecutableSha256", "handleId"].map((key) => [key, active[key]]));
  const stopped = stopSessionPowerRecord(active, { now: new Date("2026-07-19T12:02:00.000Z"), endpointProof: proof });
  assert.equal(stopped.status, "stopped");
  assert.equal(stopped.heartbeatAt, null);
});

check("fixed Linux adapter argv is allowlisted, absolute, shell false and has no nonce", () => {
  const launch = fixedAdapterLaunch({
    platform: "linux",
    nodePath: "/usr/bin/node",
    helperPath: "/repo/plugins/pipeline-core/scripts/session-power-helper.mjs",
    controllerPid: 41,
    controllerStart: tuple().controllerStart,
  });
  assert.equal(launch.command, "/usr/bin/systemd-inhibit");
  assert.equal(launch.shell, false);
  assert.deepEqual(launch.args, [
    "--what=idle:sleep", "--mode=block", "--who=agent-pipeline", "--why=active-pipeline-session",
    "/usr/bin/node", "/repo/plugins/pipeline-core/scripts/session-power-helper.mjs",
    "--controller-pid", "41", "--controller-start", tuple().controllerStart, "--lease-seconds", "43200",
  ]);
  assert.equal(launch.args.some((value) => value === C), false);
});

// K148-FV-ADDRESS-RACE: two processes on ONE home prepare the fixed Linux address namespace
// (`<home>/.apsp`) for two DIFFERENT repositories. The barrier is a ready/go file pair under the
// private root, not a sleep: the child that is held pauses at an exact point inside
// `prepareAddressRoot` (reached through createSessionPowerAuthorityProducerPort), the other child
// runs to completion meanwhile, then the held one is released. `os.userInfo().homedir` and the
// listing/mkdir calls are patched only inside the children (the private home replaces the real one).
async function addressRaceChild() {
  const fs = (await import("node:fs")).default;
  const os = (await import("node:os")).default;
  const path = (await import("node:path")).default;
  const { syncBuiltinESMExports } = (await import("node:module")).default;
  const [home, repoRoot, libUrl, ownerUrl, holdAt, readyFile, goFile] = process.argv.slice(1);
  const barrier = () => {
    fs.writeFileSync(readyFile, "");
    const cell = new Int32Array(new SharedArrayBuffer(4));
    const deadline = Date.now() + 60000;
    while (!fs.existsSync(goFile)) {
      if (Date.now() > deadline) throw new Error("barrier go file never appeared");
      Atomics.wait(cell, 0, 0, 10);
    }
  };
  const apsp = path.join(home, ".apsp");
  const realUserInfo = os.userInfo;
  os.userInfo = (...args) => ({ ...realUserInfo(...args), homedir: home });
  const realReaddir = fs.readdirSync;
  let listings = 0;
  fs.readdirSync = function (target, ...rest) {
    const out = realReaddir.call(this, target, ...rest);
    if (holdAt === "after-first-listing" && target === apsp) { listings += 1; if (listings === 1) barrier(); }
    return out;
  };
  const realMkdir = fs.mkdirSync;
  fs.mkdirSync = function (target, ...rest) {
    const out = realMkdir.call(this, target, ...rest);
    if (holdAt === "after-slot-mkdir" && path.dirname(String(target)) === apsp && /^[a-f0-9]{16}$/.test(path.basename(String(target)))) barrier();
    return out;
  };
  syncBuiltinESMExports();
  const { createSessionPowerAuthorityProducerPort } = await import(libUrl);
  const { authorityRepositoryFromRoot } = await import(ownerUrl);
  let result;
  try {
    createSessionPowerAuthorityProducerPort({ repository: authorityRepositoryFromRoot(repoRoot) });
    result = { ok: true };
  } catch (error) {
    result = { ok: false, code: error?.code ?? null, message: String(error?.message ?? error) };
  }
  process.stdout.write("RESULT " + JSON.stringify(result) + "\n", () => process.exit(0));
}

async function checkAsync(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`FAIL ${name} -- ${error.message}`);
  }
}

function addressRaceSetup() {
  // Short names on purpose: the fixed address path must stay within the 107-byte Linux socket bound (needs the private short TMPDIR of scripts/run-in.mjs).
  const root = realpathSync(mkdtempSync(join(tmpdir(), "s")));
  mkdirSync(join(root, "h"), { mode: 0o700 });
  const git = (cwd, ...args) => {
    const run = spawnSync("git", args, { cwd, encoding: "utf8" });
    assert.equal(run.status, 0, `git ${args.join(" ")} failed: ${run.stderr}`);
  };
  const repos = ["a", "b"].map((name) => {
    const dir = join(root, name);
    mkdirSync(dir);
    git(dir, "init", "-q");
    git(dir, "-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "init");
    return dir;
  });
  return { root, repos };
}

function addressRaceChildProcess(root, name, repo, holdAt) {
  const ready = join(root, `${name}.ready`);
  const go = join(root, `${name}.go`);
  const child = spawn(process.execPath, [
    "--input-type=module", "-e", `(${addressRaceChild.toString()})()`,
    join(root, "h"), repo,
    new URL("./session-power.mjs", import.meta.url).href,
    new URL("./session-authority-domain-owner.mjs", import.meta.url).href,
    holdAt, ready, go,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let out = "";
  let err = "";
  child.stdout.on("data", (chunk) => { out += chunk; });
  child.stderr.on("data", (chunk) => { err += chunk; });
  const done = new Promise((resolveDone) => child.on("close", (code) => {
    const line = out.split("\n").find((entry) => entry.startsWith("RESULT "));
    resolveDone({ exit: code, result: line ? JSON.parse(line.slice(7)) : null, stderr: err.slice(0, 400) });
  }));
  return { ready, go, done, kill: () => child.kill("SIGKILL"), stderr: () => err.slice(-1500) };
}

async function waitForBarrier(handle) {
  let exited = false;
  handle.done.then(() => { exited = true; });
  const deadline = Date.now() + 60000;
  while (!existsSync(handle.ready) && !exited) {
    if (Date.now() > deadline) throw new Error("barrier ready file never appeared");
    await new Promise((resolveWait) => setTimeout(resolveWait, 10));
  }
  return existsSync(handle.ready);
}

function assertTwoAnchoredSlots(root) {
  const names = readdirSync(join(root, "h", ".apsp")).sort();
  assert.equal(names.length, 2, `expected two slots, saw ${JSON.stringify(names)}`);
  for (const name of names) {
    const anchor = JSON.parse(readFileSync(join(root, "h", ".apsp", name, "anchor.json"), "utf8"));
    assert.equal(anchor.repositoryFingerprint.slice(0, 16), name);
  }
}

await checkAsync("two processes on one home: a slot created between the two namespace listings is accepted", async () => {
  const { root, repos } = addressRaceSetup();
  const handles = [];
  try {
    const a = addressRaceChildProcess(root, "a", repos[0], "after-first-listing");
    handles.push(a);
    if (!(await waitForBarrier(a))) assert.fail(`held process never reached its barrier: ${JSON.stringify(await a.done)}`);
    const b = addressRaceChildProcess(root, "b", repos[1], "none");
    handles.push(b);
    const rb = await b.done;
    writeFileSync(a.go, "");
    const ra = await a.done;
    assert.equal(rb.result?.ok, true, `second process: ${JSON.stringify(rb)}`);
    assert.equal(ra.result?.ok, true, `held process: ${JSON.stringify(ra)}`);
    assertTwoAnchoredSlots(root);
  } finally {
    for (const handle of handles) { writeFileSync(handle.go, ""); handle.kill(); }
    rmSync(root, { recursive: true, force: true });
  }
});

await checkAsync("two processes on one home: a slot another process is still creating is never observable half-made", async () => {
  const { root, repos } = addressRaceSetup();
  const handles = [];
  try {
    const b = addressRaceChildProcess(root, "b", repos[1], "after-slot-mkdir");
    handles.push(b);
    await waitForBarrier(b); // false when the slot is published atomically and the process never pauses mid-creation
    const a = addressRaceChildProcess(root, "a", repos[0], "none");
    handles.push(a);
    const ra = await a.done;
    writeFileSync(b.go, "");
    const rb = await b.done;
    assert.equal(ra.result?.ok, true, `process preparing while the other creates its slot: ${JSON.stringify(ra)}`);
    assert.equal(rb.result?.ok, true, `process creating its slot: ${JSON.stringify(rb)}`);
    assertTwoAnchoredSlots(root);
  } finally {
    for (const handle of handles) { writeFileSync(handle.go, ""); handle.kill(); }
    rmSync(root, { recursive: true, force: true });
  }
});

console.log(`\nsession-power core: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
