// SPDX-License-Identifier: SUL-1.0
// Held patch w131 (C19-Q5, AC-108): the patch exists, applies to the repository HEAD and touches only the named files.
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = join(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w131-q5-a-scratch-script-that-names-the-pipeline-control-plane-is-refused.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/guard/control-plane-script-scan.mjs",
  "plugins/pipeline-core/lib/guard/control-plane-script-scan.test.mjs",
  "plugins/pipeline-core/lib/guard/evaluate.mjs",
  "harness/verify-suites.json",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the four named files", () => {
  const result = spawnSync("git", ["apply", "--numstat", patch], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.deepEqual(touched, [...ALLOWED].sort());
});
