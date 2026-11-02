// SPDX-License-Identifier: SUL-1.0
// Held-patch check for w79: the patch exists, applies to the repository root and touches only the four named files.
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = resolve(import.meta.dirname, "..", "..", "..", "..");
const patch = join(import.meta.dirname, "w79-c18-4-close-drive-names-every-po-action.patch");
const ALLOWED = new Set([
  "plugins/pipeline-core/scripts/close-coordinator.mjs",
  "plugins/pipeline-core/scripts/close-coordinator.test.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.mjs",
  "plugins/pipeline-core/lib/close-chain-guide.test.mjs",
]);

test("the w79 patch exists and is non-empty", () => {
  assert.equal(existsSync(patch), true);
  assert.ok(statSync(patch).size > 0);
});

test("the w79 patch applies to the repository root", () => {
  const r = spawnSync("git", ["apply", "--check", patch], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("the w79 patch touches only the four named files", () => {
  const r = spawnSync("git", ["apply", "--numstat", patch], { cwd: root, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const files = r.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(files.length > 0);
  for (const file of files) assert.ok(ALLOWED.has(file), `unexpected file ${file}`);
});
