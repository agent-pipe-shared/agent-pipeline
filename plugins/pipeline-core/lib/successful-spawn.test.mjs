// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import test from "node:test";

import { hasExpectedSpawnStatus, isSuccessfulSpawn } from "./successful-spawn.mjs";

test("a completed WSL sandbox child remains successful when Node also reports EPERM", () => {
  const error = Object.assign(new Error("spawnSync git EPERM"), { code: "EPERM" });
  assert.equal(isSuccessfulSpawn({ status: 0, error, stdout: "ready\n" }), true);
});

test("successful-spawn stays fail-closed for every other error and status shape", () => {
  assert.equal(isSuccessfulSpawn({ status: 0, error: Object.assign(new Error("denied"), { code: "EACCES" }) }), false);
  assert.equal(isSuccessfulSpawn({ status: 1, error: Object.assign(new Error("EPERM"), { code: "EPERM" }) }), false);
  assert.equal(isSuccessfulSpawn({ status: null, error: Object.assign(new Error("EPERM"), { code: "EPERM" }) }), false);
  assert.equal(isSuccessfulSpawn({ status: 0, error: new Error("unknown") }), false);
});

test("a caller must explicitly enumerate a documented non-zero typed completion status", () => {
  const error = Object.assign(new Error("spawnSync session-power EPERM"), { code: "EPERM" });
  assert.equal(hasExpectedSpawnStatus({ status: 3, error }, [0, 3]), true);
  assert.equal(hasExpectedSpawnStatus({ status: 3, error }, [0]), false);
  assert.equal(hasExpectedSpawnStatus({ status: 3, error: Object.assign(new Error("denied"), { code: "EACCES" }) }, [0, 3]), false);
  assert.equal(hasExpectedSpawnStatus({ status: 5, error }, [0, 5]), true);
  assert.equal(hasExpectedSpawnStatus({ status: 5, error: Object.assign(new Error("denied"), { code: "EACCES" }) }, [0, 5]), false);
});
