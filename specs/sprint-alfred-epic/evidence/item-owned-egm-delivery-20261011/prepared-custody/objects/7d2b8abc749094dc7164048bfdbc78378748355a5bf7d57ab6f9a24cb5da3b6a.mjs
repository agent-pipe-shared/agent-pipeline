import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { test } from "node:test";

const deliveryRoot = resolve("scratch/alfred-postinstall-whole-items-20261011/literal-bootstrap-item-delivery");
const pluginScript = resolve(deliveryRoot, "source/scripts/pipeline-start-preflight.mjs");
const consumerRoot = resolve(deliveryRoot, "consumer");

function runPreflight(args) {
  const result = spawnSync(process.execPath, [pluginScript, ...args], {
    cwd: consumerRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    timeout: 30_000,
  });
  assert.equal(result.error, undefined, result.error ? `${result.error.code}: ${result.error.message}` : "");
  assert.notEqual(result.status, null, `preflight should return an exit status; signal=${result.signal}; stderr=${result.stderr?.slice(-1000)}`);
  return `${result.stdout}\n${result.stderr}`;
}

function hasHousekeepingReceipts(output) {
  return {
    scratch: output.includes('"schema":"pipeline.bootstrap-scratch-lifecycle.v1"'),
    worktrees: output.includes('"schema":"pipeline.bootstrap-worktree-sweep.v1"'),
  };
}

test("routed Goldfish and Critic preflights skip housekeeping; default/root routes retain both sweeps", () => {
  for (const role of ["goldfish", "critic"]) {
    assert.deepEqual(hasHousekeepingReceipts(runPreflight(["--role", role])), {
      scratch: false,
      worktrees: false,
    }, `${role} must not run bootstrap cleanup`);
  }

  for (const args of [["--role", "elephant"], [], ["--role", "unknown"]]) {
    assert.deepEqual(hasHousekeepingReceipts(runPreflight(args)), {
      scratch: true,
      worktrees: true,
    }, `conservative/root route ${JSON.stringify(args)} must retain both sweeps`);
  }
});
