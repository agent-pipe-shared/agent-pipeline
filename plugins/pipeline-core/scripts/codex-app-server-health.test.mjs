#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0

import assert from "node:assert/strict";
import { checkCodexAppServer, CODEX_APP_SERVER_HEALTH_SCHEMA, observeCodexAppServer } from "./codex-app-server-health.mjs";

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

process.stdout.write(`${passed}/5 checks passed.\n`);
