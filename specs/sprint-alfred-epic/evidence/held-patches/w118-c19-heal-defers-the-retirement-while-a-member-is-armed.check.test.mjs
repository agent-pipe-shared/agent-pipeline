// SPDX-License-Identifier: SUL-1.0
// Check for the held patch w118 (C19, AC-127): the patch exists, applies to the repository
// root, and touches only the named routine-repair files.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

const here = import.meta.dirname;
const repositoryRoot = resolve(here, "..", "..", "..", "..");
const patch = join(here, "w118-c19-heal-defers-the-retirement-while-a-member-is-armed.patch");
const ALLOWED = [
  "plugins/pipeline-core/lib/routine-repair.mjs",
  "plugins/pipeline-core/lib/routine-repair.test.mjs",
  "plugins/pipeline-core/scripts/routine-repair.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.mjs",
  "plugins/pipeline-core/scripts/session-authority-repair.test.mjs",
];

test("the patch exists and is non-empty", { timeout: 60_000 }, () => {
  assert.ok(existsSync(patch));
  assert.ok(statSync(patch).size > 0);
});

test("git apply --check of the patch against the repository root exits 0", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--check", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
});

test("the patch touches only the named files", { timeout: 60_000 }, () => {
  const result = spawnSync("git", ["apply", "--numstat", patch], { cwd: repositoryRoot, encoding: "utf8", shell: false });
  assert.equal(result.status, 0, result.stderr);
  const touched = result.stdout.split("\n").filter(Boolean).map((line) => line.split("\t")[2]);
  assert.ok(touched.length > 0);
  for (const path of touched) assert.ok(ALLOWED.includes(path), `unexpected file in the patch: ${path}`);
});
