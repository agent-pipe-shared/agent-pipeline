#!/usr/bin/env node
// SPDX-License-Identifier: SUL-1.0
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const CASES = [
  ["verify-evidence-producer", "verify-evidence-producer.mjs"],
  ["handover-rotate", "handover-rotate.mjs"],
  ["session-critic-finalizer", "session-critic-finalizer.mjs"],
  ["close-coordinator", "close-coordinator.mjs"],
];
const childEnv = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  return env;
};

for (const [name, filename] of CASES) {
  const script = fileURLToPath(new URL(`./${filename}`, import.meta.url));

  test(`${name} prints bounded help and exits zero`, () => {
    const result = spawnSync(process.execPath, [script, "--help"], { encoding: "utf8", env: childEnv() });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.match(result.stdout, new RegExp(`^Usage: ${name}\\.mjs`, "u"));
    assert.ok(result.stdout.length < 4_096, "help must stay bounded");
  });

  test(`${name} keeps strict grammar when --help is combined with another argument`, () => {
    const result = spawnSync(process.execPath, [script, "--help", "--root", "."], { encoding: "utf8", env: childEnv() });
    assert.notEqual(result.status, 0);
  });
}
