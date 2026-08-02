// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../..", import.meta.url));
const lockdown = fileURLToPath(new URL("./network-lockdown.mjs", import.meta.url));
const evaluator = fileURLToPath(new URL("../../plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs", import.meta.url));

function run(args) {
  return spawnSync(process.execPath, args, { cwd: root, encoding: "utf8" });
}

function check(name, fn) {
  fn();
  console.log(`PASS ${name}`);
}

check("lockdown rejects outbound fetch", () => {
  const result = run(["--import", lockdown, "-e", "fetch('https://example.invalid')"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NETWORK-LOCKDOWN: outbound network access via globalThis\.fetch/u);
});

check("lockdown rejects outbound HTTPS", () => {
  const result = run(["--import", lockdown, "-e", "require('node:https').get('https://example.invalid')"]);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /NETWORK-LOCKDOWN: outbound network access via node:https\.get/u);
});

check("offline security-evidence conformance passes with and without lockdown", () => {
  execFileSync(process.execPath, ["--test", evaluator], { cwd: root, stdio: "pipe" });
  execFileSync(process.execPath, ["--import", "./harness/scripts/network-lockdown.mjs", "--test", "plugins/pipeline-core/lib/security-evidence-evaluator.test.mjs"], { cwd: root, stdio: "pipe" });
});
