// SPDX-License-Identifier: SUL-1.0
// Checks the held patch w151 (C19-G5A generated close runbook): it exists, applies to the repository root, touches only the four named files.
import assert from "node:assert/strict";
import test from "node:test";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..", "..", "..", "..");
const PATCH = resolve(import.meta.dirname, "w151-g5a-a-machine-readable-close-runbook-is-generated-from-the-close-chain-tables-and-pinned-by-a-drift-test.patch");
const ALLOWED = [
  "plugins/pipeline-core/runbooks/close-path.v1.json",
  "plugins/pipeline-core/runbooks/index.v1.json",
  "plugins/pipeline-core/scripts/generate-runbook.mjs",
  "plugins/pipeline-core/scripts/generate-runbook.test.mjs",
];

test("the patch exists and is non-empty", () => {
  assert.ok(existsSync(PATCH));
  assert.ok(statSync(PATCH).size > 0);
});

test("git apply --check against the repository root exits 0", () => {
  const r = spawnSync("git", ["apply", "--check", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
});

test("the patch touches only the named files", () => {
  const r = spawnSync("git", ["apply", "--numstat", PATCH], { cwd: ROOT, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const touched = r.stdout.split("\n").filter(Boolean).map((l) => l.split("\t")[2]).sort();
  assert.deepEqual(touched, [...ALLOWED].sort());
});
