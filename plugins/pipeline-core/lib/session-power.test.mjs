#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";

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

console.log(`\nsession-power core: ${passed}/${passed + failures.length} checks passed.`);
if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
}
