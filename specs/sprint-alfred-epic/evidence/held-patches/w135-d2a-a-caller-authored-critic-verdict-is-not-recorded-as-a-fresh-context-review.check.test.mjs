// SPDX-License-Identifier: SUL-1.0
// Held patch w135: the patch exists, applies to the repository root, and touches only the three briefed files.
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = join(import.meta.dirname, "w135-d2a-a-caller-authored-critic-verdict-is-not-recorded-as-a-fresh-context-review.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/session-critic-finalizer-read.mjs",
  "plugins/pipeline-core/scripts/session-critic-finalizer.mjs",
  "plugins/pipeline-core/scripts/session-critic-finalizer.test.mjs",
];

test("w135 patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("w135 patch applies to the repository root", () => {
  const r = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("w135 patch touches only the briefed files", () => {
  const r = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = r.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]).sort();
  assert.deepEqual(files, [...ALLOWED].sort());
});
