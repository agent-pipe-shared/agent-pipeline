// SPDX-License-Identifier: SUL-1.0
// Held patch w137: the patch exists, applies to the repository root, and touches only the two briefed files.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w137-d2b-a-caller-authored-critic-verdict-satisfies-the-close-gate-only-at-rigor-0-and-low-risk.patch");
const ALLOWED = [
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator-audit-lifecycle.test.mjs",
];

test("w137 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("w137 patch applies to the repository root", () => {
  const r = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("w137 patch touches only the briefed files", () => {
  const r = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = r.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.deepEqual(files, [...ALLOWED].sort());
});
