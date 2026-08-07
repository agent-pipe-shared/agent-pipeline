// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("./local-supervisor-setup.mjs", import.meta.url));
const run = (args, env = {}) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8", env: { ...process.env, ...env } });
const D = "a".repeat(64), C = "b".repeat(64);
const malformed = run(["bad", C, "d1"]); assert.equal(malformed.status, 2); assert.equal(JSON.parse(malformed.stdout).code, "LSS-INPUT"); console.log("ok malformed input");
const unavailable = run([D, C, "d1"], { XDG_STATE_HOME: "" }); assert.equal(unavailable.status, 2); assert.equal(JSON.parse(unavailable.stdout).code, "LSS-UNAVAILABLE"); console.log("ok no root");
// `/tmp` is intentionally untrusted (sticky and world-writable). A Verify
// candidate can itself live below `/tmp`, so mint this disposable fixture under
// the current user's trusted home and remove it after the assertion.
const stateHome = mkdtempSync(join(homedir(), ".local-supervisor-cli-"));
try {
  const stateRoot = join(stateHome, "agent-pipeline", "v1", D);
  const preview = run([D, C, "pipeline-start"], { XDG_STATE_HOME: stateHome }); assert.equal(preview.status, 0); assert.equal(JSON.parse(preview.stdout).disposition, "create"); assert.equal(existsSync(stateRoot), false);
  const applied = run(["--apply", D, C, "pipeline-start"], { XDG_STATE_HOME: stateHome }); assert.equal(applied.status, 0); assert.equal(JSON.parse(applied.stdout).disposition, "create"); assert.equal(existsSync(join(stateRoot, "state.json")), true);
  const repeated = run([D, C, "pipeline-start"], { XDG_STATE_HOME: stateHome }); assert.equal(repeated.status, 0); assert.equal(JSON.parse(repeated.stdout).disposition, "noop"); console.log("ok preview then explicit apply");
} finally { rmSync(stateHome, { recursive: true, force: true }); }
